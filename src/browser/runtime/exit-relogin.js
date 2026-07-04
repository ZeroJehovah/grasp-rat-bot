'use strict';

function leaveWaitDisplayCore(base, detail, formatDurationMs) {
  const summary = String(base || '').trim();
  const waitMs = Number(detail?.holdRemainingMs ?? detail?.reloginDelayMs ?? 0);
  if (!summary || !Number.isFinite(waitMs) || waitMs <= 0) return summary;
  return summary + '，等待' + formatDurationMs(waitMs);
}

function finalizeLeaveDisplayReasonCore(detail, leaveWaitDisplay) {
  if (!detail) return detail;
  const base = String(detail.summary || detail.exitSummary || detail.enemyLeaveSummary || detail.reason || '').trim();
  if (!base) return detail;
  detail.summary = base;
  detail.displayReason = leaveWaitDisplay(base, detail);
  return detail;
}

function normalizeEnemyActorCore(actor) {
  if (!actor) return null;
  const rawId = actor.user_id ?? actor.id ?? actor.targetId;
  const id = rawId !== undefined && rawId !== null && rawId !== '' ? String(rawId) : '';
  const name = String(actor.name ?? actor.targetName ?? '').trim();
  const key = id ? 'id:' + id : (name ? 'name:' + name : '');
  if (!key) return null;
  return {
    key,
    id,
    name,
    label: name || ('#' + id)
  };
}

function enemyActorFromLeaveDetailCore(detail, normalizeEnemyActor) {
  return normalizeEnemyActor(detail?.enemyActor)
    || normalizeEnemyActor(detail?.target)
    || normalizeEnemyActor(detail?.pursuit)
    || normalizeEnemyActor(detail?.injury?.nearestActive)
    || normalizeEnemyActor(detail?.injury?.nearestAvoidance)
    || normalizeEnemyActor(detail?.injury?.nearestHuman)
    || null;
}

function enemyRepeatDelayMsForCountCore(count, cfg) {
  const n = Math.max(0, Number(count) || 0);
  const secondMs = Math.max(0, Number(cfg.enemyReloginRepeatSecondMaxMs) || 0);
  const thirdMs = Math.max(secondMs, Number(cfg.enemyReloginRepeatThirdMaxMs) || 0);
  if (n >= 3) return thirdMs;
  if (n >= 2) return secondMs;
  return 0;
}

function readEnemyLeaveStreakCore(storage, key, bot, cfg, t, enemyRepeatDelayMsForCount) {
  let streak = null;
  try {
    streak = JSON.parse(storage.getItem(key) || 'null');
  } catch (_) {
    streak = null;
  }
  if (!streak || typeof streak !== 'object' || !streak.key) return null;
  const resetMs = Math.max(0, Number(cfg.enemyReloginRepeatResetMs) || 0);
  if (resetMs && t - Number(streak.at || 0) > resetMs) {
    try {
      storage.removeItem(key);
    } catch (_) {}
    if (bot.enemyLeaveStreak?.key === streak.key) bot.enemyLeaveStreak = null;
    return null;
  }
  const normalized = {
    key: String(streak.key),
    id: streak.id === undefined || streak.id === null ? '' : String(streak.id),
    name: String(streak.name || ''),
    label: String(streak.label || streak.name || (streak.id ? '#' + streak.id : '')),
    count: Math.max(1, Number(streak.count || 1)),
    firstAt: Number(streak.firstAt || streak.at || t),
    previousAt: Number(streak.previousAt || 0),
    at: Number(streak.at || t),
    resetMs
  };
  normalized.reloginMinMs = enemyRepeatDelayMsForCount(normalized.count);
  bot.enemyLeaveStreak = normalized;
  return normalized;
}

function writeEnemyLeaveStreakCore(storage, key, bot, streak) {
  bot.enemyLeaveStreak = streak;
  try {
    storage.setItem(key, JSON.stringify(streak));
  } catch (_) {}
}

function updateEnemyLeaveStreakCore(detail, t, helpers) {
  const actor = helpers.enemyActorFromLeaveDetail(detail);
  if (!actor) {
    helpers.readEnemyLeaveStreak(t);
    if (detail) detail.enemyLeaveStreak = null;
    return null;
  }
  const previous = helpers.readEnemyLeaveStreak(t);
  const same = previous && previous.key === actor.key;
  const count = same ? Number(previous.count || 1) + 1 : 1;
  const streak = {
    ...actor,
    count,
    firstAt: same ? Number(previous.firstAt || previous.at || t) : t,
    previousAt: same ? Number(previous.at || 0) : 0,
    at: t,
    resetMs: Math.max(0, Number(helpers.cfg.enemyReloginRepeatResetMs) || 0),
    reloginMinMs: helpers.enemyRepeatDelayMsForCount(count)
  };
  helpers.writeEnemyLeaveStreak(streak);
  if (detail) {
    detail.enemyActor = actor;
    detail.enemyLeaveStreak = streak;
    if (streak.reloginMinMs > 0) {
      detail.reloginRepeatDelayMs = streak.reloginMinMs;
      detail.reloginRepeatCount = streak.count;
    }
  }
  return streak;
}

function combatExitSummaryCore(reason, target, combatState = {}, helpers) {
  const cfg = helpers.cfg;
  const selfHp = Number(combatState.selfHp ?? combatState.hp ?? NaN);
  const targetHp = Number(combatState.targetHp ?? target?.hp ?? NaN);
  const hpGap = Number(combatState.hpGap ?? (Number.isFinite(targetHp) && Number.isFinite(selfHp) ? targetHp - selfHp : NaN));
  if (reason === 'combat-critical-hp-leave') {
    return '与' + helpers.actorLabel(target) + '战斗，血量' + helpers.hpDisplay(selfHp) + '低于' + cfg.combatCriticalHpLeaveThreshold + '，紧急退出';
  }
  if (reason === 'combat-hp-disadvantage-leave') {
    if (combatState?.serverStallNoDamage) {
      const noDamageText = Number.isFinite(Number(combatState.serverStallNoDamage.noDamageMs))
        ? '，' + Math.round(Number(combatState.serverStallNoDamage.noDamageMs) / 1000) + '秒未造成伤害'
        : '';
      const gapText = Number.isFinite(hpGap) ? '，差距' + helpers.hpDisplay(hpGap) : '';
      return '与' + helpers.actorLabel(target) + '战斗，服务端位置停滞下血量' + helpers.hpDisplay(selfHp) + '，对方血量' + helpers.hpDisplay(targetHp) + gapText + noDamageText + '，劣势退出';
    }
    if (combatState?.pressureDisadvantage) {
      const distanceText = Number.isFinite(Number(combatState.pressureDisadvantage.distance))
        ? '，距离' + Math.round(Number(combatState.pressureDisadvantage.distance) / 100) + '米'
        : '';
      return '与' + helpers.actorLabel(target) + '战斗，近身弹压下血量' + helpers.hpDisplay(selfHp) + '，对方血量' + helpers.hpDisplay(targetHp) + '，差距' + helpers.hpDisplay(hpGap) + distanceText + '，提前劣势退出';
    }
    if (combatState?.sustainedPressureDisadvantage) {
      const pressure = combatState.sustainedPressureDisadvantage;
      const noDamageText = Number.isFinite(Number(pressure.noDamageMs))
        ? '，' + Math.round(Number(pressure.noDamageMs) / 1000) + '秒未造成伤害'
        : '';
      const distanceText = Number.isFinite(Number(pressure.distance))
        ? '，距离' + Math.round(Number(pressure.distance) / 100) + '米'
        : '';
      return '与' + helpers.actorLabel(target) + '战斗，持续弹压下血量' + helpers.hpDisplay(selfHp) + '，对方血量' + helpers.hpDisplay(targetHp) + '，差距' + helpers.hpDisplay(hpGap) + noDamageText + distanceText + '，提前劣势退出';
    }
    if (combatState?.tradeEstimate) {
      const estimate = combatState.tradeEstimate;
      const deathText = Number.isFinite(Number(estimate.tDeathMs)) ? '，预计承伤倒计时' + helpers.formatDurationMs(estimate.tDeathMs) : '';
      const killText = Number.isFinite(Number(estimate.tKillMs)) ? '，预计击杀需' + helpers.formatDurationMs(estimate.tKillMs) : '';
      return '与' + helpers.actorLabel(target) + '战斗，交换比劣势' + deathText + killText + '，提前退出';
    }
    return '与' + helpers.actorLabel(target) + '战斗，血量' + helpers.hpDisplay(selfHp) + '，对方血量' + helpers.hpDisplay(targetHp) + '，差距' + helpers.hpDisplay(hpGap) + '，劣势退出';
  }
  if (reason === 'combat-low-hp-no-damage-leave') {
    const noDamageText = Number.isFinite(Number(combatState.noDamageMs))
      ? '，' + Math.round(Number(combatState.noDamageMs) / 1000) + '秒未造成伤害'
      : '';
    return '与' + helpers.actorLabel(target) + '战斗，血量' + helpers.hpDisplay(selfHp) + '，对方血量' + helpers.hpDisplay(targetHp) + noDamageText + '，低血久攻未中退出';
  }
  if (reason === 'combat-low-hp-leave' && combatState?.closeRisk) {
    const distanceText = Number.isFinite(Number(combatState.closeRisk.distance))
      ? '，距离' + Math.round(Number(combatState.closeRisk.distance) / 100) + '米'
      : '';
    return '与' + helpers.actorLabel(target) + '战斗，血量' + helpers.hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + helpers.hpDisplay(targetHp) + distanceText + '，低血近身风险退出';
  }
  return '与' + helpers.actorLabel(target) + '战斗，血量' + helpers.hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + helpers.hpDisplay(targetHp) + '，劣势退出';
}

function combatLeaveActionCore(reason, baseTarget, combatState = {}, cover = null, helpers) {
  const exitSummary = helpers.combatExitSummary(reason, baseTarget, combatState);
  const normalizedCover = cover ? { ...cover, target: cover.target || baseTarget } : null;
  return {
    kind: 'leave',
    reason,
    exitSummary,
    displayReason: exitSummary,
    combat: true,
    ignoreReturnBlock: true,
    dx: normalizedCover ? helpers.clamp(Math.round(Number(normalizedCover.dx) || 0), -1, 1) : 0,
    dy: normalizedCover ? helpers.clamp(Math.round(Number(normalizedCover.dy) || 0), -1, 1) : 0,
    shoot: Boolean(normalizedCover?.shoot),
    forceShoot: Boolean(normalizedCover?.forceShoot),
    shootEveryMs: normalizedCover?.shootEveryMs,
    aimTarget: normalizedCover?.aimTarget || null,
    incomingBullet: normalizedCover?.incomingBullet || null,
    target: baseTarget,
    combatCover: normalizedCover,
    combatState: {
      ...combatState,
      leaveCover: normalizedCover
    }
  };
}

function pursuitLeaveSummaryCore(pursuit, helpers) {
  const target = pursuit || {};
  const duration = Number(target.durationMs);
  const durationText = Number.isFinite(duration) && duration > 0 ? '，持续' + helpers.formatDurationMs(duration) : '';
  const distance = Number(target.distance);
  const distanceText = Number.isFinite(distance) ? '，距离' + helpers.formatDistance(distance) : '';
  return '被' + helpers.actorLabel(target) + '持续追击' + durationText + distanceText + '，退出等待重连';
}

function injuryLeaveSummaryCore(injury, helpers) {
  const actor = injury?.nearestActive || injury?.nearestAvoidance || injury?.nearestHuman || null;
  const previousHp = Number(injury?.previousHp ?? NaN);
  const currentHp = Number(injury?.currentHp ?? injury?.self?.hp ?? NaN);
  const hpText = Number.isFinite(previousHp) && Number.isFinite(currentHp)
    ? '，血量从' + helpers.hpDisplay(previousHp) + '降到' + helpers.hpDisplay(currentHp)
    : (Number.isFinite(currentHp) ? '，当前血量' + helpers.hpDisplay(currentHp) : '');
  return (actor ? '受到' + helpers.actorLabel(actor) + '伤害/附近威胁' : '检测到血量下降') + hpText + '，退出等待重连';
}

function offlineLeaveSummaryCore(reason, offlineSafety, helpers) {
  if (offlineSafety?.staminaBudgetExit) {
    return helpers.staminaBudgetCoinLeaveSummary(offlineSafety.staminaBudgetExit);
  }
  const staminaLabel = helpers.staminaExhaustedWindowLabel(offlineSafety?.staminaExhausted);
  if (staminaLabel === '1h') return '一小时体力到达限制，退出等待重连';
  if (staminaLabel === '1d') return '一天体力到达限制，退出等待重连';
  if (staminaLabel === '1h/1d') return '一小时和一天体力到达限制，退出等待重连';
  const text = String(reason || '').toLowerCase();
  if (text.includes('stamina')) return '长周期体力到达限制，退出等待重连';
  if (offlineSafety?.loginPointSafetyGate || text.includes('login point safety')) return '登录点安全快照未满足，退出等待安全重连';
  if (offlineSafety?.noSelfGameSession || text.includes('missing self')) return '已登录但自身实体不可见，退出等待重连';
  if (text.includes('combat tick gap') || offlineSafety?.combatTickGap) return '战斗主循环断档，按网络波动退出等待重连';
  if (text.includes('sampling outage') || offlineSafety?.samplingOutage) return '网络采样超时，按网络波动退出等待重连';
  if (text.includes('reconnect churn') || offlineSafety?.reconnectChurn) return '网络连接反复重连，退出等待重连';
  if (text.includes('action settlement') || offlineSafety?.actionSettlementStall) return '移动/开火结算卡死，按离线处理，退出等待重连';
  if (text.includes('server position')) return '服务端位置停止，按离线处理，退出等待重连';
  if (offlineSafety?.unsafe) return '网络连接离线且周围危险，退出等待重连';
  return '网络连接离线，退出等待重连';
}

function currentOfflineDisplayReasonCore(reason, offlineSafety, leaveResult = null, offlineDetail = null, fallback = '', helpers) {
  const currentSummary = helpers.offlineLeaveSummary(reason, offlineSafety);
  const leaveDisplay = String(leaveResult?.displayReason || '');
  const leaveSummary = String(leaveResult?.summary || leaveResult?.exitSummary || '');
  if (currentSummary && leaveDisplay && (leaveSummary === currentSummary || leaveDisplay.includes(currentSummary))) {
    return leaveDisplay;
  }
  if (currentSummary) return currentSummary;
  return leaveDisplay || String(offlineDetail?.displayReason || '') || String(fallback || '');
}

function reloginDelayForHpCore(selfLike, detail, helpers) {
  const cfg = helpers.cfg;
  const info = helpers.hpInfoForRelogin(selfLike, detail);
  const minMs = Math.max(0, Number(cfg.enemyReloginMinDelayMs ?? 0) || 0);
  const repeatMinMs = Math.max(0, Number(detail?.enemyLeaveStreak?.reloginMinMs ?? detail?.reloginRepeatDelayMs ?? 0) || 0);
  const baseMaxMs = Math.max(minMs, Number(cfg.enemyReloginMaxDelayMs ?? minMs) || 0);
  const maxMs = Math.max(baseMaxMs, repeatMinMs);
  const dangerFactor = Math.pow(1 - info.ratio, 1.35);
  const jitterMs = Math.max(0, Number(cfg.enemyReloginJitterMs) || 0);
  const hpDelayMs = helpers.clamp(
    Math.round(minMs + (maxMs - minMs) * dangerFactor + helpers.randomBetween(0, jitterMs)),
    minMs,
    maxMs
  );
  const delayMs = Math.max(hpDelayMs, repeatMinMs);
  return { delayMs, hpDelayMs, minMs, maxMs, baseMaxMs, repeatMinMs, hp: info };
}

function isExitLoginSuppressReasonCore(reason) {
  return /enemy leave|offline.*leave|combat leave|pursuit leave/i.test(String(reason || ''));
}

function unsafeExitReloginMinDelayMsCore(cfg) {
  return Math.max(0, Number(cfg.unsafeExitReloginMinDelayMs ?? 0) || 0);
}

function pendingExitSuppressReasonCore(storageReason) {
  const text = String(storageReason || '').toLowerCase();
  if (text.includes('offline')) return 'pending unsafe disconnect exit';
  if (text.includes('enemy') || text.includes('combat') || text.includes('pursuit') || text.includes('injury')) {
    return 'pending unsafe hostile exit';
  }
  return 'pending unsafe exit';
}

function startExitAuditCore(detail, meta = {}, helpers) {
  if (!detail || typeof detail !== 'object') return null;
  detail.loginSnapshotGateReset = helpers.resetLoginSnapshotGate(
    'exit-trigger:' + (meta.reason || detail.reason || ''),
    helpers.loginPointSafetyExitSelfForDetail(detail, meta, helpers.lastSelf)
  );
  helpers.ensureExitAuditDetail(detail, meta);
  const now = typeof helpers.now === 'function' ? helpers.now() : (Number(helpers.now || 0) || Date.now());
  helpers.recordExitAuditEvent('exit-trigger', detail, {
    ...meta,
    at: Number(detail.exitTriggeredAt || detail.at || now)
  });
  return detail.exitAuditId;
}

function startExitAuditBoundCore(detail, meta = {}, bot, helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || 0);
  return startExitAuditCore(detail, meta, {
    resetLoginSnapshotGate: helpers.resetLoginSnapshotGate,
    loginPointSafetyExitSelfForDetail: helpers.loginPointSafetyExitSelfForDetail,
    ensureExitAuditDetail: helpers.ensureExitAuditDetail,
    recordExitAuditEvent: helpers.recordExitAuditEvent,
    lastSelf: bot?.lastSelf,
    now: nowFn
  });
}

function setExitReloginSuppressCore(bot, storage, storageReason, reason, detail, selfLike, options = {}, helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || Date.now());
  let existingUntil = Number(options.existingUntil || 0);
  let existingReason = '';
  const minimumUntil = Math.max(0, Number(options.minimumUntil || 0) || 0);
  try {
    const storedReason = String(storage.getItem(helpers.loginSuppressReasonKey) || '');
    const storedUntil = Number(storage.getItem(helpers.loginSuppressKey) || 0) || 0;
    if (helpers.isExitLoginSuppressReason(storedReason) && storedUntil > existingUntil) {
      existingUntil = storedUntil;
      existingReason = storedReason;
    }
  } catch (_) {}
  const t = nowFn();
  const fixedDelayRaw = Number(options.fixedDelayMs ?? NaN);
  const fixedDelayMs = Number.isFinite(fixedDelayRaw) && fixedDelayRaw > 0 ? Math.max(1000, Math.round(fixedDelayRaw)) : 0;
  const delay = fixedDelayMs
    ? {
      delayMs: fixedDelayMs,
      hpDelayMs: fixedDelayMs,
      minMs: fixedDelayMs,
      maxMs: fixedDelayMs,
      baseMaxMs: fixedDelayMs,
      repeatMinMs: 0,
      hp: helpers.hpInfoForRelogin(selfLike, detail)
    }
    : helpers.reloginDelayForHp(selfLike, detail);
  const minimumDelayMs = minimumUntil > t ? Math.max(0, Math.round(minimumUntil - t)) : 0;
  const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);
  if (existingUntil > t && existingUntil >= minimumUntil && reloginDelayMs > 0) {
    const holdReason = existingReason || storageReason;
    if (storageReason === 'enemy leave' || /enemy leave|combat leave|pursuit leave/i.test(holdReason)) bot.pursuitReloginUntil = existingUntil;
    if (storageReason === 'offline leave' || /offline.*leave/i.test(holdReason)) bot.offlineReloginUntil = existingUntil;
    if (detail) {
      detail.reloginUntil = existingUntil;
      detail.holdRemainingMs = Math.max(0, Math.round(existingUntil - nowFn()));
      detail.enemyLeaveReason = reason;
      detail.loginSuppressReason = holdReason;
      detail.reusedExitSuppress = true;
      helpers.finalizeLeaveDisplayReason(detail);
      if (storageReason === 'enemy leave') {
        bot.lastEnemyLeaveResult = detail;
        bot.lastEnemyLeaveWaitMs = Number(detail.reloginDelayMs || detail.holdRemainingMs || bot.lastEnemyLeaveWaitMs || 0);
        helpers.writePersistentExitState(helpers.enemyLeaveStateKey, detail);
      } else if (storageReason === 'offline leave') {
        bot.lastOfflineLeaveResult = detail;
        bot.lastOfflineLeaveWaitMs = Number(detail.reloginDelayMs || detail.holdRemainingMs || bot.lastOfflineLeaveWaitMs || 0);
        helpers.writePersistentExitState(helpers.offlineLeaveStateKey, detail);
      }
    }
    return existingUntil;
  }
  if (storageReason === 'enemy leave') helpers.updateEnemyLeaveStreak(detail, t);
  if (!(reloginDelayMs > 0)) {
    if (storageReason === 'enemy leave') {
      bot.pursuitReloginUntil = 0;
      bot.lastEnemyLeaveWaitMs = 0;
      helpers.clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i);
    } else if (storageReason === 'offline leave') {
      bot.offlineReloginUntil = 0;
      bot.lastOfflineLeaveWaitMs = 0;
      helpers.clearLoginSuppressMatching(/offline.*leave/i);
    }
    if (detail) {
      detail.reloginDelayMs = 0;
      detail.reloginHpDelayMs = delay.hpDelayMs || 0;
      detail.reloginDelayRangeMs = {
        min: delay.minMs || 0,
        max: delay.maxMs || 0,
        baseMax: delay.baseMaxMs || 0,
        repeatMin: delay.repeatMinMs || 0
      };
      detail.reloginHp = delay.hp;
      detail.reloginUntil = 0;
      detail.holdRemainingMs = 0;
      detail.enemyLeaveReason = reason;
      detail.loginSuppressReason = '';
      detail.defensiveReloginDelaySkipped = true;
      helpers.finalizeLeaveDisplayReason(detail);
      if (storageReason === 'enemy leave') {
        bot.lastEnemyLeaveResult = detail;
        helpers.writePersistentExitState(helpers.enemyLeaveStateKey, detail);
      } else if (storageReason === 'offline leave') {
        bot.lastOfflineLeaveResult = detail;
        helpers.writePersistentExitState(helpers.offlineLeaveStateKey, detail);
      }
    }
    return 0;
  }
  const reloginUntil = helpers.setLoginSuppress(storageReason, reloginDelayMs);
  if (storageReason === 'enemy leave') {
    bot.pursuitReloginUntil = reloginUntil;
    bot.lastEnemyLeaveWaitMs = reloginDelayMs;
  } else if (storageReason === 'offline leave') {
    bot.offlineReloginUntil = reloginUntil;
    bot.lastOfflineLeaveWaitMs = reloginDelayMs;
  }
  if (detail) {
    detail.reloginDelayMs = reloginDelayMs;
    detail.reloginHpDelayMs = delay.hpDelayMs;
    detail.reloginDelayRangeMs = {
      min: delay.minMs,
      max: delay.maxMs,
      baseMax: delay.baseMaxMs,
      repeatMin: delay.repeatMinMs
    };
    if (minimumDelayMs) {
      detail.reloginMinimumDelayMs = minimumDelayMs;
      detail.reloginMinimumUntil = minimumUntil;
      detail.reloginMinimumReason = options.minimumReason || '';
    }
    if (fixedDelayMs) detail.reloginFixedDelayMs = fixedDelayMs;
    detail.reloginHp = delay.hp;
    detail.reloginUntil = reloginUntil;
    detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - nowFn()));
    detail.enemyLeaveReason = reason;
    detail.loginSuppressReason = storageReason;
    helpers.finalizeLeaveDisplayReason(detail);
    if (storageReason === 'enemy leave') {
      bot.lastEnemyLeaveResult = detail;
      helpers.writePersistentExitState(helpers.enemyLeaveStateKey, detail);
    } else if (storageReason === 'offline leave') {
      bot.lastOfflineLeaveResult = detail;
      helpers.writePersistentExitState(helpers.offlineLeaveStateKey, detail);
    }
  }
  return reloginUntil;
}

function setExitReloginSuppressBoundCore(bot, storage, storageReason, reason, detail, selfLike, options = {}, helpers) {
  return setExitReloginSuppressCore(bot, storage, storageReason, reason, detail, selfLike, options, {
    loginSuppressKey: helpers.loginSuppressKey,
    loginSuppressReasonKey: helpers.loginSuppressReasonKey,
    enemyLeaveStateKey: helpers.enemyLeaveStateKey,
    offlineLeaveStateKey: helpers.offlineLeaveStateKey,
    isExitLoginSuppressReason: isExitLoginSuppressReasonCore,
    hpInfoForRelogin: helpers.hpInfoForRelogin,
    reloginDelayForHp: helpers.reloginDelayForHp,
    updateEnemyLeaveStreak: helpers.updateEnemyLeaveStreak,
    clearLoginSuppressMatching: helpers.clearLoginSuppressMatching,
    finalizeLeaveDisplayReason: helpers.finalizeLeaveDisplayReason,
    writePersistentExitState: helpers.writePersistentExitState,
    setLoginSuppress: helpers.setLoginSuppress,
    now: helpers.now
  });
}

function primePendingUnsafeExitLoginSuppressCore(storageReason, reason, detail, selfLike = null, options = {}, helpers) {
  if (!detail || !detail.attempted) return 0;
  const fixedDelayRaw = Number(options.fixedDelayMs ?? NaN);
  const fixedDelayMs = Number.isFinite(fixedDelayRaw) && fixedDelayRaw > 0 ? Math.max(1000, Math.round(fixedDelayRaw)) : 0;
  const delay = fixedDelayMs
    ? { delayMs: fixedDelayMs, hpDelayMs: fixedDelayMs, hp: helpers.hpInfoForRelogin(selfLike, detail) }
    : helpers.reloginDelayForHp(selfLike, detail);
  const minimumDelayMs = Math.max(
    helpers.unsafeExitReloginMinDelayMs(),
    Math.max(0, Number(options.minimumDelayMs || 0) || 0)
  );
  const delayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);
  if (!(delayMs > 0)) return 0;
  const suppressReason = helpers.pendingExitSuppressReason(storageReason);
  const until = helpers.setLoginSuppress(suppressReason, delayMs);
  const now = typeof helpers.now === 'function' ? helpers.now() : (Number(helpers.now || 0) || Date.now());
  detail.pendingLoginSuppressReason = suppressReason;
  detail.pendingLoginSuppressUntil = until;
  detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - now));
  detail.pendingLoginSuppressMinimumDelayMs = minimumDelayMs;
  detail.pendingLoginSuppressHpDelayMs = delay.hpDelayMs || 0;
  detail.pendingLoginSuppressHp = delay.hp || null;
  if (reason) detail.enemyLeaveReason = detail.enemyLeaveReason || reason;
  return until;
}

function primePendingUnsafeExitLoginSuppressBoundCore(storageReason, reason, detail, selfLike = null, options = {}, helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || 0);
  return primePendingUnsafeExitLoginSuppressCore(storageReason, reason, detail, selfLike, options, {
    hpInfoForRelogin: helpers.hpInfoForRelogin,
    reloginDelayForHp: helpers.reloginDelayForHp,
    unsafeExitReloginMinDelayMs: () => unsafeExitReloginMinDelayMsCore(helpers.cfg),
    pendingExitSuppressReason: pendingExitSuppressReasonCore,
    setLoginSuppress: helpers.setLoginSuppress,
    now: nowFn
  });
}

function staminaBudgetExitHoldUntilCore(staminaBudgetExit, t, staminaBudgetReloginDelayMs) {
  if (!staminaBudgetExit) return null;
  const delayMs = staminaBudgetReloginDelayMs();
  return {
    until: t + delayMs,
    fixedDelayMs: delayMs,
    fixed: true,
    reason: 'stamina budget',
    staminaBudgetExit
  };
}

function staminaExitHoldUntilForDetailCore(detail, t, helpers) {
  const holds = [
    helpers.staminaBudgetExitHoldUntil(detail?.offlineSafety?.staminaBudgetExit, t),
    helpers.staminaResetHoldUntil(detail?.offlineSafety?.staminaExhausted, t)
  ].filter(Boolean);
  if (!holds.length) return null;
  return holds.sort((a, b) => Number(b.until || 0) - Number(a.until || 0))[0] || null;
}

function staminaExitHoldUntilForDetailBoundCore(detail, t, helpers) {
  return staminaExitHoldUntilForDetailCore(detail, t, {
    staminaBudgetExitHoldUntil: (staminaBudgetExit, at) => staminaBudgetExitHoldUntilCore(
      staminaBudgetExit,
      at,
      helpers.staminaBudgetReloginDelayMs
    ),
    staminaResetHoldUntil: helpers.staminaResetHoldUntil
  });
}

function offlineExitRequiresUnsafeReloginDelayCore(reason, offlineSafety) {
  if (!offlineSafety) return false;
  if (offlineSafety.unsafe || offlineSafety.reconnectChurn || offlineSafety.noSelfGameSession || offlineSafety.staminaExhausted || offlineSafety.samplingOutage || offlineSafety.combatTickGap) return true;
  const text = String(reason || '').toLowerCase();
  return text.includes('reconnect churn') || text.includes('server position') || text.includes('stamina') || text.includes('missing self') || text.includes('sampling outage') || text.includes('combat tick gap');
}

function enemyReloginHoldRemainingMsCore(bot, storage, helpers) {
  const now = Number(helpers.now || 0) || 0;
  let until = Number(bot.pursuitReloginUntil || 0);
  const persistent = helpers.readPersistentExitState(helpers.enemyLeaveStateKey);
  if (Number(persistent?.reloginUntil || 0) > until) {
    until = Number(persistent.reloginUntil);
    bot.pursuitReloginUntil = until;
    bot.lastEnemyLeaveResult = persistent;
  }
  try {
    const suppressUntil = Number(storage.getItem(helpers.loginSuppressKey) || 0) || 0;
    const suppressReason = String(storage.getItem(helpers.loginSuppressReasonKey) || '');
    if ((suppressReason === 'enemy leave' || suppressReason === 'pursuit leave' || suppressReason === 'combat leave') && suppressUntil > until) {
      until = suppressUntil;
      bot.pursuitReloginUntil = suppressUntil;
    }
  } catch (_) {}
  const remaining = Math.max(0, until - now);
  if (!remaining && bot.pursuitReloginUntil) {
    bot.pursuitReloginUntil = 0;
  }
  return Math.round(remaining);
}

function offlineReloginHoldRemainingMsCore(bot, storage, helpers) {
  const now = Number(helpers.now || 0) || 0;
  let until = Number(bot.offlineReloginUntil || 0);
  const persistent = helpers.readPersistentExitState(helpers.offlineLeaveStateKey);
  if (Number(persistent?.reloginUntil || 0) > until) {
    until = Number(persistent.reloginUntil);
    bot.offlineReloginUntil = until;
    bot.lastOfflineLeaveResult = persistent;
  }
  if (until > now && helpers.staleOfflineStaminaHoldContradicted(bot.lastOfflineLeaveResult || persistent)) {
    helpers.clearOfflineReloginHold('stale stamina hold contradicted by known stamina');
    return 0;
  }
  try {
    const suppressUntil = Number(storage.getItem(helpers.loginSuppressKey) || 0) || 0;
    const suppressReason = String(storage.getItem(helpers.loginSuppressReasonKey) || '');
    if (/offline.*leave/i.test(suppressReason) && suppressUntil > until) {
      until = suppressUntil;
      bot.offlineReloginUntil = suppressUntil;
    }
  } catch (_) {}
  if (until > now && helpers.staleOfflineStaminaHoldContradicted(bot.lastOfflineLeaveResult || persistent)) {
    helpers.clearOfflineReloginHold('stale offline suppress contradicted by known stamina');
    return 0;
  }
  const remaining = Math.max(0, until - now);
  if (!remaining && bot.offlineReloginUntil) {
    bot.offlineReloginUntil = 0;
  }
  return Math.round(remaining);
}

function clearLoginSuppressMatchingCore(storage, suppressKey, suppressReasonKey, pattern) {
  try {
    const suppressReason = String(storage.getItem(suppressReasonKey) || '');
    if (!pattern.test(suppressReason)) return false;
    storage.removeItem(suppressKey);
    storage.removeItem(suppressReasonKey);
    return true;
  } catch (_) {
    return false;
  }
}

function enemyReloginHoldRemainingMsBoundCore(bot, storage, helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || 0);
  return enemyReloginHoldRemainingMsCore(bot, storage, {
    loginSuppressKey: helpers.loginSuppressKey,
    loginSuppressReasonKey: helpers.loginSuppressReasonKey,
    readPersistentExitState: helpers.readPersistentExitState,
    enemyLeaveStateKey: helpers.enemyLeaveStateKey,
    now: nowFn()
  });
}

function offlineReloginHoldRemainingMsBoundCore(bot, storage, helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || 0);
  return offlineReloginHoldRemainingMsCore(bot, storage, {
    loginSuppressKey: helpers.loginSuppressKey,
    loginSuppressReasonKey: helpers.loginSuppressReasonKey,
    readPersistentExitState: helpers.readPersistentExitState,
    offlineLeaveStateKey: helpers.offlineLeaveStateKey,
    staleOfflineStaminaHoldContradicted: helpers.staleOfflineStaminaHoldContradicted,
    clearOfflineReloginHold: helpers.clearOfflineReloginHold,
    now: nowFn()
  });
}

function clearLoginSuppressMatchingBoundCore(storage, pattern, helpers) {
  return clearLoginSuppressMatchingCore(
    storage,
    helpers.loginSuppressKey,
    helpers.loginSuppressReasonKey,
    pattern
  );
}

function setOfflineLeaveSuppressCore(bot, reason, detail, selfLike = null, options = {}, helpers) {
  const now = Number(helpers.now || 0) || 0;
  const staminaHold = helpers.staminaExitHoldUntilForDetail(detail);
  if (staminaHold && detail) {
    if (staminaHold.staminaBudgetExit) detail.staminaBudgetHold = staminaHold;
    else detail.staminaReset = staminaHold;
  }
  if (!staminaHold && !(Number(options.minimumUntil || 0) > now)) {
    const unsafeOfflineExit = helpers.offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null);
    bot.offlineReloginUntil = 0;
    bot.lastOfflineLeaveWaitMs = 0;
    if (detail) {
      detail.reloginUntil = 0;
      detail.holdRemainingMs = 0;
      detail.reloginDelayMs = 0;
      detail.safeReloginAllowed = !unsafeOfflineExit;
      if (unsafeOfflineExit) detail.defensiveReloginDelaySkipped = true;
      detail.loginSuppressReason = '';
      helpers.finalizeLeaveDisplayReason(detail);
      bot.lastOfflineLeaveResult = detail;
      helpers.writePersistentExitState(helpers.offlineLeaveStateKey, detail);
    }
    return 0;
  }
  return helpers.setExitReloginSuppress('offline leave', reason, detail, selfLike, {
    existingUntil: bot.offlineReloginUntil,
    minimumUntil: Math.max(Number(options.minimumUntil || 0) || 0, staminaHold?.until || 0),
    minimumReason: options.minimumReason || staminaHold?.reason || (staminaHold ? 'stamina reset' : ''),
    fixedDelayMs: staminaHold?.fixed ? staminaHold.fixedDelayMs : 0
  });
}

function setOfflineLeaveSuppressBoundCore(bot, storage, reason, detail, selfLike = null, options = {}, helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || 0);
  return setOfflineLeaveSuppressCore(bot, reason, detail, selfLike, options, {
    now: nowFn(),
    staminaExitHoldUntilForDetail: holdDetail => staminaExitHoldUntilForDetailBoundCore(holdDetail, nowFn(), {
      staminaBudgetReloginDelayMs: helpers.staminaBudgetReloginDelayMs,
      staminaResetHoldUntil: helpers.staminaResetHoldUntil
    }),
    offlineExitRequiresUnsafeReloginDelay: offlineExitRequiresUnsafeReloginDelayCore,
    finalizeLeaveDisplayReason: helpers.finalizeLeaveDisplayReason,
    writePersistentExitState: helpers.writePersistentExitState,
    setExitReloginSuppress: (storageReason, suppressReason, suppressDetail, suppressSelfLike, suppressOptions) => setExitReloginSuppressBoundCore(
      bot,
      storage,
      storageReason,
      suppressReason,
      suppressDetail,
      suppressSelfLike,
      suppressOptions,
      helpers
    ),
    offlineLeaveStateKey: helpers.offlineLeaveStateKey
  });
}

function primePendingStaminaExitLoginSuppressCore(detail, helpers) {
  const now = Number(helpers.now || 0) || 0;
  const hold = helpers.staminaExitHoldUntilForDetail(detail);
  if (!hold) return 0;
  const delayMs = hold.fixed
    ? hold.fixedDelayMs
    : Math.max(1000, Math.round(Number(hold.until || 0) - now));
  const until = helpers.setLoginSuppress('stamina leave pending', delayMs);
  if (detail) {
    detail.pendingLoginSuppressUntil = until;
    detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - now));
    if (hold.staminaBudgetExit) detail.staminaBudgetHold = hold;
    else detail.staminaReset = hold;
  }
  return until;
}

function primePendingStaminaExitLoginSuppressBoundCore(detail, helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || 0);
  return primePendingStaminaExitLoginSuppressCore(detail, {
    now: nowFn(),
    staminaExitHoldUntilForDetail: holdDetail => staminaExitHoldUntilForDetailBoundCore(holdDetail, nowFn(), {
      staminaBudgetReloginDelayMs: helpers.staminaBudgetReloginDelayMs,
      staminaResetHoldUntil: helpers.staminaResetHoldUntil
    }),
    setLoginSuppress: helpers.setLoginSuppress
  });
}

function clearEnemyReloginHoldCore(bot, reason = 'online self restored', helpers) {
  const t = Number(helpers.now || 0) || 0;
  const details = [
    helpers.activeEnemyLeaveDetail(t),
    bot.lastEnemyLeaveResult,
    bot.lastPursuitLeaveResult,
    bot.lastCombatLeaveResult,
    bot.lastInjuryLeaveResult
  ].filter(Boolean);
  bot.pursuitReloginUntil = 0;
  bot.lastEnemyLeaveWaitMs = 0;
  bot.pendingExit = bot.pendingExit?.scope === 'offline' ? bot.pendingExit : null;
  if (bot.pendingExit) helpers.writePersistentPendingExitState(bot.pendingExit);
  else helpers.clearPersistentPendingExitState();
  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    detail.onlineRecoveryAt = t;
    detail.onlineRecoveryReason = String(reason || 'online self restored');
    helpers.clearExitHoldDetail(detail, reason, t);
  }
  bot.lastEnemyLeaveResult = null;
  bot.lastPursuitLeaveResult = null;
  bot.lastCombatLeaveResult = null;
  bot.lastInjuryLeaveResult = null;
  helpers.clearPersistentExitState(helpers.enemyLeaveStateKey);
  helpers.clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i);
}

function clearOfflineReloginHoldCore(bot, reason = 'online self restored', helpers) {
  const t = Number(helpers.now || 0) || 0;
  bot.offlineReloginUntil = 0;
  bot.lastOfflineLeaveWaitMs = 0;
  bot.pendingExit = bot.pendingExit?.scope === 'offline' ? null : bot.pendingExit;
  if (bot.pendingExit) helpers.writePersistentPendingExitState(bot.pendingExit);
  else helpers.clearPersistentPendingExitState();
  if (bot.lastOfflineLeaveResult && typeof bot.lastOfflineLeaveResult === 'object') {
    bot.lastOfflineLeaveResult.onlineRecoveryAt = t;
    bot.lastOfflineLeaveResult.onlineRecoveryReason = String(reason || 'online self restored');
    bot.lastOfflineLeaveResult.reloginUntil = 0;
    bot.lastOfflineLeaveResult.holdRemainingMs = 0;
    bot.lastOfflineLeaveResult.reloginDelayMs = 0;
  }
  bot.lastOfflineLeaveResult = null;
  helpers.clearPersistentExitState(helpers.offlineLeaveStateKey);
  helpers.clearLoginSuppressMatching(/offline.*leave/i);
}

function clearEnemyReloginHoldBoundCore(bot, storage, reason = 'online self restored', helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || 0);
  return clearEnemyReloginHoldCore(bot, reason, {
    now: nowFn(),
    activeEnemyLeaveDetail: helpers.activeEnemyLeaveDetail,
    writePersistentPendingExitState: helpers.writePersistentPendingExitState,
    clearPersistentPendingExitState: helpers.clearPersistentPendingExitState,
    clearExitHoldDetail: helpers.clearExitHoldDetail,
    clearPersistentExitState: helpers.clearPersistentExitState,
    clearLoginSuppressMatching: pattern => clearLoginSuppressMatchingBoundCore(storage, pattern, {
      loginSuppressKey: helpers.loginSuppressKey,
      loginSuppressReasonKey: helpers.loginSuppressReasonKey
    }),
    enemyLeaveStateKey: helpers.enemyLeaveStateKey
  });
}

function clearOfflineReloginHoldBoundCore(bot, storage, reason = 'online self restored', helpers) {
  const nowFn = typeof helpers.now === 'function' ? helpers.now : () => (Number(helpers.now || 0) || 0);
  return clearOfflineReloginHoldCore(bot, reason, {
    now: nowFn(),
    writePersistentPendingExitState: helpers.writePersistentPendingExitState,
    clearPersistentPendingExitState: helpers.clearPersistentPendingExitState,
    clearPersistentExitState: helpers.clearPersistentExitState,
    clearLoginSuppressMatching: pattern => clearLoginSuppressMatchingBoundCore(storage, pattern, {
      loginSuppressKey: helpers.loginSuppressKey,
      loginSuppressReasonKey: helpers.loginSuppressReasonKey
    }),
    offlineLeaveStateKey: helpers.offlineLeaveStateKey
  });
}

module.exports = {
  leaveWaitDisplayCore,
  finalizeLeaveDisplayReasonCore,
  normalizeEnemyActorCore,
  enemyActorFromLeaveDetailCore,
  enemyRepeatDelayMsForCountCore,
  readEnemyLeaveStreakCore,
  writeEnemyLeaveStreakCore,
  updateEnemyLeaveStreakCore,
  combatExitSummaryCore,
  combatLeaveActionCore,
  pursuitLeaveSummaryCore,
  injuryLeaveSummaryCore,
  offlineLeaveSummaryCore,
  currentOfflineDisplayReasonCore,
  reloginDelayForHpCore,
  isExitLoginSuppressReasonCore,
  unsafeExitReloginMinDelayMsCore,
  pendingExitSuppressReasonCore,
  startExitAuditCore,
  startExitAuditBoundCore,
  setExitReloginSuppressCore,
  setExitReloginSuppressBoundCore,
  primePendingUnsafeExitLoginSuppressCore,
  primePendingUnsafeExitLoginSuppressBoundCore,
  staminaBudgetExitHoldUntilCore,
  staminaExitHoldUntilForDetailCore,
  staminaExitHoldUntilForDetailBoundCore,
  offlineExitRequiresUnsafeReloginDelayCore,
  enemyReloginHoldRemainingMsCore,
  offlineReloginHoldRemainingMsCore,
  clearLoginSuppressMatchingCore,
  enemyReloginHoldRemainingMsBoundCore,
  offlineReloginHoldRemainingMsBoundCore,
  clearLoginSuppressMatchingBoundCore,
  setOfflineLeaveSuppressCore,
  setOfflineLeaveSuppressBoundCore,
  primePendingStaminaExitLoginSuppressCore,
  primePendingStaminaExitLoginSuppressBoundCore,
  clearEnemyReloginHoldCore,
  clearOfflineReloginHoldCore,
  clearEnemyReloginHoldBoundCore,
  clearOfflineReloginHoldBoundCore
};
