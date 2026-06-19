'use strict';

function statusPanelSource(helpers = {}) {
  const {
    escapeHtml,
    formatDistance,
    formatDurationMs,
    actorLabel,
    hpDisplay
  } = helpers;
  return [
    String.raw`
	  function ensureBotPanel() {
	    return null;
	    if (!document.body) return null;
	    let panel = document.getElementById(PANEL_ID);
	    if (panel) return panel;
	    panel = document.createElement('div');
	    panel.id = PANEL_ID;
	    panel.setAttribute('aria-live', 'polite');
	    panel.style.cssText = [
	      'position:fixed',
	      'right:12px',
	      'top:12px',
	      'z-index:2147483647',
	      'width:min(360px,calc(100vw - 24px))',
	      'max-width:360px',
	      'box-sizing:border-box',
	      'padding:10px 12px',
	      'border:1px solid rgba(148,163,184,.35)',
	      'border-radius:8px',
	      'background:rgba(15,23,42,.88)',
	      'color:#e5e7eb',
	      'font:12px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif',
	      'box-shadow:0 10px 32px rgba(0,0,0,.38)',
	      'backdrop-filter:blur(8px)',
	      'pointer-events:none',
	      'white-space:normal'
	    ].join(';');
	    document.body.appendChild(panel);
	    return panel;
	  }

	  function removeBotPanel() {
	    return;
	    const panel = document.getElementById(PANEL_ID);
	    if (panel) panel.remove();
	  }
`,
    typeof escapeHtml === 'function' ? escapeHtml.toString() : '',
    typeof formatDistance === 'function' ? formatDistance.toString() : '',
    typeof formatDurationMs === 'function' ? formatDurationMs.toString() : '',
    typeof actorLabel === 'function' ? actorLabel.toString() : '',
    typeof hpDisplay === 'function' ? hpDisplay.toString() : '',
    String.raw`
  function formatStaminaDisplay(self) {
    if (!self) return '-';
    const stamina = self.stamina || {};
    const valueText = (remaining, limit) => {
      const r = Number(remaining);
      if (!Number.isFinite(r)) return '-';
      const l = Number(limit);
      return Math.floor(r / 1000) + '/' + (Number.isFinite(l) && l > 0 ? Math.floor(l / 1000) : '-');
    };
    const exhausted = Array.isArray(stamina.exhausted) ? stamina.exhausted : [];
    const suffix = exhausted.length ? ' !' + exhausted.join('/') : '';
    return '5s ' + valueText(stamina.stamina5s ?? self.stamina5s ?? self.stamina_5s_remaining_milli, stamina.stamina5sLimit ?? self.stamina5sLimit ?? self.stamina_5s_limit_milli)
      + ' 1h ' + valueText(stamina.stamina1h ?? self.stamina1h ?? self.stamina_1h_remaining_milli, stamina.stamina1hLimit ?? self.stamina1hLimit ?? self.stamina_1h_limit_milli)
      + ' 1d ' + valueText(stamina.stamina1d ?? self.stamina1d ?? self.stamina_1d_remaining_milli, stamina.stamina1dLimit ?? self.stamina1dLimit ?? self.stamina_1d_limit_milli)
      + suffix;
  }

	  function decisionReasonDetail(decision) {
	    return decision?.leave?.displayReason
	      || decision?.displayReason
	      || decision?.enemyLeave?.displayReason
	      || decision?.offlineLeave?.displayReason
      || decision?.leave?.summary
      || decision?.exitSummary
      || decision?.leave?.exitSummary
      || decision?.leave?.enemyLeaveSummary
      || decision?.leave?.enemyLeaveReason
	      || '';
	  }

	  function activeEnemyLeaveDetail(t = Date.now()) {
	    const current = latestEnemyLeaveResult();
	    const restored = readPersistentExitState(ENEMY_LEAVE_STATE_KEY, t);
	    const picked = current || restored || bot.lastEnemyLeaveResult || null;
	    if (!picked) return null;
	    const refreshed = refreshExitDetail(picked, t);
	    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
	      clearPersistentExitState(ENEMY_LEAVE_STATE_KEY);
	      if (bot.lastEnemyLeaveResult === picked) bot.lastEnemyLeaveResult = null;
	      return null;
	    }
	    bot.lastEnemyLeaveResult = refreshed;
	    if (Number(refreshed?.reloginUntil || 0) > 0) bot.pursuitReloginUntil = Math.max(Number(bot.pursuitReloginUntil || 0), Number(refreshed.reloginUntil));
	    return refreshed;
	  }

	  function activeOfflineLeaveDetail(t = Date.now()) {
	    const picked = bot.lastOfflineLeaveResult || readPersistentExitState(OFFLINE_LEAVE_STATE_KEY, t);
	    if (!picked) return null;
	    const refreshed = refreshExitDetail(picked, t);
	    if (!refreshed?.holdRemainingMs && Number(refreshed?.reloginUntil || 0)) {
	      clearPersistentExitState(OFFLINE_LEAVE_STATE_KEY);
	      if (bot.lastOfflineLeaveResult === picked) bot.lastOfflineLeaveResult = null;
	      return null;
	    }
	    bot.lastOfflineLeaveResult = refreshed;
	    if (Number(refreshed?.reloginUntil || 0) > 0) bot.offlineReloginUntil = Math.max(Number(bot.offlineReloginUntil || 0), Number(refreshed.reloginUntil));
	    return refreshed;
	  }

	  function latestEnemyLeaveResult() {
	    const candidates = [
	      { at: Number(bot.lastEnemyLeaveResult?.at || 0), result: bot.lastEnemyLeaveResult },
	      { at: Number(bot.lastCombatLeaveResult?.at || bot.lastCombatLeaveAt || 0), result: bot.lastCombatLeaveResult },
	      { at: Number(bot.lastPursuitLeaveResult?.at || bot.lastPursuitLeaveAt || 0), result: bot.lastPursuitLeaveResult },
	      { at: Number(bot.lastInjuryLeaveResult?.at || bot.lastInjuryLeaveAt || 0), result: bot.lastInjuryLeaveResult }
    ].filter(item => item.result);
    return candidates.sort((a, b) => b.at - a.at)[0]?.result || null;
  }

  function latestEnemyLeaveSummary() {
    const result = latestEnemyLeaveResult();
    return result?.summary || result?.exitSummary || result?.enemyLeaveSummary || result?.displayReason || '';
  }

  function latestEnemyLeaveDisplayReason() {
    const result = latestEnemyLeaveResult();
    return result?.displayReason || result?.summary || result?.exitSummary || result?.enemyLeaveSummary || '';
  }

	  function actionText(decision) {
	    const kind = decision?.kind || 'wait';
	    const target = decision?.target || null;
	    const threats = Array.isArray(decision?.threats) ? decision.threats : [];
    const detail = decisionReasonDetail(decision);
	    if (kind === 'coin') return '拾取金币' + (target ? ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '');
	    if (kind === 'seek-coin') return '前往金币' + (target ? ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance) : '');
    if (kind === 'attack') return (decision?.combat ? '战斗 ' : '攻击 ') + (target?.name || ('#' + (target?.id ?? '-'))) + ' 血量 ' + (target?.hp ?? '-') + ' Drop ' + (target?.drop ?? '-');
	    if (kind === 'seek-enemy' || kind === 'seek-drop') return '前往目标 ' + (target?.name || ('#' + (target?.id ?? '-'))) + (target?.drop ? ' Drop ' + target.drop : '');
	    if (kind === 'flee') {
	      const threat = threats[0];
	      return '避险撤离' + (threat ? '：' + (threat.name || ('#' + threat.id)) + ' 距离 ' + formatDistance(threat.d ?? threat.distance) : '');
	    }
	    if (kind === 'recover') return '恢复体力/血量';
	    if (kind === 'patrol') {
	      if (target) return '巡航到' + (target.amount ? '金币' : '区域') + ' #' + (target.id ?? '-') + ' 距离 ' + formatDistance(target.distance);
	      return '巡航扫描';
	    }
	    if (kind === 'wait') return '等待：' + (detail || decision?.reason || '状态不足');
	    if (kind === 'leave') return '退出：' + (detail || decision?.reason || '状态不足');
	    if (kind === 'idle') return '待命';
	    return kind;
	  }

	  function reasonText(reason) {
	    const map = {
      'active-threat-before-bullet-range': 'Active 玩家进入危险圈',
	      'active-threat-caution-migration': 'Active 玩家进入预警圈',
	      'active-threat-return-block': '阻止回头靠近 Active 玩家',
	      'return-block-lateral-scan': 'Active 返程冷却：横向扫描',
      'passive-panic-distance': '玩家距离过近',
	      'avoid-invulnerable-target': '避开无敌目标',
	      'recovery-avoid-humans': '避开无敌目标',
	      'recovery-foot-coin': '回血时顺手拾取脚下金币',
	      'foot-coin-priority': '贴身金币优先拾取',
	      'foot-coin-before-active-caution': '预警区内只拾取贴身金币',
	      'near-coin-priority': '近处安全金币优先',
	      'near-coin-before-active-caution': '预警区内只拾取近处安全金币',
	      'safe-coin-before-drop-target': '安全金币优先于攻击',
	      'safe-global-coin-before-drop-target': '前往可见安全金币',
	      'safe-patrol-coin': '巡航拾取安全金币',
	      'safe-distant-coin': '前往远处安全金币',
	      'post-attack-drop-coin': '战斗后优先拾取掉落',
	      'best-opportunity-coin': '综合收益最高：拾取金币',
	      'best-opportunity-visible-coin': '综合收益最高：前往可见金币',
		      'best-opportunity-drop-target': '综合收益最高：攻击 Drop 目标',
		      'best-opportunity-afk-drop-target': '综合收益最高：攻击挂机 Drop 目标',
			      'approach-profitable-drop-target': '综合收益最高：靠近高 Drop 目标',
	      'approach-afk-drop-target': '综合收益最高：靠近挂机 Drop 目标',
	      'opportunistic-afk-drop-shot': '顺手射击挂机 Drop 目标',
	      'migrate-to-known-field': '迁移到金币密集区域',
	      'scan-toward-distant-coin': '扫描远处金币',
		      'snapshot-coin-field': '快照金币区域导航',
		      'snapshot-coin-target': '快照金币导航',
			      'snapshot-coin-idle-timeout': '等待超时，前往远处快照金币',
			      'wait-for-stamina-budget': '长期体力预算不足',
			      'stamina-budget-coin-leave': '一小时体力预算不足，退出等待恢复',
			      'stamina-budget-coin-leave-retry': '一小时体力预算不足，重试退出',
			      'wait-for-snapshot-coin': '等待快照金币',
		      'login-suppressed': '等待重连',
		      'exit-log-flush-pending': '等待退出日志发送完成',
		      'important-log-flush-pending': '等待会话结束日志发送完成',
		      'maintain-safe-spacing': '避开附近玩家',
	      'ignore-stale-coin-no-progress': '金币长时间无进展，临时脱离',
	      'leave-stale-coin': '离开疑似卡住金币',
	      'wait-for-full-stamina-and-hp': '等待恢复到安全状态',
	      'conserve-stamina-before-chasing': '兼容旧状态：保存体力',
	      'save-stamina-for-profitable-coin': '兼容旧状态：等待目标',
	      'combat-attack': '战斗：节奏开火',
	      'combat-tangent-dodge': '战斗：切线规避并节奏开火',
	      'combat-stamina-hold': '战斗：短体力不足，停止移动并暂停开火',
	      'combat-stamina-conserve': '战斗：保留体力躲避，暂停开火',
	      'combat-burst-fire': '战斗：保留体力，降频开火',
	      'combat-pressure-close': '战斗：久攻未中，压近并节奏开火',
	      'combat-finish-pressure': '战斗：残血目标退边，压近补枪',
	      'combat-spacing': '战斗：保持安全间距并开火',
	      'combat-spacing-dodge': '战斗：规避贴近并开火',
	      'combat-critical-hp-leave': '战斗血量低于 20，立即退出',
	      'combat-low-hp-leave': '战斗低血劣势，立即退出',
	      'combat-low-hp-no-damage-leave': '战斗低血且久攻未中，立即退出',
	      'combat-hp-disadvantage-leave': '战斗血量差劣势，立即退出',
	      'combat-leave': '战斗劣势退出后等待',
	      'combat-leave-retry': '战斗退出失败，等待补发退出',
	      'control-ws-offline': '网络连接离线',
	      'control-ws-offline-unsafe': '网络连接离线且周围危险，立即退出',
			      'control-ws-offline-safe-wait': '网络连接离线，安全区短暂等待重连',
			      'control-ws-reconnect-churn': '网络连接反复重连，立即退出',
			      'control-ws-no-self-game-session': '已登录但自身实体不可见，立即退出',
			      'control-ws-server-position-stalled': '服务端位置停止，按网络连接离线处理',
		      'control-stamina-exhausted': '长周期体力耗尽，按网络连接离线处理',
		      'stamina-exhausted-leave': '长周期体力耗尽，正在退出',
	      'offline-leave': '网络连接离线，正在退出',
	      'offline-leave-wait': '网络连接离线退出后等待重连',
	      'pursuit-leave': '被同一玩家持续追击，退出等待',
	      'pursuit-leave-retry': '追击退出失败，等待补发退出',
	      'pursuit-leave-wait': '追击退出后等待重新登录',
		      'auto-login': '自动触发登录/加入',
		      'login-cooldown': '登录已触发，等待页面跳转',
		      'login-snapshot-gate': '等待snapshot连续成功',
		      'login-control-missing': '等待登录控件出现',
	      'game-session-connecting': '已登录，等待游戏连接/自身实体',
	      'no-self': '未读到自身实体',
	      'not-alive': '不在存活状态',
	      'bot-error': '脚本异常'
	    };
	    return map[reason] || reason || '-';
	  }

	  function updateBotPanel(decision = bot.lastDecision) {
	    renderTargetOverlay(decision);
	    return;
	    const panel = ensureBotPanel();
	    if (!panel) return;
	    const self = decision?.self || bot.lastSelf || null;
	    const hp = self?.hp ?? '-';
	    const staminaText = formatStaminaDisplay(self);
	    const selfDrop = self ? (self.drop ?? dropValue(self)) : '-';
	    const control = summarizeControl();
	    const safety = bot.lastSafety || {};
	    const nearestActive = safety.nearestActive
	      ? (safety.nearestActive.name || ('#' + safety.nearestActive.id)) + ' ' + formatDistance(safety.nearestActive.distance)
	      : '-';
	    const wsLabel = control.wsOpen ? 'online' : (control.connecting ? 'connecting' : 'offline');
	    const velocity = control.nativeCurrentVel || control.lastVelocity || '0 0';
	    const version = cfg.version || 'dev';
	    const sourceHash = cfg.sourceHash ? String(cfg.sourceHash).slice(0, 8) : '-';
	    const panelLines = [
	      '<div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#f8fafc">BOT ' + escapeHtml(actionText(decision)) + '</div>',
	      '<div style="font-size:11px;margin:-2px 0 4px;color:#cbd5e1;word-break:break-all">远端 ' + escapeHtml(version) + ' / ' + escapeHtml(sourceHash) + '</div>',
	      '<div>原因：' + escapeHtml(decisionReasonDetail(decision) || reasonText(decision?.reason)) + '</div>',
	      '<div>血量 ' + escapeHtml(hp) + ' / 体力 ' + escapeHtml(staminaText) + ' / Drop ' + escapeHtml(selfDrop || '-') + '</div>',
	      '<div>移动 ' + escapeHtml(decision?.dx ?? 0) + ',' + escapeHtml(decision?.dy ?? 0) + ' / 速度 ' + escapeHtml(velocity) + '</div>',
	      '<div>WS ' + escapeHtml(wsLabel) + ' / 最近 Active ' + escapeHtml(nearestActive) + '</div>'
	    ];
	    if (decision?.target) {
	      const target = decision.target;
	      panelLines.push('<div>目标：' + escapeHtml(target.name || ('#' + (target.id ?? '-'))) + ' 距离 ' + escapeHtml(formatDistance(target.distance)) + ' 金币 ' + escapeHtml(target.amount ?? '-') + ' Drop ' + escapeHtml(target.drop ?? '-') + '</div>');
	    }
    if (decision?.combat) {
      panelLines.push('<div>战斗：瞄准 ' + escapeHtml(decision?.aimTarget?.mode || '-') + ' / 来弹 ' + escapeHtml(decision?.incomingBullet ? formatDistance(decision.incomingBullet.laneDistance) : '-') + '</div>');
    }
    if (decision?.opportunisticShot) {
      const shot = decision.opportunisticShot;
      panelLines.push('<div>顺手射击：' + escapeHtml(shot.name || ('#' + (shot.id ?? '-'))) + ' 距离 ' + escapeHtml(formatDistance(shot.distance)) + ' Drop ' + escapeHtml(shot.drop ?? '-') + '</div>');
    }
	    const pursuit = decision?.pursuit || safety.pursuit || summarizePursuit(bot.pursuit);
	    if (pursuit) {
	      panelLines.push('<div>追击：' + escapeHtml(pursuit.name || ('#' + pursuit.id)) + ' ' + escapeHtml(formatDistance(pursuit.distance)) + ' / ' + escapeHtml(Math.round((pursuit.durationMs || 0) / 1000)) + 's</div>');
	    }
	    if (Array.isArray(bot.errors) && bot.errors.length) {
	      panelLines.push('<div style="color:#fca5a5">错误：' + escapeHtml(bot.errors[bot.errors.length - 1]?.message || '') + '</div>');
	    }
	    panel.innerHTML = panelLines.join('');
	  }

			  function logStatus(text, detail) {
			    bot.lastAction = text;
			    if (detail) bot.lastDecision = detail;
			    if (bot.running) updateBotPanel(bot.lastDecision || detail || { kind: 'wait', reason: text, self: bot.lastSelf });
			    if (typeof log === 'function') log('[bot] ' + text, 'info');
			    console.log('[grasp-rat-bot]', text, detail || '');
			  }
`
  ].filter(Boolean).join('\n\n');
}

module.exports = {
  statusPanelSource
};
