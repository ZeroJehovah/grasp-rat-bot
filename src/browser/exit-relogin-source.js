'use strict';

function exitReloginDisplayInlineSource() {
  return String.raw`	  function leaveWaitDisplay(base, detail) {
	    const summary = String(base || '').trim();
	    const waitMs = Number(detail?.holdRemainingMs ?? detail?.reloginDelayMs ?? 0);
	    if (!summary || !Number.isFinite(waitMs) || waitMs <= 0) return summary;
    return summary + '，等待' + formatDurationMs(waitMs);
  }

  function finalizeLeaveDisplayReason(detail) {
    if (!detail) return detail;
    const base = String(detail.summary || detail.exitSummary || detail.enemyLeaveSummary || detail.reason || '').trim();
    if (!base) return detail;
    detail.summary = base;
    detail.displayReason = leaveWaitDisplay(base, detail);
    return detail;
  }
`;
}

function bundledExitReloginDisplaySource() {
  return `	  const {
	    leaveWaitDisplayCore,
	    finalizeLeaveDisplayReasonCore
	  } = require('./src/browser/runtime/exit-relogin');

	  function leaveWaitDisplay(base, detail) {
	    return leaveWaitDisplayCore(base, detail, formatDurationMs);
	  }

	  function finalizeLeaveDisplayReason(detail) {
	    return finalizeLeaveDisplayReasonCore(detail, leaveWaitDisplay);
	  }
`;
}

function exitReloginActorInlineSource() {
  return String.raw`
  function normalizeEnemyActor(actor) {
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

  function enemyActorFromLeaveDetail(detail) {
    return normalizeEnemyActor(detail?.enemyActor)
      || normalizeEnemyActor(detail?.target)
      || normalizeEnemyActor(detail?.pursuit)
      || normalizeEnemyActor(detail?.injury?.nearestActive)
      || normalizeEnemyActor(detail?.injury?.nearestAvoidance)
      || normalizeEnemyActor(detail?.injury?.nearestHuman)
      || null;
  }

  function enemyRepeatDelayMsForCount(count) {
    const n = Math.max(0, Number(count) || 0);
    const secondMs = Math.max(0, Number(cfg.enemyReloginRepeatSecondMaxMs) || 0);
    const thirdMs = Math.max(secondMs, Number(cfg.enemyReloginRepeatThirdMaxMs) || 0);
    if (n >= 3) return thirdMs;
    if (n >= 2) return secondMs;
    return 0;
  }
`;
}

function bundledExitReloginActorSource() {
  return `	  const {
	    normalizeEnemyActorCore,
	    enemyActorFromLeaveDetailCore,
	    enemyRepeatDelayMsForCountCore
	  } = require('./src/browser/runtime/exit-relogin');

	  function normalizeEnemyActor(actor) {
	    return normalizeEnemyActorCore(actor);
	  }

	  function enemyActorFromLeaveDetail(detail) {
	    return enemyActorFromLeaveDetailCore(detail, normalizeEnemyActor);
	  }

	  function enemyRepeatDelayMsForCount(count) {
	    return enemyRepeatDelayMsForCountCore(count, cfg);
	  }
`;
}

function exitReloginStreakInlineSource() {
  return String.raw`
  function readEnemyLeaveStreak(t = Date.now()) {
    let streak = null;
    try {
      streak = JSON.parse(localStorage.getItem(ENEMY_LEAVE_STREAK_KEY) || 'null');
    } catch (_) {
      streak = null;
    }
    if (!streak || typeof streak !== 'object' || !streak.key) return null;
    const resetMs = Math.max(0, Number(cfg.enemyReloginRepeatResetMs) || 0);
    if (resetMs && t - Number(streak.at || 0) > resetMs) {
      try {
        localStorage.removeItem(ENEMY_LEAVE_STREAK_KEY);
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

  function writeEnemyLeaveStreak(streak) {
    bot.enemyLeaveStreak = streak;
    try {
      localStorage.setItem(ENEMY_LEAVE_STREAK_KEY, JSON.stringify(streak));
    } catch (_) {}
  }

	  function updateEnemyLeaveStreak(detail, t = Date.now()) {
	    const actor = enemyActorFromLeaveDetail(detail);
	    if (!actor) {
	      readEnemyLeaveStreak(t);
	      if (detail) detail.enemyLeaveStreak = null;
	      return null;
	    }
    const previous = readEnemyLeaveStreak(t);
    const same = previous && previous.key === actor.key;
    const count = same ? Number(previous.count || 1) + 1 : 1;
    const streak = {
      ...actor,
      count,
      firstAt: same ? Number(previous.firstAt || previous.at || t) : t,
      previousAt: same ? Number(previous.at || 0) : 0,
      at: t,
      resetMs: Math.max(0, Number(cfg.enemyReloginRepeatResetMs) || 0),
      reloginMinMs: enemyRepeatDelayMsForCount(count)
    };
    writeEnemyLeaveStreak(streak);
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
`;
}

function bundledExitReloginStreakSource() {
  return `	  const {
	    readEnemyLeaveStreakCore,
	    writeEnemyLeaveStreakCore,
	    updateEnemyLeaveStreakCore
	  } = require('./src/browser/runtime/exit-relogin');

	  function readEnemyLeaveStreak(t = Date.now()) {
	    return readEnemyLeaveStreakCore(localStorage, ENEMY_LEAVE_STREAK_KEY, bot, cfg, t, enemyRepeatDelayMsForCount);
	  }

	  function writeEnemyLeaveStreak(streak) {
	    return writeEnemyLeaveStreakCore(localStorage, ENEMY_LEAVE_STREAK_KEY, bot, streak);
	  }

\t  function updateEnemyLeaveStreak(detail, t = Date.now()) {
\t    return updateEnemyLeaveStreakCore(detail, t, {
\t      cfg,
\t      enemyActorFromLeaveDetail,
\t      readEnemyLeaveStreak,
\t      writeEnemyLeaveStreak,
\t      enemyRepeatDelayMsForCount
\t    });
\t  }
`;
}

function exitReloginSummaryInlineSource() {
  return String.raw`
  function combatExitSummary(reason, target, combatState = {}) {
    const selfHp = Number(combatState.selfHp ?? combatState.hp ?? NaN);
    const targetHp = Number(combatState.targetHp ?? target?.hp ?? NaN);
    const hpGap = Number(combatState.hpGap ?? (Number.isFinite(targetHp) && Number.isFinite(selfHp) ? targetHp - selfHp : NaN));
    if (reason === 'combat-critical-hp-leave') {
      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '低于' + cfg.combatCriticalHpLeaveThreshold + '，紧急退出';
    }
    if (reason === 'combat-hp-disadvantage-leave') {
      if (combatState?.serverStallNoDamage) {
        const noDamageText = Number.isFinite(Number(combatState.serverStallNoDamage.noDamageMs))
          ? '，' + Math.round(Number(combatState.serverStallNoDamage.noDamageMs) / 1000) + '秒未造成伤害'
          : '';
        const gapText = Number.isFinite(hpGap) ? '，差距' + hpDisplay(hpGap) : '';
        return '与' + actorLabel(target) + '战斗，服务端位置停滞下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + gapText + noDamageText + '，劣势退出';
      }
      if (combatState?.pressureDisadvantage) {
        const distanceText = Number.isFinite(Number(combatState.pressureDisadvantage.distance))
          ? '，距离' + Math.round(Number(combatState.pressureDisadvantage.distance) / 100) + '米'
          : '';
	        return '与' + actorLabel(target) + '战斗，近身弹压下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + distanceText + '，提前劣势退出';
	      }
	      if (combatState?.sustainedPressureDisadvantage) {
	        const pressure = combatState.sustainedPressureDisadvantage;
	        const noDamageText = Number.isFinite(Number(pressure.noDamageMs))
	          ? '，' + Math.round(Number(pressure.noDamageMs) / 1000) + '秒未造成伤害'
	          : '';
	        const distanceText = Number.isFinite(Number(pressure.distance))
	          ? '，距离' + Math.round(Number(pressure.distance) / 100) + '米'
	          : '';
	        return '与' + actorLabel(target) + '战斗，持续弹压下血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + noDamageText + distanceText + '，提前劣势退出';
	      }
	      if (combatState?.tradeEstimate) {
	        const estimate = combatState.tradeEstimate;
	        const deathText = Number.isFinite(Number(estimate.tDeathMs)) ? '，预计承伤倒计时' + formatDurationMs(estimate.tDeathMs) : '';
	        const killText = Number.isFinite(Number(estimate.tKillMs)) ? '，预计击杀需' + formatDurationMs(estimate.tKillMs) : '';
	        return '与' + actorLabel(target) + '战斗，交换比劣势' + deathText + killText + '，提前退出';
	      }
	      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + '，差距' + hpDisplay(hpGap) + '，劣势退出';
	    }
    if (reason === 'combat-low-hp-no-damage-leave') {
      const noDamageText = Number.isFinite(Number(combatState.noDamageMs))
        ? '，' + Math.round(Number(combatState.noDamageMs) / 1000) + '秒未造成伤害'
        : '';
	      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '，对方血量' + hpDisplay(targetHp) + noDamageText + '，低血久攻未中退出';
    }
    if (reason === 'combat-low-hp-leave' && combatState?.closeRisk) {
      const distanceText = Number.isFinite(Number(combatState.closeRisk.distance))
        ? '，距离' + Math.round(Number(combatState.closeRisk.distance) / 100) + '米'
        : '';
	      return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + hpDisplay(targetHp) + distanceText + '，低血近身风险退出';
	    }
	    return '与' + actorLabel(target) + '战斗，血量' + hpDisplay(selfHp) + '不足' + cfg.combatLowHpLeaveThreshold + '，对方血量' + hpDisplay(targetHp) + '，劣势退出';
  }

  function combatLeaveAction(reason, baseTarget, combatState = {}, cover = null) {
    const exitSummary = combatExitSummary(reason, baseTarget, combatState);
    const normalizedCover = cover ? { ...cover, target: cover.target || baseTarget } : null;
    return {
      kind: 'leave',
      reason,
      exitSummary,
      displayReason: exitSummary,
      combat: true,
      ignoreReturnBlock: true,
      dx: normalizedCover ? clamp(Math.round(Number(normalizedCover.dx) || 0), -1, 1) : 0,
      dy: normalizedCover ? clamp(Math.round(Number(normalizedCover.dy) || 0), -1, 1) : 0,
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

  function pursuitLeaveSummary(pursuit) {
    const target = pursuit || {};
    const duration = Number(target.durationMs);
    const durationText = Number.isFinite(duration) && duration > 0 ? '，持续' + formatDurationMs(duration) : '';
    const distance = Number(target.distance);
    const distanceText = Number.isFinite(distance) ? '，距离' + formatDistance(distance) : '';
    return '被' + actorLabel(target) + '持续追击' + durationText + distanceText + '，退出等待重连';
  }

	  function injuryLeaveSummary(injury) {
	    const actor = injury?.nearestActive || injury?.nearestAvoidance || injury?.nearestHuman || null;
	    const previousHp = Number(injury?.previousHp ?? NaN);
    const currentHp = Number(injury?.currentHp ?? injury?.self?.hp ?? NaN);
    const hpText = Number.isFinite(previousHp) && Number.isFinite(currentHp)
      ? '，血量从' + hpDisplay(previousHp) + '降到' + hpDisplay(currentHp)
      : (Number.isFinite(currentHp) ? '，当前血量' + hpDisplay(currentHp) : '');
	    return (actor ? '受到' + actorLabel(actor) + '伤害/附近威胁' : '检测到血量下降') + hpText + '，退出等待重连';
	  }

			  function offlineLeaveSummary(reason, offlineSafety) {
			    if (offlineSafety?.staminaBudgetExit) {
			      return staminaBudgetCoinLeaveSummary(offlineSafety.staminaBudgetExit);
			    }
			    const staminaLabel = staminaExhaustedWindowLabel(offlineSafety?.staminaExhausted);
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

		  function currentOfflineDisplayReason(reason, offlineSafety, leaveResult = null, offlineDetail = null, fallback = '') {
		    const currentSummary = offlineLeaveSummary(reason, offlineSafety);
		    const leaveDisplay = String(leaveResult?.displayReason || '');
		    const leaveSummary = String(leaveResult?.summary || leaveResult?.exitSummary || '');
		    if (currentSummary && leaveDisplay && (leaveSummary === currentSummary || leaveDisplay.includes(currentSummary))) {
		      return leaveDisplay;
		    }
		    if (currentSummary) return currentSummary;
		    return leaveDisplay || String(offlineDetail?.displayReason || '') || String(fallback || '');
		  }

	  function reloginDelayForHp(selfLike, detail) {
	    const info = hpInfoForRelogin(selfLike, detail);
	    const minMs = Math.max(0, Number(cfg.enemyReloginMinDelayMs ?? 0) || 0);
    const repeatMinMs = Math.max(0, Number(detail?.enemyLeaveStreak?.reloginMinMs ?? detail?.reloginRepeatDelayMs ?? 0) || 0);
    const baseMaxMs = Math.max(minMs, Number(cfg.enemyReloginMaxDelayMs ?? minMs) || 0);
	    const maxMs = Math.max(baseMaxMs, repeatMinMs);
	    const dangerFactor = Math.pow(1 - info.ratio, 1.35);
	    const jitterMs = Math.max(0, Number(cfg.enemyReloginJitterMs) || 0);
	    const hpDelayMs = clamp(
	      Math.round(minMs + (maxMs - minMs) * dangerFactor + randomBetween(0, jitterMs)),
	      minMs,
	      maxMs
	    );
    const delayMs = Math.max(hpDelayMs, repeatMinMs);
	    return { delayMs, hpDelayMs, minMs, maxMs, baseMaxMs, repeatMinMs, hp: info };
	  }
`;
}

function bundledExitReloginSummarySource() {
  return `	  const {
\t    combatExitSummaryCore,
\t    combatLeaveActionCore,
\t    pursuitLeaveSummaryCore,
\t    injuryLeaveSummaryCore,
\t    offlineLeaveSummaryCore,
\t    currentOfflineDisplayReasonCore,
\t    reloginDelayForHpCore
\t  } = require('./src/browser/runtime/exit-relogin');

\t  function combatExitSummary(reason, target, combatState = {}) {
\t    return combatExitSummaryCore(reason, target, combatState, { cfg, actorLabel, hpDisplay, formatDurationMs });
\t  }

\t  function combatLeaveAction(reason, baseTarget, combatState = {}, cover = null) {
\t    return combatLeaveActionCore(reason, baseTarget, combatState, cover, { combatExitSummary, clamp });
\t  }

\t  function pursuitLeaveSummary(pursuit) {
\t    return pursuitLeaveSummaryCore(pursuit, { actorLabel, formatDurationMs, formatDistance });
\t  }

\t  function injuryLeaveSummary(injury) {
\t    return injuryLeaveSummaryCore(injury, { actorLabel, hpDisplay });
\t  }

\t  function offlineLeaveSummary(reason, offlineSafety) {
\t    return offlineLeaveSummaryCore(reason, offlineSafety, { staminaBudgetCoinLeaveSummary, staminaExhaustedWindowLabel });
\t  }

\t  function currentOfflineDisplayReason(reason, offlineSafety, leaveResult = null, offlineDetail = null, fallback = '') {
\t    return currentOfflineDisplayReasonCore(reason, offlineSafety, leaveResult, offlineDetail, fallback, { offlineLeaveSummary });
\t  }

\t  function reloginDelayForHp(selfLike, detail) {
\t    return reloginDelayForHpCore(selfLike, detail, { cfg, hpInfoForRelogin, randomBetween, clamp });
\t  }
`;
}

function exitReloginHoldInlineSource() {
  return String.raw`
  function isExitLoginSuppressReason(reason) {
    return /enemy leave|offline.*leave|combat leave|pursuit leave/i.test(String(reason || ''));
  }

  function setExitReloginSuppress(storageReason, reason, detail, selfLike, options = {}) {
    let existingUntil = Number(options.existingUntil || 0);
    let existingReason = '';
    const minimumUntil = Math.max(0, Number(options.minimumUntil || 0) || 0);
    try {
      const storedReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      const storedUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      if (isExitLoginSuppressReason(storedReason) && storedUntil > existingUntil) {
        existingUntil = storedUntil;
        existingReason = storedReason;
      }
    } catch (_) {}
    const t = Date.now();
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
	        hp: hpInfoForRelogin(selfLike, detail)
	      }
	      : reloginDelayForHp(selfLike, detail);
	    const minimumDelayMs = minimumUntil > t ? Math.max(0, Math.round(minimumUntil - t)) : 0;
	    const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);
	    if (existingUntil > t && existingUntil >= minimumUntil && reloginDelayMs > 0) {
	      const holdReason = existingReason || storageReason;
	      if (storageReason === 'enemy leave' || /enemy leave|combat leave|pursuit leave/i.test(holdReason)) bot.pursuitReloginUntil = existingUntil;
	      if (storageReason === 'offline leave' || /offline.*leave/i.test(holdReason)) bot.offlineReloginUntil = existingUntil;
		      if (detail) {
		        detail.reloginUntil = existingUntil;
		        detail.holdRemainingMs = Math.max(0, Math.round(existingUntil - Date.now()));
		        detail.enemyLeaveReason = reason;
		        detail.loginSuppressReason = holdReason;
		        detail.reusedExitSuppress = true;
		        finalizeLeaveDisplayReason(detail);
		        if (storageReason === 'enemy leave') {
		          bot.lastEnemyLeaveResult = detail;
		          bot.lastEnemyLeaveWaitMs = Number(detail.reloginDelayMs || detail.holdRemainingMs || bot.lastEnemyLeaveWaitMs || 0);
		          writePersistentExitState(ENEMY_LEAVE_STATE_KEY, detail);
		        } else if (storageReason === 'offline leave') {
		          bot.lastOfflineLeaveResult = detail;
		          bot.lastOfflineLeaveWaitMs = Number(detail.reloginDelayMs || detail.holdRemainingMs || bot.lastOfflineLeaveWaitMs || 0);
		          writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
		        }
		      }
		      return existingUntil;
		    }
	    if (storageReason === 'enemy leave') updateEnemyLeaveStreak(detail, t);
	    if (!(reloginDelayMs > 0)) {
	      if (storageReason === 'enemy leave') {
	        bot.pursuitReloginUntil = 0;
	        bot.lastEnemyLeaveWaitMs = 0;
	        clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i);
	      } else if (storageReason === 'offline leave') {
	        bot.offlineReloginUntil = 0;
	        bot.lastOfflineLeaveWaitMs = 0;
	        clearLoginSuppressMatching(/offline.*leave/i);
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
	        finalizeLeaveDisplayReason(detail);
	        if (storageReason === 'enemy leave') {
	          bot.lastEnemyLeaveResult = detail;
	          writePersistentExitState(ENEMY_LEAVE_STATE_KEY, detail);
	        } else if (storageReason === 'offline leave') {
	          bot.lastOfflineLeaveResult = detail;
	          writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
	        }
	      }
	      return 0;
	    }
	    const reloginUntil = setLoginSuppress(storageReason, reloginDelayMs);
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
	      detail.holdRemainingMs = Math.max(0, Math.round(reloginUntil - Date.now()));
		      detail.enemyLeaveReason = reason;
		      detail.loginSuppressReason = storageReason;
		      finalizeLeaveDisplayReason(detail);
		      if (storageReason === 'enemy leave') {
		        bot.lastEnemyLeaveResult = detail;
		        writePersistentExitState(ENEMY_LEAVE_STATE_KEY, detail);
		      } else if (storageReason === 'offline leave') {
		        bot.lastOfflineLeaveResult = detail;
		        writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
		      }
		    }
    return reloginUntil;
  }

  function unsafeExitReloginMinDelayMs() {
    return Math.max(0, Number(cfg.unsafeExitReloginMinDelayMs ?? 0) || 0);
  }

  function pendingExitSuppressReason(storageReason) {
    const text = String(storageReason || '').toLowerCase();
    if (text.includes('offline')) return 'pending unsafe disconnect exit';
    if (text.includes('enemy') || text.includes('combat') || text.includes('pursuit') || text.includes('injury')) {
      return 'pending unsafe hostile exit';
    }
    return 'pending unsafe exit';
  }

	  function startExitAudit(detail, meta = {}) {
	    if (!detail || typeof detail !== 'object') return null;
	    detail.loginSnapshotGateReset = resetLoginSnapshotGate(
	      'exit-trigger:' + (meta.reason || detail.reason || ''),
	      loginPointSafetyExitSelfForDetail(detail, meta, bot.lastSelf)
	    );
	    ensureExitAuditDetail(detail, meta);
	    recordExitAuditEvent('exit-trigger', detail, {
      ...meta,
      at: Number(detail.exitTriggeredAt || detail.at || Date.now())
    });
    return detail.exitAuditId;
  }

  function primePendingUnsafeExitLoginSuppress(storageReason, reason, detail, selfLike = null, options = {}) {
    if (!detail || !detail.attempted) return 0;
    const fixedDelayRaw = Number(options.fixedDelayMs ?? NaN);
    const fixedDelayMs = Number.isFinite(fixedDelayRaw) && fixedDelayRaw > 0 ? Math.max(1000, Math.round(fixedDelayRaw)) : 0;
    const delay = fixedDelayMs
      ? { delayMs: fixedDelayMs, hpDelayMs: fixedDelayMs, hp: hpInfoForRelogin(selfLike, detail) }
      : reloginDelayForHp(selfLike, detail);
    const minimumDelayMs = Math.max(
      unsafeExitReloginMinDelayMs(),
      Math.max(0, Number(options.minimumDelayMs || 0) || 0)
    );
    const delayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);
    if (!(delayMs > 0)) return 0;
    const suppressReason = pendingExitSuppressReason(storageReason);
    const until = setLoginSuppress(suppressReason, delayMs);
    detail.pendingLoginSuppressReason = suppressReason;
    detail.pendingLoginSuppressUntil = until;
    detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - Date.now()));
    detail.pendingLoginSuppressMinimumDelayMs = minimumDelayMs;
    detail.pendingLoginSuppressHpDelayMs = delay.hpDelayMs || 0;
    detail.pendingLoginSuppressHp = delay.hp || null;
    if (reason) detail.enemyLeaveReason = detail.enemyLeaveReason || reason;
    return until;
  }

  function setEnemyLeaveSuppress(reason, detail, selfLike = null, options = {}) {
    return setExitReloginSuppress('enemy leave', reason, detail, selfLike, options);
  }

	  function staminaBudgetExitHoldUntil(staminaBudgetExit, t = Date.now()) {
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

  function staminaExitHoldUntilForDetail(detail, t = Date.now()) {
    const holds = [
      staminaBudgetExitHoldUntil(detail?.offlineSafety?.staminaBudgetExit, t),
      staminaResetHoldUntil(detail?.offlineSafety?.staminaExhausted, t)
    ].filter(Boolean);
    if (!holds.length) return null;
    return holds.sort((a, b) => Number(b.until || 0) - Number(a.until || 0))[0] || null;
  }

	  function offlineExitRequiresUnsafeReloginDelay(reason, offlineSafety) {
	    if (!offlineSafety) return false;
	    if (offlineSafety.unsafe || offlineSafety.reconnectChurn || offlineSafety.noSelfGameSession || offlineSafety.staminaExhausted || offlineSafety.samplingOutage || offlineSafety.combatTickGap) return true;
	    const text = String(reason || '').toLowerCase();
	    return text.includes('reconnect churn') || text.includes('server position') || text.includes('stamina') || text.includes('missing self') || text.includes('sampling outage') || text.includes('combat tick gap');
	  }
`;
}

function bundledExitReloginHoldSource() {
  return `	  const {
\t    isExitLoginSuppressReasonCore,
\t    startExitAuditBoundCore,
\t    setExitReloginSuppressCore,
\t    primePendingUnsafeExitLoginSuppressBoundCore,
\t    setEnemyLeaveSuppressCore,
\t    staminaExitHoldUntilForDetailCore,
\t    staminaExitHoldUntilForDetailBoundCore,
\t    offlineExitRequiresUnsafeReloginDelayCore
\t  } = require('./src/browser/runtime/exit-relogin');

\t  function isExitLoginSuppressReason(reason) {
\t    return isExitLoginSuppressReasonCore(reason);
\t  }

  function setExitReloginSuppress(storageReason, reason, detail, selfLike, options = {}) {
    return setExitReloginSuppressCore(bot, localStorage, storageReason, reason, detail, selfLike, options, {
      loginSuppressKey: LOGIN_SUPPRESS_KEY,
      loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
      enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
      offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
      isExitLoginSuppressReason,
      hpInfoForRelogin,
      reloginDelayForHp,
      updateEnemyLeaveStreak,
      clearLoginSuppressMatching,
      finalizeLeaveDisplayReason,
      writePersistentExitState,
      setLoginSuppress,
      now: Date.now
    });
  }

\t  function startExitAudit(detail, meta = {}) {
    return startExitAuditBoundCore(detail, meta, bot, {
      resetLoginSnapshotGate,
      loginPointSafetyExitSelfForDetail,
      ensureExitAuditDetail,
      recordExitAuditEvent,
      now: Date.now
    });
  }

  function primePendingUnsafeExitLoginSuppress(storageReason, reason, detail, selfLike = null, options = {}) {
    return primePendingUnsafeExitLoginSuppressBoundCore(storageReason, reason, detail, selfLike, options, {
      hpInfoForRelogin,
      reloginDelayForHp,
      cfg,
      setLoginSuppress,
      now: Date.now
    });
  }

  function setEnemyLeaveSuppress(reason, detail, selfLike = null, options = {}) {
    return setEnemyLeaveSuppressCore(reason, detail, selfLike, options, {
      setExitReloginSuppress
    });
  }

  function staminaExitHoldUntilForDetail(detail, t = Date.now()) {
    return staminaExitHoldUntilForDetailBoundCore(detail, t, {
      staminaBudgetReloginDelayMs,
      staminaResetHoldUntil
    });
  }

\t  function offlineExitRequiresUnsafeReloginDelay(reason, offlineSafety) {
\t    return offlineExitRequiresUnsafeReloginDelayCore(reason, offlineSafety);
\t  }
`;
}

function exitReloginHoldReadInlineSource() {
  return String.raw`
  function enemyReloginHoldRemainingMs() {
    let until = Number(bot.pursuitReloginUntil || 0);
    const persistent = readPersistentExitState(ENEMY_LEAVE_STATE_KEY);
    if (Number(persistent?.reloginUntil || 0) > until) {
      until = Number(persistent.reloginUntil);
      bot.pursuitReloginUntil = until;
      bot.lastEnemyLeaveResult = persistent;
    }
    try {
      const suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      if ((suppressReason === 'enemy leave' || suppressReason === 'pursuit leave' || suppressReason === 'combat leave') && suppressUntil > until) {
        until = suppressUntil;
        bot.pursuitReloginUntil = suppressUntil;
      }
    } catch (_) {}
	    const remaining = Math.max(0, until - Date.now());
	    if (!remaining && bot.pursuitReloginUntil) {
	      bot.pursuitReloginUntil = 0;
	    }
	    return Math.round(remaining);
  }

  function offlineReloginHoldRemainingMs() {
    let until = Number(bot.offlineReloginUntil || 0);
    const persistent = readPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    if (Number(persistent?.reloginUntil || 0) > until) {
      until = Number(persistent.reloginUntil);
      bot.offlineReloginUntil = until;
      bot.lastOfflineLeaveResult = persistent;
    }
    if (until > Date.now() && staleOfflineStaminaHoldContradicted(bot.lastOfflineLeaveResult || persistent)) {
      clearOfflineReloginHold('stale stamina hold contradicted by known stamina');
      return 0;
    }
    try {
      const suppressUntil = Number(localStorage.getItem(LOGIN_SUPPRESS_KEY) || 0) || 0;
      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
      if (/offline.*leave/i.test(suppressReason) && suppressUntil > until) {
        until = suppressUntil;
        bot.offlineReloginUntil = suppressUntil;
      }
    } catch (_) {}
    if (until > Date.now() && staleOfflineStaminaHoldContradicted(bot.lastOfflineLeaveResult || persistent)) {
      clearOfflineReloginHold('stale offline suppress contradicted by known stamina');
      return 0;
    }
	    const remaining = Math.max(0, until - Date.now());
	    if (!remaining && bot.offlineReloginUntil) {
	      bot.offlineReloginUntil = 0;
	    }
    return Math.round(remaining);
  }

	  function clearLoginSuppressMatching(pattern) {
	    try {
	      const suppressReason = String(localStorage.getItem(LOGIN_SUPPRESS_REASON_KEY) || '');
	      if (!pattern.test(suppressReason)) return false;
      localStorage.removeItem(LOGIN_SUPPRESS_KEY);
      localStorage.removeItem(LOGIN_SUPPRESS_REASON_KEY);
      return true;
    } catch (_) {
      return false;
	    }
	  }
`;
}

function bundledExitReloginHoldReadSource() {
  return `	  const {
\t    enemyReloginHoldRemainingMsBoundCore,
\t    offlineReloginHoldRemainingMsBoundCore,
\t    clearLoginSuppressMatchingBoundCore
\t  } = require('./src/browser/runtime/exit-relogin');

  function enemyReloginHoldRemainingMs() {
    return enemyReloginHoldRemainingMsBoundCore(bot, localStorage, {
      loginSuppressKey: LOGIN_SUPPRESS_KEY,
      loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
      readPersistentExitState,
      enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY,
      now: Date.now
    });
  }

  function offlineReloginHoldRemainingMs() {
    return offlineReloginHoldRemainingMsBoundCore(bot, localStorage, {
      loginSuppressKey: LOGIN_SUPPRESS_KEY,
      loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
      readPersistentExitState,
      offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY,
      staleOfflineStaminaHoldContradicted,
      clearOfflineReloginHold,
      now: Date.now
    });
  }

\t  function clearLoginSuppressMatching(pattern) {
\t    return clearLoginSuppressMatchingBoundCore(localStorage, pattern, {
\t      loginSuppressKey: LOGIN_SUPPRESS_KEY,
\t      loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY
\t    });
\t  }
`;
}

function exitReloginRemainderPrefixInlineSource() {
  return String.raw`
	  function setOfflineLeaveSuppress(reason, detail, selfLike = null, options = {}) {
		    const staminaHold = staminaExitHoldUntilForDetail(detail);
		    if (staminaHold && detail) {
		      if (staminaHold.staminaBudgetExit) detail.staminaBudgetHold = staminaHold;
		      else detail.staminaReset = staminaHold;
		    }
		    if (!staminaHold && !(Number(options.minimumUntil || 0) > Date.now())) {
		      const unsafeOfflineExit = offlineExitRequiresUnsafeReloginDelay(reason, detail?.offlineSafety || null);
		      bot.offlineReloginUntil = 0;
		      bot.lastOfflineLeaveWaitMs = 0;
		      if (detail) {
		        detail.reloginUntil = 0;
		        detail.holdRemainingMs = 0;
		        detail.reloginDelayMs = 0;
		        detail.safeReloginAllowed = !unsafeOfflineExit;
		        if (unsafeOfflineExit) detail.defensiveReloginDelaySkipped = true;
			        detail.loginSuppressReason = '';
			        finalizeLeaveDisplayReason(detail);
			        bot.lastOfflineLeaveResult = detail;
			        writePersistentExitState(OFFLINE_LEAVE_STATE_KEY, detail);
			      }
			      return 0;
		    }
		    return setExitReloginSuppress('offline leave', reason, detail, selfLike, {
		      existingUntil: bot.offlineReloginUntil,
		      minimumUntil: Math.max(Number(options.minimumUntil || 0) || 0, staminaHold?.until || 0),
	      minimumReason: options.minimumReason || staminaHold?.reason || (staminaHold ? 'stamina reset' : ''),
	      fixedDelayMs: staminaHold?.fixed ? staminaHold.fixedDelayMs : 0
	    });
	  }

	  function primePendingStaminaExitLoginSuppress(detail) {
	    const hold = staminaExitHoldUntilForDetail(detail);
	    if (!hold) return 0;
	    const delayMs = hold.fixed
	      ? hold.fixedDelayMs
	      : Math.max(1000, Math.round(Number(hold.until || 0) - Date.now()));
	    const until = setLoginSuppress('stamina leave pending', delayMs);
	    if (detail) {
	      detail.pendingLoginSuppressUntil = until;
	      detail.pendingLoginSuppressDelayMs = Math.max(0, Math.round(until - Date.now()));
	      if (hold.staminaBudgetExit) detail.staminaBudgetHold = hold;
	      else detail.staminaReset = hold;
	    }
	    return until;
	  }
`;
}

function bundledExitReloginRemainderPrefixSource() {
  return `	  const {
	    setOfflineLeaveSuppressCore,
	    setOfflineLeaveSuppressBoundCore,
	    primePendingStaminaExitLoginSuppressBoundCore
	  } = require('./src/browser/runtime/exit-relogin');

\t  function setOfflineLeaveSuppress(reason, detail, selfLike = null, options = {}) {
\t    return setOfflineLeaveSuppressBoundCore(bot, reason, detail, selfLike, options, {
\t      now: Date.now,
\t      staminaBudgetReloginDelayMs,
\t      staminaResetHoldUntil,
\t      finalizeLeaveDisplayReason,
\t      writePersistentExitState,
\t      setExitReloginSuppress,
\t      offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY
\t    });
\t  }

\t  function primePendingStaminaExitLoginSuppress(detail) {
\t    return primePendingStaminaExitLoginSuppressBoundCore(detail, {
\t      now: Date.now,
\t      staminaBudgetReloginDelayMs,
\t      staminaResetHoldUntil,
\t      setLoginSuppress
\t    });
\t  }
`;
}

function exitReloginClearInlineSource() {
  return String.raw`
	  function clearEnemyReloginHold(reason = 'online self restored') {
	    const t = Date.now();
	    const details = [
	      activeEnemyLeaveDetail(t),
	      bot.lastEnemyLeaveResult,
	      bot.lastPursuitLeaveResult,
	      bot.lastCombatLeaveResult,
	      bot.lastInjuryLeaveResult
	    ].filter(Boolean);
		    bot.pursuitReloginUntil = 0;
		    bot.lastEnemyLeaveWaitMs = 0;
		    bot.pendingExit = bot.pendingExit?.scope === 'offline' ? bot.pendingExit : null;
		    if (bot.pendingExit) writePersistentPendingExitState(bot.pendingExit);
		    else clearPersistentPendingExitState();
	    for (const detail of details) {
	      if (!detail || typeof detail !== 'object') continue;
	      detail.onlineRecoveryAt = t;
	      detail.onlineRecoveryReason = String(reason || 'online self restored');
	      clearExitHoldDetail(detail, reason, t);
	    }
	    bot.lastEnemyLeaveResult = null;
	    bot.lastPursuitLeaveResult = null;
	    bot.lastCombatLeaveResult = null;
	    bot.lastInjuryLeaveResult = null;
	    clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
	    clearLoginSuppressMatching(/enemy leave|combat leave|pursuit leave/i);
	  }

	  function clearOfflineReloginHold(reason = 'online self restored') {
	    const t = Date.now();
	    bot.offlineReloginUntil = 0;
	    bot.lastOfflineLeaveWaitMs = 0;
	    bot.pendingExit = bot.pendingExit?.scope === 'offline' ? null : bot.pendingExit;
	    if (bot.pendingExit) writePersistentPendingExitState(bot.pendingExit);
	    else clearPersistentPendingExitState();
    if (bot.lastOfflineLeaveResult && typeof bot.lastOfflineLeaveResult === 'object') {
      bot.lastOfflineLeaveResult.onlineRecoveryAt = t;
      bot.lastOfflineLeaveResult.onlineRecoveryReason = String(reason || 'online self restored');
      bot.lastOfflineLeaveResult.reloginUntil = 0;
      bot.lastOfflineLeaveResult.holdRemainingMs = 0;
      bot.lastOfflineLeaveResult.reloginDelayMs = 0;
    }
    bot.lastOfflineLeaveResult = null;
    clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
    clearLoginSuppressMatching(/offline.*leave/i);
  }
`;
}

function bundledExitReloginClearSource() {
  return `	  const {
	    clearEnemyReloginHoldBoundCore,
	    clearOfflineReloginHoldBoundCore
	  } = require('./src/browser/runtime/exit-relogin');

\t  function clearEnemyReloginHold(reason = 'online self restored') {
\t    return clearEnemyReloginHoldBoundCore(bot, localStorage, reason, {
\t      now: Date.now,
\t      activeEnemyLeaveDetail,
\t      writePersistentPendingExitState,
\t      clearPersistentPendingExitState,
\t      clearExitHoldDetail,
\t      clearPersistentExitState,
\t      loginSuppressKey: LOGIN_SUPPRESS_KEY,
\t      loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
\t      enemyLeaveStateKey: ENEMY_LEAVE_STATE_KEY
\t    });
\t  }

\t  function clearOfflineReloginHold(reason = 'online self restored') {
\t    return clearOfflineReloginHoldBoundCore(bot, localStorage, reason, {
\t      now: Date.now,
\t      writePersistentPendingExitState,
\t      clearPersistentPendingExitState,
\t      clearPersistentExitState,
\t      loginSuppressKey: LOGIN_SUPPRESS_KEY,
\t      loginSuppressReasonKey: LOGIN_SUPPRESS_REASON_KEY,
\t      offlineLeaveStateKey: OFFLINE_LEAVE_STATE_KEY
\t    });
\t  }
`;
}

function exitReloginRemainderSource() {
  return String.raw``;
}

function exitReloginSource(options = {}) {
  const displaySource = options.bundledRuntime
    ? bundledExitReloginDisplaySource()
    : exitReloginDisplayInlineSource();
  const actorSource = options.bundledRuntime
    ? bundledExitReloginActorSource()
    : exitReloginActorInlineSource();
  const streakSource = options.bundledRuntime
    ? bundledExitReloginStreakSource()
    : exitReloginStreakInlineSource();
  const summarySource = options.bundledRuntime
    ? bundledExitReloginSummarySource()
    : exitReloginSummaryInlineSource();
  const holdSource = options.bundledRuntime
    ? bundledExitReloginHoldSource()
    : exitReloginHoldInlineSource();
  const holdReadSource = options.bundledRuntime
    ? bundledExitReloginHoldReadSource()
    : exitReloginHoldReadInlineSource();
  const prefixSource = options.bundledRuntime
    ? bundledExitReloginRemainderPrefixSource()
    : exitReloginRemainderPrefixInlineSource();
  const clearSource = options.bundledRuntime
    ? bundledExitReloginClearSource()
    : exitReloginClearInlineSource();
  return displaySource + actorSource + streakSource + summarySource + holdSource + prefixSource + holdReadSource + clearSource + exitReloginRemainderSource();
}

module.exports = {
  exitReloginDisplayInlineSource,
  bundledExitReloginDisplaySource,
  exitReloginActorInlineSource,
  bundledExitReloginActorSource,
  exitReloginStreakInlineSource,
  bundledExitReloginStreakSource,
  exitReloginSummaryInlineSource,
  bundledExitReloginSummarySource,
  exitReloginHoldInlineSource,
  bundledExitReloginHoldSource,
  exitReloginHoldReadInlineSource,
  bundledExitReloginHoldReadSource,
  exitReloginClearInlineSource,
  bundledExitReloginClearSource,
  exitReloginRemainderPrefixInlineSource,
  bundledExitReloginRemainderPrefixSource,
  exitReloginRemainderSource,
  exitReloginSource
};
