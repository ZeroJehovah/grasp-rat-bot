'use strict';

// Bump only when this browserless web page or its frontend assets change.
const BROWSERLESS_WEB_PANEL_VERSION = '2026.08.07.1';
const BROWSERLESS_WEB_PANEL_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23060b16'/%3E%3Ccircle cx='32' cy='32' r='23' fill='none' stroke='%2338bdf8' stroke-width='4' stroke-opacity='.55'/%3E%3Cpath d='M32 9v46M9 32h46' stroke='%2394a3b8' stroke-width='3' stroke-opacity='.45'/%3E%3Ccircle cx='32' cy='32' r='7' fill='%2334d399'/%3E%3Ccircle cx='46' cy='20' r='4' fill='%2338bdf8'/%3E%3Ccircle cx='19' cy='43' r='4' fill='%23fb7185'/%3E%3Cpath d='M32 32l14-12' stroke='%2338bdf8' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";

function mapMarkerKeyCore(kind, primary, fallback = '') {
  const normalizedKind = kind === null || kind === undefined || kind === '' ? '' : String(kind);
  const normalizedPrimary = primary === null || primary === undefined || primary === '' ? '' : String(primary);
  const normalizedFallback = fallback === null || fallback === undefined || fallback === '' ? '' : String(fallback);
  const identity = normalizedPrimary || normalizedFallback;
  return normalizedKind && identity ? `${normalizedKind}:${identity}` : '';
}

function mapAnimationProgressCore(elapsedMs, durationMs) {
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  const elapsed = Number(elapsedMs);
  const linear = Math.max(0, Math.min(1, Number.isFinite(elapsed) ? elapsed / duration : 1));
  return 1 - Math.pow(1 - linear, 3);
}

function interpolateMapMarkerCore(marker, previous, progress) {
  const nextX = Number(marker?.px);
  const nextY = Number(marker?.py);
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return marker;
  const previousX = Number(previous?.px);
  const previousY = Number(previous?.py);
  if (!Number.isFinite(previousX) || !Number.isFinite(previousY)) {
    return { ...marker, px: nextX, py: nextY };
  }
  const parsedProgress = Number(progress);
  const clampedProgress = Math.max(0, Math.min(1, Number.isFinite(parsedProgress) ? parsedProgress : 1));
  return {
    ...marker,
    px: previousX + (nextX - previousX) * clampedProgress,
    py: previousY + (nextY - previousY) * clampedProgress
  };
}

function highDropRankValueCore(item) {
  for (const index of [3, 2, 1]) {
    const raw = item?.[index];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return -Infinity;
}

function isStaminaExhaustionExitReasonCore(reason) {
  return /stamina-exhausted-leave|daily-stamina-exhausted|体力耗尽/i.test(String(reason || ''));
}

function transportMetricValueClassCore(value, metricKind) {
  if (value === null || value === undefined || value === '') return 'muted';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'muted';
  const thresholds = {
    latency: [200, 500],
    queue: [50, 200],
    movement: [300, 600],
    shooting: [500, 1000],
    frameLoss: [1, 5]
  };
  const limits = thresholds[metricKind] || thresholds.latency;
  if (number < limits[0]) return 'ok';
  if (number < limits[1]) return 'warn';
  return 'bad';
}

function panelSessionFlagsCore(status = {}) {
  const online = Boolean(status?.stats?.currentSession?.online);
  return {
    online,
    realtimeOnline: Boolean(status?.game?.inGame && online)
  };
}

function lastExitPanelVisibleCore(status = {}) {
  const { online } = panelSessionFlagsCore(status);
  const offline = status?.stats?.offline || {};
  return Boolean(
    !online
      && (offline.lastExitAt || offline.lastExitReason || status?.recentExit)
  );
}

function missCloseExitReasonTextCore(missClose = {}) {
  const number = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const distance = value => {
    const parsed = number(value);
    return parsed === null ? '' : `${Math.round(parsed / 100)}m`;
  };
  const timeoutMs = number(missClose.evaluationWindowMs ?? missClose.timeoutMs ?? missClose.stepElapsedMs);
  const startDistance = distance(missClose.stepStartDistanceCm);
  const goalDistance = distance(missClose.goalDistanceCm);
  const currentDistance = distance(missClose.targetDistance);
  const acceptedShotsSinceDamage = number(missClose.acceptedShotsSinceDamage);
  const closerRatio = number(missClose.closerRatio);
  const requiredCloserRatio = number(missClose.requiredCloserRatio);
  const minimumRangeNoProgress = missClose.minimumRangeNoProgress === true;
  if (!timeoutMs && !startDistance && !goalDistance && !currentDistance
    && acceptedShotsSinceDamage === null && closerRatio === null) return '';
  const duration = timeoutMs === null ? '持续一段时间' : `连续 ${Math.max(1, Math.round(timeoutMs / 1000))} 秒`;
  let text;
  if (minimumRangeNoProgress) {
    text = goalDistance
      ? `${duration}在最低 ${goalDistance} 近距内仍未造成伤害`
      : `${duration}在最低近距内仍未造成伤害`;
  } else if (goalDistance) {
    text = `${duration}无法稳定保持在 ${goalDistance} 内`;
  } else {
    text = `${duration}无法稳定保持更近距离`;
  }
  const evidence = [];
  if (closerRatio !== null) {
    const required = requiredCloserRatio === null ? 0.5 : requiredCloserRatio;
    evidence.push(`近距占比 ${Math.round(closerRatio * 100)}%，要求至少 ${Math.round(required * 100)}%`);
  }
  if (startDistance && startDistance !== goalDistance) evidence.push(`起点 ${startDistance}`);
  if (currentDistance) evidence.push(`退出时 ${currentDistance}`);
  if (acceptedShotsSinceDamage !== null && acceptedShotsSinceDamage > 0) {
    evidence.push(`${Math.round(acceptedShotsSinceDamage)} 发未造成新伤害`);
  }
  if (evidence.length) text += `（${evidence.join('，')}）`;
  return `${text}，为避免继续低效追击而主动退出`;
}

function recoveryContactExitReasonTextCore(status = {}, reason = '') {
  if (String(reason || '') !== 'recovery-low-hp-contact-leave') return '';
  const trigger = String(status?.recentExit?.recoveryContact?.evidence?.trigger || '');
  if (trigger === 'real-collision-bullet') return '低血量恢复时检测到碰撞路径来弹，主动退出';
  if (trigger === 'target-firing') return '低血量恢复时检测到活动玩家开火，主动退出';
  if (trigger === 'entered-attack-range') return '低血量恢复时活动玩家进入攻击范围，主动退出';
  if (trigger === 'direct-closing-confirmed') return '低血量恢复时确认活动玩家持续接近，主动退出';
  return '';
}

function restartDrainBlockedReasonTextCore(input = {}) {
  const blockedKind = String(input.blockedAction?.kind || input.blockedKind || '');
  let task = '新的金币或战斗任务';
  if (/coin|profit/i.test(blockedKind)) task = '新的金币任务';
  else if (/attack|combat|enemy|fight/i.test(blockedKind)) task = '新的战斗任务';
  const waiting = String(input.commitmentKey || '') ? '，等待当前任务安全结束' : '';
  return `程序正在准备重启，已暂停接取${task}${waiting}`;
}

function groupChatMessagesForDisplay(messages = [], collapseOtherKills = true) {
  const source = Array.isArray(messages) ? messages : [];
  if (!collapseOtherKills) {
    return source.map(message => ({ type: 'message', message }));
  }
  const grouped = [];
  for (let index = 0; index < source.length;) {
    const message = source[index];
    const isOtherKill = String(message?.kind || '') === 'kill' && !message?.mine;
    if (!isOtherKill) {
      grouped.push({ type: 'message', message });
      index += 1;
      continue;
    }
    let end = index + 1;
    while (
      end < source.length
      && String(source[end]?.kind || '') === 'kill'
      && !source[end]?.mine
    ) {
      end += 1;
    }
    const run = source.slice(index, end);
    if (run.length < 3) {
      grouped.push(...run.map(item => ({ type: 'message', message: item })));
    } else {
      grouped.push(
        { type: 'message', message: run[0] },
        { type: 'other-kill-fold', count: run.length - 2 },
        { type: 'message', message: run[run.length - 1] }
      );
    }
    index = end;
  }
  return grouped;
}

function formatSpentStaminaCore(input) {
  if (input === null || input === undefined || input === '') return '--';
  const number = Number(input);
  if (!Number.isFinite(number)) return '--';
  const spent = Math.max(0, number);
  if (spent === 0) return '0';
  if (spent < 1000) return '<1';
  return String(Math.ceil(spent / 1000));
}

function estimatedHighDropQuotaCore(initialDrop, maxDrop, latestDrop) {
  if ([initialDrop, maxDrop, latestDrop].some(value => value === null || value === undefined || value === '')) {
    return null;
  }
  const initial = Number(initialDrop);
  const maximum = Number(maxDrop);
  const latest = Number(latestDrop);
  if (![initial, maximum, latest].every(Number.isFinite)) return null;
  if (latest !== maximum) return null;
  return Math.max(0, Math.round(initial * 20 + (latest - initial) * 2));
}

function nearbyCoinIconCore(options = {}) {
  const selected = Boolean(options.selected);
  const bait = Boolean(options.bait);
  const hasMultipleRouteTargets = Boolean(options.hasMultipleRouteTargets);
  const routeOrder = Number(options.routeOrder);
  const actionReason = String(options.actionReason || '');
  if (bait && (actionReason === 'single-coin-bait-hold' || actionReason === 'single-coin-bait-return')) {
    return 'coinBait';
  }
  if (selected) return hasMultipleRouteTargets ? 'coin1' : 'coinSingle';
  if (bait && actionReason === 'single-coin-bait-release') {
    return hasMultipleRouteTargets ? 'coin1' : 'coinSingle';
  }
  if (Number.isFinite(routeOrder) && routeOrder > 1) {
    return 'coin' + Math.min(9, Math.max(2, Math.round(routeOrder)));
  }
  return '';
}

function groupBlockingFactorsCore(factors = []) {
  const rows = [];
  const players = new Map();
  for (const factor of Array.isArray(factors) ? factors : []) {
    if (!factor || typeof factor !== 'object') continue;
    if (factor.type !== 'player') {
      rows.push({ factor, reasons: factor.reason ? [factor.reason] : [] });
      continue;
    }
    const identity = factor.userId ?? factor.user_id ?? factor.entityId ?? factor.entity_id ?? factor.name ?? '';
    const key = `player:${String(identity)}`;
    let row = players.get(key);
    if (!row) {
      row = { factor, reasons: [] };
      players.set(key, row);
      rows.push(row);
    }
    if (factor.reason && !row.reasons.includes(factor.reason)) row.reasons.push(factor.reason);
  }
  return rows;
}

function renderBrowserlessWebPanel() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>囤囤鼠历险记Bot</title>
  <link rel="icon" href="${BROWSERLESS_WEB_PANEL_ICON}">
  <style>
    :root{color-scheme:dark;--bg:#101214;--panel:#181b1f;--panel2:#121518;--line:#30363d;--text:#eef2f5;--muted:#9ba7b4;--green:#4ade80;--amber:#fbbf24;--red:#fb7185;--blue:#60a5fa;--coin:#fbbf24}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
    main{max-width:1180px;margin:0 auto;padding:14px}
    header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
    h1{margin:0;font-size:18px;line-height:1.2;font-weight:680;letter-spacing:0}
    button{font:inherit;min-height:32px;border:1px solid var(--line);background:#20252a;color:var(--text);border-radius:6px;padding:5px 10px;cursor:pointer}
    button:hover{border-color:#58616b}
    .toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
    .pill{display:inline-flex;align-items:center;min-height:28px;border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:var(--panel2);color:var(--muted);white-space:nowrap}
    .ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.info{color:var(--blue)}.coin{color:var(--coin)}.small-coin{color:#fde68a}.active-player{color:#fda4af}.muted{color:var(--muted)}
    .value-with-dot{display:inline-flex;align-items:center;gap:6px}
    .field-value-text{min-width:0;overflow-wrap:anywhere}
    .status-dot{width:8px;height:8px;border-radius:999px;flex:0 0 auto;background:currentColor;box-shadow:0 0 0 1px rgba(255,255,255,.12)}
    .status-dot.breathe{animation:status-breathe 1.6s ease-in-out infinite}
    .transport-metric{color:var(--text);font-variant-numeric:tabular-nums}
    .transport-metric .metric-value{font-weight:650}
    .transport-metric.muted,.transport-metric.muted .metric-value{color:var(--muted)}
    @keyframes status-breathe{0%,100%{opacity:.62;transform:scale(.82);box-shadow:0 0 0 0 rgba(255,255,255,.18)}50%{opacity:1;transform:scale(1);box-shadow:0 0 0 6px rgba(255,255,255,0)}}
    .layout{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,2fr);gap:10px;align-items:start}
    .stack{display:flex;flex-direction:column;gap:10px;min-width:0}
    .stats-grid,.player-insights-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
    .battle-panel{border-color:rgba(251,113,133,.38);background:linear-gradient(135deg,rgba(127,29,29,.26),rgba(69,10,10,.14)),var(--panel)}
    .battle-panel[hidden]{display:none}
    .battle-panel .panel-title{color:#fda4af}
    .last-exit-panel{border-color:rgba(96,165,250,.32);background:linear-gradient(135deg,rgba(30,64,175,.16),rgba(15,23,42,.12)),var(--panel)}
    .last-exit-panel[hidden]{display:none}
    .last-exit-panel .panel-title{color:#93c5fd}
    .battle-meta{display:flex;align-items:center;gap:7px;margin:-1px 0 7px;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
    .battle-meta span{display:inline-flex;align-items:baseline;gap:4px;min-width:0}
    .battle-meta-divider{color:#64748b}
    .battle-meta strong{min-width:0;color:#fecdd3;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis}
    .battle-fighters{display:grid;grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr);grid-template-rows:auto 7px auto;gap:5px 8px;align-items:center}
    .fighter-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:4px}
    .fighter-side{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.04em}
    .fighter-name{min-width:0;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fighter-summary{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0;font-variant-numeric:tabular-nums}
    .fighter-summary-main{display:flex;align-items:baseline;gap:7px;min-width:0;overflow:hidden;white-space:nowrap}
    .fighter-summary-main>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fighter-summary-name{font-weight:700}
    .fighter-summary-drop{color:var(--coin);font-weight:650}
    .fighter-summary-state{color:var(--blue);font-size:12px;white-space:nowrap}
    .fighter-summary-hp{flex:0 0 auto;font-weight:700}
    .fighter-target-summary,.fighter-target-summary .fighter-summary-main{flex-direction:row-reverse}
    .fighter-vs{display:flex;grid-column:2;grid-row:2;align-items:center;justify-content:center;min-height:7px;color:var(--red);font-size:13px;font-weight:800;line-height:7px;letter-spacing:.06em}
    .hp-label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
    .hp-track{height:7px;overflow:hidden;border-radius:999px;background:#2a3036;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
    .hp-fill{height:100%;width:0;border-radius:inherit;background:var(--green);transition:width .25s ease,background-color .25s ease}
    .fighter-target-track .hp-fill{margin-left:auto}
    .fighter-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;font-size:12px;font-variant-numeric:tabular-nums}
    .fighter-target-footer{flex-direction:row-reverse}
    .fighter-stamina{display:inline-flex;align-items:center;min-width:0;color:var(--text);white-space:nowrap}
    .hp-fill.warn{background:var(--amber)}.hp-fill.bad{background:var(--red)}.hp-fill.ok{background:var(--green)}
    section{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:10px;min-width:0}
    .panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;min-width:0;cursor:pointer;transition:margin-bottom .25s ease}
    .panel-head h2{margin:0}
    .panel-title{cursor:pointer;user-select:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .panel-title:focus-visible{outline:1px solid var(--blue);outline-offset:3px;border-radius:2px}
    .panel-head-meta{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;max-width:72%;overflow:hidden;white-space:nowrap}
    .panel-head-meta .title-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums}
    .panel-head-meta .title-meta .meta-label{font-weight:500}
    .collapsed-only{display:none}
    .panel-collapsed .collapsed-only{display:inline-flex}
    .panel-collapsed .panel-head{margin-bottom:0}
    .panel-body{max-height:2400px;opacity:1;overflow:hidden;transition:max-height .28s ease,opacity .2s ease,margin-top .28s ease}
    .panel-collapsed>.panel-body{max-height:0;opacity:0;pointer-events:none;margin-top:0}
    #chatPanel .chat-log{max-height:300px;opacity:1;transition:max-height .28s ease,opacity .2s ease}
    .panel-collapse-initializing .panel-head,.panel-collapse-initializing .panel-body,.panel-collapse-initializing #chatPanel .chat-log{transition:none!important}
    h2{font-size:11px;line-height:1.2;margin:0 0 8px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    h3{font-size:11px;line-height:1.2;margin:0 0 6px;color:var(--muted);font-weight:700;letter-spacing:0}
    dl{display:grid;grid-template-columns:minmax(76px,auto) 1fr;gap:5px 9px;margin:0}
    dt{color:var(--muted);min-width:0}
    dd{margin:0;min-width:0;overflow-wrap:anywhere}
    .auth-panel{margin-bottom:0}
    .auth-panel[hidden]{display:none}
    .auth-prompt{color:var(--muted);overflow-wrap:anywhere}
    .auth-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
    a{color:var(--blue);text-decoration:none;overflow-wrap:anywhere}
    a:hover{text-decoration:underline}
    textarea{width:100%;min-height:76px;margin-top:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--text);font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:8px;resize:vertical}
    input{font:inherit}
    pre.auth-url{display:none;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--muted);padding:8px;max-height:120px;overflow:auto}
    .auth-message{min-height:18px;overflow-wrap:anywhere}
    .map-stage{position:relative;width:min(100%,420px);aspect-ratio:1;margin:0 auto;touch-action:pan-y}
    .map-canvas{display:block;width:100%;height:100%;aspect-ratio:1}
    .map-tooltip{position:absolute;z-index:2;display:none;max-width:min(240px,80%);padding:6px 8px;border:1px solid rgba(255,255,255,.2);border-radius:5px;background:rgba(8,12,18,.96);color:var(--text);font-size:12px;line-height:1.4;white-space:pre-line;pointer-events:none;box-shadow:0 5px 16px rgba(0,0,0,.3)}
    .map-tooltip.visible{display:block}
    .nearby-panel{min-width:0}
    .nearby-combined{display:grid;grid-template-columns:minmax(170px,.55fr) minmax(0,1.45fr);gap:10px;align-items:start;min-width:0}
    .nearby-pane{min-width:0}
    .nearby-players-pane{border-left:1px solid var(--line);padding-left:10px}
    .nearby-list{display:grid;gap:0;min-width:0}
    .nearby-row{display:grid;align-items:center;gap:6px;min-height:26px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .nearby-row:last-child{border-bottom:0}
    .nearby-head{color:var(--muted);font-size:11px;font-weight:700}
    .nearby-summary .nearby-cell{grid-column:1/-1;color:var(--muted)}
    .coin-row{grid-template-columns:minmax(48px,1fr) minmax(34px,.5fr) minmax(46px,.65fr)}
    .player-row{grid-template-columns:minmax(150px,2.8fr) minmax(40px,.55fr) minmax(42px,.55fr) minmax(42px,.5fr) minmax(52px,.65fr)}
    .high-drop-list{display:grid;gap:0;min-width:0}
    .high-drop-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.35fr) minmax(72px,.8fr);gap:10px;align-items:center;min-height:26px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .high-drop-row:last-child{border-bottom:0}
    .high-drop-head{position:sticky;top:0;z-index:1;color:var(--muted);font-size:11px;font-weight:700;background:var(--panel)}
    .high-drop-cell{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .high-drop-name{display:flex;align-items:center;gap:6px}
    .high-drop-name.online{color:var(--blue)}
    .high-drop-name.self.online,.high-drop-values.self.online{color:var(--green)}
    .high-drop-name.offline,.high-drop-name.unknown{color:var(--muted)}
    .high-drop-values{color:var(--coin);font-variant-numeric:tabular-nums}
    .high-drop-values.offline,.high-drop-values.unknown{color:var(--muted)}
    .player-insights-body{height:164px;overflow-y:auto;scrollbar-gutter:stable}
    .player-memory-list{display:flex;flex-wrap:wrap;gap:6px 5px;min-height:24px;align-items:center;align-content:flex-start}
    .player-memory-name{display:inline-flex;align-items:center;max-width:100%;height:26px;box-sizing:border-box;padding:2px 5px;border:1px solid transparent;border-radius:4px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .player-memory-empty{color:var(--muted)}
    .easy-kill-score-1{border-color:#B8862C;background:#FFF3C4;color:#8A641C}
    .easy-kill-score-2{border-color:#C58A16;background:#FFE8A3;color:#8B5E08}
    .easy-kill-score-3{border-color:#A86B00;background:#FFD86B;color:#6B4300}
    .dynamic-whitelist-name{border-color:#BFC7D5;background:#FFFFFF;color:#687386}
    .damage-player-name{border-color:#8B1E24;background:#FFD6D8;color:#8A1C24}
    .whitelist-meta-count{color:#687386}.easy-kill-meta-count{color:#8A641C}.damage-meta-count{color:#8A1C24}
    .dynamic-whitelist-add{display:inline-flex;align-items:center;justify-content:center;flex:0 0 16px;width:16px;min-width:16px;max-width:16px;height:16px;min-height:16px;max-height:16px;box-sizing:border-box;padding:0;border:0;line-height:0;color:#fff;background:transparent;cursor:pointer}
    .dynamic-whitelist-add svg{display:block;flex:0 0 16px;width:16px;height:16px;fill:currentColor}
    .dynamic-whitelist-popover{position:fixed;z-index:20;display:flex;gap:5px;padding:7px;border:1px solid rgba(255,255,255,.8);border-radius:6px;background:#101827;box-shadow:0 8px 24px rgba(0,0,0,.35)}
    .dynamic-whitelist-popover input{width:130px;min-height:26px;border:1px solid var(--line);border-radius:4px;background:var(--panel2);color:var(--text);padding:3px 6px}
    .dynamic-whitelist-popover button{min-height:26px;padding:3px 7px}
    .chat-title-meta{display:inline-flex;align-items:center;gap:7px;min-width:0}.chat-refresh-at{font-weight:500;letter-spacing:0;text-transform:none;white-space:nowrap}
    .chat-kill-toggle{min-height:24px;padding:2px 8px;font-size:11px;line-height:1.2}
    .chat-log{height:300px;overflow:auto;scrollbar-gutter:stable}
    .chat-row{display:grid;grid-template-columns:38px minmax(64px,.62fr) minmax(0,1.38fr);gap:6px;align-items:start;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .chat-row:last-child{border-bottom:0}.chat-time{color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}.chat-author{min-width:0;color:var(--blue);font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chat-text{min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
    .chat-row.chat-kill .chat-author,.chat-row.chat-kill .chat-text{color:var(--red)}.chat-row.chat-system .chat-author,.chat-row.chat-system .chat-text{color:var(--blue)}.chat-row.mine .chat-author{color:var(--green)}
    .chat-row.chat-fold-summary{display:flex;align-items:center;justify-content:center;color:var(--muted);text-align:center}
    .chat-fold-text{width:100%;color:var(--muted);font-weight:500;text-align:center}
    .chat-empty{display:flex;height:100%;align-items:center;justify-content:center;color:var(--muted)}
    .chat-compose{display:flex;gap:7px;margin-top:8px}.chat-compose input{flex:1;min-width:0;min-height:34px;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--text);padding:6px 9px}.chat-compose input:disabled{opacity:.6}.chat-compose button{flex:0 0 auto}.chat-compose .chat-collapse-toggle{min-width:52px}
    .chat-hint{margin-top:6px;color:var(--muted);overflow-wrap:anywhere}.chat-hint:empty{display:none}
    .nearby-cell{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .coin-row .nearby-cell:last-child,.player-row .nearby-cell:last-child{text-align:right}
    .distance-badge{font-variant-numeric:tabular-nums}
    .range-attack{color:var(--green)}
    .range-view{color:var(--blue)}
    .target-current,.target-route-next{position:relative;background:var(--target-bg);background-clip:padding-box;padding:3px 0;margin:0}
    .target-current::before,.target-route-next::before{content:"";position:absolute;left:0;top:-1px;bottom:-1px;width:3px;background:var(--target-color);pointer-events:none}
    .target-current+.target-current::before,.target-current+.target-route-next::before,.target-route-next+.target-current::before,.target-route-next+.target-route-next::before{top:0}
    .target-coin{--target-color:rgba(251,191,36,.82);--target-bg:rgba(251,191,36,.13)}
    .target-afk{--target-color:rgba(74,222,128,.8);--target-bg:rgba(74,222,128,.12)}
    .target-combat{--target-color:rgba(251,113,133,.82);--target-bg:rgba(251,113,133,.12)}
    .target-flee{--target-color:rgba(96,165,250,.82);--target-bg:rgba(96,165,250,.12)}
    .target-route-next.target-coin{--target-color:rgba(251,191,36,.45);--target-bg:rgba(251,191,36,.07)}
    .target-bait{--target-color:rgba(251,191,36,.95);--target-bg:rgba(251,191,36,.16)}
    .target-name{display:inline-flex;align-items:center;min-width:0;vertical-align:middle}
    .target-current .target-name,.target-route-next .target-name{padding-left:4px}
    .target-name-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .target-icon{display:inline-block;width:16px;height:16px;flex:0 0 16px;align-self:center;margin-right:5px;overflow:visible;vertical-align:middle;transform:translateY(1px);color:var(--target-color);fill:currentColor}
    .target-icon-coin{transform:translateY(0)}
    @media (max-width:760px){.layout{grid-template-columns:1fr}.stats-grid{grid-template-columns:1fr}}
    @media (max-width:600px){.player-insights-grid{grid-template-columns:1fr}}
    @media (max-width:600px){.nearby-combined{grid-template-columns:1fr}.nearby-players-pane{border-left:0;border-top:1px solid var(--line);padding-left:0;padding-top:10px}}
    @media (max-width:520px){.player-row{grid-template-columns:minmax(112px,2fr) minmax(34px,.5fr) minmax(38px,.55fr) minmax(36px,.5fr) minmax(44px,.6fr);gap:4px}.battle-fighters{grid-template-columns:minmax(0,1fr) 26px minmax(0,1fr);column-gap:5px}.battle-meta{gap:5px;font-size:11px}.battle-meta strong{font-size:11px}}
    @media (max-width:520px){main{padding:10px}header{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body class="panel-collapse-initializing">
  <main>
    <header>
      <h1>囤囤鼠历险记Bot</h1>
    </header>

    <div class="layout">
      <div class="stack left-stack">
        <section data-panel-key="program-status">
          <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">程序状态</h2><div class="panel-head-meta"><span id="programRefreshMeta" class="title-meta muted">--</span></div></div>
          <div class="panel-body">
            <dl>
              <dt>网页版本</dt><dd id="webVersion">${BROWSERLESS_WEB_PANEL_VERSION}</dd>
              <dt>刷新时间</dt><dd id="stamp">--</dd>
              <dt>出口数量</dt><dd id="sourceIpCount">--</dd>
              <dt>当前出口</dt><dd id="sourceIp">--</dd>
              <dt>出口预检阶段</dt><dd id="sourceIpPreflightPhase">--</dd>
              <dt>出口预检进度</dt><dd id="sourceIpPreflightProgress">--</dd>
              <dt>预检当前 IP</dt><dd id="sourceIpPreflightCurrentIp">--</dd>
              <dt>预检最近结果</dt><dd id="sourceIpPreflightLastResult">--</dd>
              <dt>预检下次重试</dt><dd id="sourceIpPreflightNextRetry">--</dd>
              <dt>网络监控</dt><dd id="transportHealthMode">--</dd>
              <dt>实时延迟</dt><dd id="transportLatency">--</dd>
              <dt>本地排队</dt><dd id="transportQueue">--</dd>
              <dt>指令延迟</dt><dd id="transportCommandLatency">--</dd>
              <dt>帧丢失（推断）</dt><dd id="transportFrameLoss">--</dd>
            </dl>
          </div>
        </section>
        <section data-panel-key="account-status">
          <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">账号状态</h2><div class="panel-head-meta"><span id="accountTitleMeta" class="title-meta muted">--</span></div></div>
          <div class="panel-body"><dl id="accountStatus"></dl></div>
        </section>
        <section data-panel-key="role-status">
          <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">角色状态</h2><div class="panel-head-meta"><span id="roleTitleMeta" class="title-meta muted">--</span></div></div>
          <div class="panel-body"><dl id="roleStatus"></dl></div>
        </section>
        <section id="chatPanel" data-panel-key="game-chat">
          <div class="panel-head chat-head">
            <h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">游戏聊天</h2>
            <div class="panel-head-meta">
              <span id="chatRefreshAt" class="chat-refresh-at title-meta muted">--</span>
            </div>
          </div>
          <div class="panel-body">
            <div id="chatLog" class="chat-log"><div class="chat-empty">等待聊天快照</div></div>
            <form id="chatForm" class="chat-compose">
              <button id="chatCollapseToggle" class="chat-collapse-toggle" type="button" aria-expanded="false">展开</button>
              <input id="chatInput" maxlength="240" autocomplete="off" placeholder="输入游戏聊天消息">
              <button id="chatSendBtn" type="submit" disabled>离线</button>
            </form>
            <div id="chatHint" class="chat-hint muted" aria-live="polite"></div>
          </div>
        </section>
      </div>
      <div class="stack right-stack">
        <section id="authPanel" class="auth-panel" data-panel-key="authorization" hidden>
          <div class="panel-head">
            <h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">授权</h2>
            <div class="panel-head-meta"><span id="authState" class="pill">--</span></div>
          </div>
          <div class="panel-body">
            <div id="authPrompt" class="auth-prompt">--</div>
            <div class="auth-actions">
              <button id="authBtn" type="button">获取授权链接</button>
              <a id="authLink" href="#" target="_blank" rel="noreferrer"></a>
            </div>
            <pre id="authUrl" class="auth-url"></pre>
            <textarea id="callbackInput" placeholder="粘贴授权后的游戏回调 URL、登录 JSON 或 approve cURL"></textarea>
            <div class="auth-actions">
              <button id="callbackBtn" type="button">提交回调</button>
              <span id="authMessage" class="auth-message"></span>
            </div>
          </div>
        </section>
        <section data-panel-key="current-action">
          <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">当前动作</h2><div class="panel-head-meta"><span id="actionTitleMeta" class="title-meta collapsed-only">--</span></div></div>
          <div class="panel-body"><dl id="actionDetails"></dl></div>
        </section>
        <section id="battlePanel" class="battle-panel" data-panel-key="battle-status" hidden>
          <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">战斗情况</h2><div class="panel-head-meta"><span id="battleTitleMeta" class="title-meta collapsed-only">--</span></div></div>
          <div class="panel-body">
            <div class="battle-meta">
              <span>距离 <strong id="battleDistance">--</strong></span><b class="battle-meta-divider">|</b>
              <span>开始 <strong id="battleStartedAt">--</strong></span><b class="battle-meta-divider">|</b>
              <span>持续 <strong id="battleDuration">--</strong></span><b class="battle-meta-divider">|</b>
              <span>移动 <strong id="battleMovementDistance">--</strong></span>
            </div>
            <div class="battle-fighters">
              <div class="fighter-summary fighter-self-summary"><div class="fighter-summary-main"><span id="battleSelfName" class="fighter-summary-name">--</span><span id="battleSelfDrop" class="fighter-summary-drop">--</span></div><strong id="battleSelfHp" class="fighter-summary-hp">--</strong></div>
              <div></div>
              <div class="fighter-summary fighter-target-summary"><div class="fighter-summary-main"><span id="battleTargetName" class="fighter-summary-name">--</span><span id="battleTargetDrop" class="fighter-summary-drop">--</span></div><strong id="battleTargetHp" class="fighter-summary-hp">--</strong></div>
              <div class="hp-track fighter-self-track"><div id="battleSelfHpFill" class="hp-fill"></div></div>
              <div class="fighter-vs">VS</div>
              <div class="hp-track fighter-target-track"><div id="battleTargetHpFill" class="hp-fill"></div></div>
              <div class="fighter-footer fighter-self-footer"><div id="battleSelfStamina" class="fighter-stamina">--</div><span id="battleSelfState" class="fighter-summary-state">--</span></div>
              <div></div>
              <div class="fighter-footer fighter-target-footer"><div id="battleTargetStamina" class="fighter-stamina">--</div><span id="battleTargetState" class="fighter-summary-state">--</span></div>
            </div>
          </div>
        </section>
        <section id="lastExitPanel" class="last-exit-panel" data-panel-key="last-exit" hidden>
          <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">上次退出</h2><div class="panel-head-meta"><span id="lastExitTitleMeta" class="title-meta collapsed-only">--</span></div></div>
          <div class="panel-body"><dl id="lastExitDetails"></dl></div>
        </section>
        <div class="stats-grid">
          <section data-panel-key="current-session">
            <div class="panel-head"><h2 id="sessionPanelTitle" class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">本次游戏</h2><div class="panel-head-meta"><span id="sessionTitleMeta" class="title-meta">--</span></div></div>
            <div class="panel-body"><dl id="currentSession"></dl></div>
          </section>
          <section data-panel-key="today-stats">
            <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">今日累计</h2><div class="panel-head-meta"><span id="todayTitleMeta" class="title-meta">--</span></div></div>
            <div class="panel-body"><dl id="todayStats"></dl></div>
          </section>
        </div>
        <div class="player-insights-grid">
          <section data-panel-key="high-drop-players">
            <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">Drop排行</h2><div class="panel-head-meta"><span id="highDropTitleMeta" class="title-meta">--</span></div></div>
            <div class="panel-body player-insights-body"><div id="highDropPlayers" class="high-drop-list"></div></div>
          </section>
          <section data-panel-key="player-memory">
            <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">玩家记录</h2><div class="panel-head-meta"><span id="playerMemoryTitleMeta" class="title-meta">--</span></div></div>
            <div class="panel-body player-insights-body">
              <div id="playerMemoryPlayers" class="player-memory-list"></div>
            </div>
          </section>
        </div>
        <section id="mapPanel" data-panel-key="target-map">
          <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">地图</h2><div class="panel-head-meta"><span id="mapTitleMeta" class="title-meta muted">--</span></div></div>
          <div class="panel-body">
            <div id="mapStage" class="map-stage">
              <canvas id="targetMap" class="map-canvas" width="420" height="420" aria-label="附近目标地图"></canvas>
              <div id="mapTooltip" class="map-tooltip" role="tooltip"></div>
            </div>
          </div>
        </section>
        <section id="nearbyGrid" class="nearby-panel" data-panel-key="nearby-info" hidden>
          <div class="panel-head"><h2 class="panel-title" data-panel-title role="button" tabindex="0" aria-expanded="true">附近信息</h2><div class="panel-head-meta"><span id="nearbyTitleMeta" class="title-meta">--</span></div></div>
          <div class="panel-body">
            <div class="nearby-combined">
              <div class="nearby-pane nearby-coins-pane">
                <h3>金币雷达</h3>
                <div id="nearbyCoins" class="nearby-list"></div>
              </div>
              <div class="nearby-pane nearby-players-pane">
                <h3>玩家雷达</h3>
                <div id="nearbyPlayers" class="nearby-list"></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const token = params.get('token') || localStorage.graspRatBrowserlessToken || '';
    if (token) localStorage.graspRatBrowserlessToken = token;
    const WEB_PANEL_VERSION = ${JSON.stringify(BROWSERLESS_WEB_PANEL_VERSION)};
    const highDropRankValue = ${highDropRankValueCore.toString()};
    const isStaminaExhaustionExitReason = ${isStaminaExhaustionExitReasonCore.toString()};
    const WEB_PANEL_RELOAD_KEY = 'graspRatBrowserlessPanelReloadedVersion';
    const PANEL_COLLAPSE_KEY = 'graspRatBrowserlessPanelCollapsedV1';
    const AUTO_REFRESH_MS = 3000;
    const MAP_STALE_MS = 15000;
    const MAP_MOVE_ANIMATION_MS = 260;
    let autoRefreshTimer = 0;
    let countdownTimer = 0;
    let refreshInFlight = null;
    let chatSendInFlight = false;
    let latestChatStatus = null;
    let chatKillsCollapsed = true;
    let lastStatusReceivedAtMs = 0;
    let lastServerUpdatedAtMs = 0;
    let latestMapStatus = null;
    let mapHitTargets = [];
    let mapEmptyReason = '';
    let mapAnimationFrame = 0;
    let mapRenderedMarkerPositions = new Map();
    let mapRenderedCanvasSize = 0;
    let panelCollapseState = readPanelCollapseState();

    const groupChatMessagesForDisplay = ${groupChatMessagesForDisplay.toString()};
    const groupBlockingFactors = ${groupBlockingFactorsCore.toString()};
    const nearbyCoinIcon = ${nearbyCoinIconCore.toString()};
    const spentStaminaUnit = ${formatSpentStaminaCore.toString()};
    const estimatedHighDropQuota = ${estimatedHighDropQuotaCore.toString()};
    const panelSessionFlags = ${panelSessionFlagsCore.toString()};
    const lastExitPanelVisible = ${lastExitPanelVisibleCore.toString().replace('panelSessionFlagsCore', 'panelSessionFlags')};
    const missCloseExitReasonText = ${missCloseExitReasonTextCore.toString()};
    const recoveryContactExitReasonText = ${recoveryContactExitReasonTextCore.toString()};
    const restartDrainBlockedReasonText = ${restartDrainBlockedReasonTextCore.toString()};
    const mapMarkerKey = ${mapMarkerKeyCore.toString()};
    const mapAnimationProgress = ${mapAnimationProgressCore.toString()};
    const interpolateMapMarker = ${interpolateMapMarkerCore.toString()};
    const transportMetricValueClass = ${transportMetricValueClassCore.toString()};

    const value = v => v === null || v === undefined || v === '' ? '--' : String(v);
    const number = v => v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
    const unit = v => {
      const n = number(v);
      return n === null ? '--' : String(Math.floor(n / 1000));
    };
    const distance = v => {
      const n = number(v);
      if (n === null) return '--';
      return Math.round(n / 100) + 'm';
    };
    const coord = v => {
      const n = number(v);
      return n === null ? '--' : String(Math.round(n));
    };
    const bool = v => v === null || v === undefined ? '--' : (v ? '是' : '否');
    const pad2 = v => String(v).padStart(2, '0');
    const stamp = iso => {
      if (!iso) return '--';
      const date = new Date(iso);
      return Number.isFinite(date.getTime())
        ? [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join(':')
        : iso;
    };
    const minuteStamp = iso => {
      if (!iso) return '--:--';
      const date = new Date(iso);
      return Number.isFinite(date.getTime())
        ? [pad2(date.getHours()), pad2(date.getMinutes())].join(':')
        : '--:--';
    };
    const fullStamp = iso => {
      if (!iso) return '--';
      const date = new Date(iso);
      return Number.isFinite(date.getTime())
        ? [
            date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()),
            [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join(':')
          ].join(' ')
        : iso;
    };
    const elapsedSecondsValue = value => {
      const at = typeof value === 'number' ? value : Date.parse(String(value || ''));
      if (!Number.isFinite(at) || at <= 0) return '--';
      return Math.max(0, Math.floor((Date.now() - at) / 1000)) + 's';
    };
    const elapsedSecondsText = value => elapsedSecondsValue(value) === '--' ? '--' : elapsedSecondsValue(value) + '前';
    const duration = ms => {
      const n = number(ms);
      if (n === null) return '--';
      let seconds = Math.max(0, Math.floor(n / 1000));
      const days = Math.floor(seconds / 86400);
      seconds -= days * 86400;
      const hours = Math.floor(seconds / 3600);
      seconds -= hours * 3600;
      const minutes = Math.floor(seconds / 60);
      seconds -= minutes * 60;
      const parts = [];
      if (days) parts.push(days + '天');
      if (hours) parts.push(hours + '小时');
      if (minutes) parts.push(minutes + '分');
      if (!parts.length || seconds) parts.push(seconds + '秒');
      return parts.join('');
    };
    const durationClock = ms => {
      const n = number(ms);
      if (n === null) return '--';
      const totalSeconds = Math.max(0, Math.floor(n / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return [pad2(hours), pad2(minutes), pad2(seconds)].join(':');
    };
    const countdownUntil = iso => {
      if (!iso) return '--';
      const target = Date.parse(String(iso));
      if (!Number.isFinite(target)) return '--';
      return durationClock(target - Date.now());
    };
    const integer = v => {
      const n = number(v);
      return n === null ? '--' : String(Math.max(0, Math.round(n)));
    };
    const hpText = hp => {
      const n = number(hp);
      return n === null ? '--' : String(Math.max(0, Math.round(n))) + '/100';
    };
    const staminaPair = (remainingMs, maxSeconds) => {
      const n = number(remainingMs);
      return n === null ? '--' : String(Math.max(0, Math.floor(n / 1000))) + '/' + maxSeconds;
    };
    const sourceIpCountText = network => {
      const total = number(network?.sourceIpCount);
      const index = number(network?.sourceIpIndex);
      if ((total === null || total <= 0) && index === null) return '--';
      return (index === null || index <= 0 ? '?' : String(Math.round(index)))
        + '/'
        + (total === null || total <= 0 ? '?' : String(Math.round(total)));
    };
    const sourceIpPreflightPhaseText = network => {
      const preflight = network?.sourceIpPreflight || {};
      const phase = String(preflight.phase || '');
      const queue = String(preflight.queuePhase || '');
      if (phase === 'testing') return queue === 'risk' ? '正在复查风控 IP' : '正在测试普通 IP';
      if (phase === 'retry-wait') return queue === 'risk' ? '风控 IP 临时重试等待' : '普通 IP 临时重试等待';
      if (phase === 'ready') return preflight.reuseWithoutRetest ? '已选出 3 个 IP' : '预检完成';
      if (phase === 'deferred') return '已保留 3 个 IP，等待下一个登录时点';
      if (phase === 'insufficient') return '可用出口不足 3 个，冷却中';
      if (phase === 'login-attempt') return '正在使用主 IP 登录';
      if (phase === 'snapshot-wait') return '正在等待新的登录点快照';
      if (phase === 'active') return '本局三 IP 生命周期已生效';
      if (phase === 'login-failed') return '登录失败，等待重新预检';
      if (phase === 'interrupted') return '预检被停止/重启打断';
      if (phase === 'error') return '出口预检异常，禁止登录';
      return phase || '--';
    };
    const sourceIpPreflightProgressText = network => {
      const preflight = network?.sourceIpPreflight || {};
      const tested = number(preflight.testedCount);
      const discovered = number(preflight.discoveredCount);
      const available = number(preflight.availableCount);
      const required = number(preflight.requiredCount) || 3;
      const risk = number(preflight.riskCount);
      const progress = tested === null || discovered === null ? '--' : Math.round(tested) + '/' + Math.round(discovered);
      return progress + '，可用 ' + (available === null ? '--' : Math.round(available)) + '/' + Math.round(required)
        + '，风控 ' + (risk === null ? '--' : Math.round(risk));
    };
    const sourceIpPreflightLastResultText = network => {
      const preflight = network?.sourceIpPreflight || {};
      const status = number(preflight.lastStatus);
      const error = String(preflight.lastErrorCategory || '');
      const attempt = number(preflight.currentAttempt);
      if (status !== null) return 'HTTP ' + Math.round(status) + (attempt === null ? '' : ' / 第 ' + Math.round(attempt) + ' 次');
      if (error) return error + (attempt === null ? '' : ' / 第 ' + Math.round(attempt) + ' 次');
      return '--';
    };
    const utc8DayKey = value => new Date(Number(value ?? Date.now()) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dailyFirstLoginExempt = status => {
      if (status?.stats?.currentSession?.online) return false;
      const today = status?.stats?.today || {};
      return String(today.day || '') !== utc8DayKey(Date.now()) || Math.max(0, number(today.sessionCount) || 0) <= 0;
    };
    const sourceIpDeferredDetailText = status => dailyFirstLoginExempt(status)
      ? '已保留 3 个 IP，等待下一个登录时点；每日首次登录豁免仍有效，届时直接使用主 IP 登录'
      : '已保留 3 个 IP，等待下一个登录时点；届时不重复主页测试，并先使用主 IP 做快照安全检查';
    const transportModeText = health => {
      if (!health || health.enabled === false) return '--';
      if (!health.connected || health.mode === 'offline') return '离线';
      if (health.mode === 'paused') return '挂机暂停';
      if (health.mode === 'warming') {
        const remaining = number(health.activity?.warmupRemainingMs);
        return remaining === null ? '采样预热' : '采样预热 ' + (remaining / 1000).toFixed(1) + 's';
      }
      if (health.mode === 'active') return '活跃采样';
      return '等待数据';
    };
    const metricValueFragment = (value, metricKind, unitText = '') => ({
      text: value === null ? '--' : Math.round(value) + unitText,
      className: 'metric-value ' + transportMetricValueClass(value, metricKind)
    });
    const latencyPairFragments = (metric, metricKind) => {
      const current = number(metric?.currentMs);
      const p90 = number(metric?.p90Ms);
      if (current === null && p90 === null) return [metricValueFragment(null, metricKind)];
      return [
        { text: '当前 ' },
        metricValueFragment(current, metricKind, 'ms'),
        { text: ' / P90 ' },
        metricValueFragment(p90, metricKind, 'ms')
      ];
    };
    const transportCommandLatencyFragments = command => {
      const movement = number(command?.movementP90Ms);
      const shooting = number(command?.shootingAckP90Ms);
      if (movement === null && shooting === null) return [metricValueFragment(null, 'movement')];
      return [
        { text: '移动 ' },
        metricValueFragment(movement, 'movement', 'ms'),
        { text: ' / 射击 ' },
        metricValueFragment(shooting, 'shooting', 'ms')
      ];
    };
    const transportFrameLossFragments = frameLoss => {
      const percent = number(frameLoss?.percent);
      const missing = number(frameLoss?.missingTicks);
      const expected = number(frameLoss?.expectedTicks);
      if (percent === null || expected === null || expected <= 0) return [metricValueFragment(null, 'frameLoss')];
      const valueClass = 'metric-value ' + transportMetricValueClass(percent, 'frameLoss');
      return [
        { text: percent.toFixed(2) + '%', className: valueClass },
        { text: ' (' },
        { text: String(Math.round(missing || 0)), className: valueClass },
        { text: '/' },
        { text: String(Math.round(expected)), className: valueClass },
        { text: ')' }
      ];
    };
    const transportMetricClass = health => !health
      || !health.connected
      || health.mode === 'offline'
      || health.mode === 'paused'
      ? 'transport-metric muted'
      : 'transport-metric';
    const transportHealthClass = health => {
      if (!health || !health.connected || health.mode === 'offline' || health.mode === 'paused') return 'muted';
      if (health.exit?.triggered || health.exit?.latencyBreached || health.exit?.frameLossBreached) return 'bad';
      return health.mode === 'active' ? 'ok' : 'info';
    };
    function rowKey(pair, index) {
      return String(pair?.[3] || pair?.[0] || index);
    }
    function readExistingRows(node) {
      const map = new Map();
      const children = Array.from(node.children);
      for (let i = 0; i < children.length; i += 2) {
        const dt = children[i];
        const dd = children[i + 1];
        if (!dt || !dd || dt.tagName !== 'DT' || dd.tagName !== 'DD') continue;
        const key = dt.dataset.rowKey || dd.dataset.rowKey || dt.textContent || String(i / 2);
        map.set(key, { dt, dd });
      }
      return map;
    }
    function syncDataset(node, attrs) {
      const next = {};
      for (const [key, attrValue] of Object.entries(attrs || {})) {
        if (['className', 'dot', 'pulse'].includes(key)) continue;
        if (attrValue === null || attrValue === undefined || attrValue === false) continue;
        next[key] = String(attrValue);
      }
      const previousKeys = String(node.dataset.extraKeys || '').split(',').filter(Boolean);
      for (const key of previousKeys) {
        if (!(key in next)) delete node.dataset[key];
      }
      for (const [key, attrValue] of Object.entries(next)) {
        if (node.dataset[key] !== attrValue) node.dataset[key] = attrValue;
      }
      const nextKeys = Object.keys(next).join(',');
      if (nextKeys) {
        if (node.dataset.extraKeys !== nextKeys) node.dataset.extraKeys = nextKeys;
      } else {
        delete node.dataset.extraKeys;
      }
    }
    function setValueText(node, text) {
      const next = value(text);
      const target = node.querySelector('.field-value-text') || node;
      if (target.textContent !== next) target.textContent = next;
      if (node.dataset.value !== next) node.dataset.value = next;
    }
    function syncValueNode(node, text, attrs) {
      const nextText = value(text);
      const dotClass = attrs?.dot ? String(attrs.dot) : '';
      const pulse = Boolean(attrs?.pulse);
      const classes = [attrs?.className || '', dotClass ? 'value-with-dot' : ''].filter(Boolean).join(' ');
      if (node.className !== classes) node.className = classes;
      syncDataset(node, attrs);
      const signature = JSON.stringify({ text: nextText, dotClass, pulse });
      if (node.dataset.renderSignature === signature) return;
      if (dotClass) {
        const dot = document.createElement('span');
        dot.className = ['status-dot', dotClass, pulse ? 'breathe' : ''].filter(Boolean).join(' ');
        dot.setAttribute('aria-hidden', 'true');
        const textNode = document.createElement('span');
        textNode.className = 'field-value-text';
        textNode.textContent = nextText;
        node.replaceChildren(dot, textNode);
      } else {
        node.textContent = nextText;
      }
      node.dataset.renderSignature = signature;
      node.dataset.value = nextText;
    }
    function rows(id, pairs) {
      const node = document.getElementById(id);
      if (!node) return;
      const existing = readExistingRows(node);
      const keep = new Set();
      let cursor = 0;
      for (let index = 0; index < pairs.length; index += 1) {
        const pair = pairs[index];
        const key = rowKey(pair, index);
        let record = existing.get(key);
        if (!record) {
          record = {
            dt: document.createElement('dt'),
            dd: document.createElement('dd')
          };
          record.dt.dataset.rowKey = key;
          record.dd.dataset.rowKey = key;
        }
        keep.add(key);
        if (record.dt.textContent !== value(pair[0])) record.dt.textContent = value(pair[0]);
        syncValueNode(record.dd, pair[1], pair[2] && typeof pair[2] === 'object' ? pair[2] : null);
        if (node.children[cursor] !== record.dt) node.insertBefore(record.dt, node.children[cursor] || null);
        cursor += 1;
        if (node.children[cursor] !== record.dd) node.insertBefore(record.dd, node.children[cursor] || null);
        cursor += 1;
      }
      for (const [key, record] of existing.entries()) {
        if (keep.has(key)) continue;
        record.dt.remove();
        record.dd.remove();
      }
    }
    function classAttrs(className, extra = null) {
      return {
        ...(extra && typeof extra === 'object' ? extra : {}),
        className
      };
    }
    function boolAttrs(flag) {
      if (flag === null || flag === undefined) return classAttrs('info');
      return classAttrs(flag ? 'ok' : 'bad');
    }
    function authStatusAttrs(status) {
      const auth = status.auth || {};
      if (auth.invalid) return classAttrs('bad');
      if (auth.needsReauth || auth.missing) return classAttrs('warn');
      if (auth.authenticated || status.session?.authenticated) return classAttrs('ok');
      return classAttrs('info');
    }
    function tokenStatusAttrs(status) {
      if (status.auth?.invalid) return classAttrs('bad');
      return classAttrs(status.session?.tokenPresent ? 'ok' : 'bad');
    }
    function gameStatusAttrs(status) {
      const inGame = Boolean(status.game?.inGame);
      const tone = inGame ? 'ok' : (status.game?.state === 'waiting' ? 'warn' : 'info');
      return classAttrs(tone, { dot: tone, pulse: inGame });
    }
    function hpAttrs(hp) {
      const n = number(hp);
      if (n === null) return classAttrs('info');
      if (n >= 80) return classAttrs('ok');
      if (n >= 50) return classAttrs('warn');
      return classAttrs('bad');
    }
    function staminaAttrs(remainingMs, maxSeconds) {
      const n = number(remainingMs);
      if (n === null) return classAttrs('info');
      const maxMs = Math.max(1, Number(maxSeconds || 0) * 1000);
      const ratio = maxMs > 0 ? n / maxMs : 1;
      if (n <= 0 || ratio <= 0.05) return classAttrs('bad');
      if (ratio <= 0.2) return classAttrs('warn');
      return classAttrs('ok');
    }
    function loginPointAttrs(status) {
      const display = loginPointDisplay(status);
      if (display.reviewing) return classAttrs('warn');
      if (display.state === 'safe') return classAttrs('ok');
      if (display.state === 'unsafe') return classAttrs('bad');
      return classAttrs('warn');
    }
    function targetLabel(target) {
      if (!target) return '--';
      const name = target.name || (target.userId ? '#' + target.userId : (target.id ? '#' + target.id : '目标'));
      const parts = [name];
      if (target.distance !== null && target.distance !== undefined) parts.push('距离 ' + distance(target.distance));
      if (target.hp !== null && target.hp !== undefined) parts.push('血量 ' + target.hp);
      if (target.drop !== null && target.drop !== undefined) parts.push('掉落 ' + target.drop);
      if (target.amount !== null && target.amount !== undefined) parts.push('金币 ' + target.amount);
      if (target.invulnerable) parts.push('无敌 ' + invulnerableText(target.invulnerableRemainingMs));
      return parts.join(' / ');
    }
    function combatExitHpText(status) {
      const exit = status.game?.inGame
        ? (status.combat?.exit || {})
        : (status.recentExit || status.combat?.exit || {});
      const selfHp = number(exit.selfHp);
      const targetHp = number(exit.targetHp);
      const engagedTargets = Array.isArray(exit.engagedTargets)
        ? exit.engagedTargets.filter(target => number(target?.hp) !== null)
        : [];
      if (selfHp === null && targetHp === null && !engagedTargets.length) return '--';
      const parts = [];
      if (selfHp !== null) parts.push('我方 ' + selfHp);
      if (engagedTargets.length > 1) {
        for (const target of engagedTargets) {
          const name = target.name || (target.id ? '#' + target.id : '威胁');
          parts.push(name + ' ' + number(target.hp));
        }
      } else if (targetHp !== null) {
        parts.push('敌方 ' + targetHp);
      }
      const hpGap = number(exit.hpGap);
      if (engagedTargets.length <= 1 && hpGap !== null) parts.push('血差 ' + hpGap);
      return parts.join(' / ');
    }
    function recentBattle(status) {
      return status.recentExit?.battle || null;
    }
    function targetIdentity(target) {
      if (!target) return '';
      const id = target.userId ?? target.user_id ?? target.entityId ?? target.entity_id ?? target.id;
      return id === null || id === undefined || id === '' ? '' : String(id);
    }
    function recentExitThreat(status) {
      const threat = status.recentExit?.target || null;
      const battleTarget = recentBattle(status)?.target || null;
      const threatId = targetIdentity(threat);
      const battleId = targetIdentity(battleTarget);
      if (!threat || (threatId && battleId && threatId === battleId)) return null;
      return threat;
    }
    function hpTriggeredExit(status, reason) {
      const exit = status.recentExit || status.combat?.exit || {};
      return number(exit.threshold) !== null
        || number(exit.minHpGap) !== null
        || /(?:^|-)hp(?:-|$)|injury|predicted-leave-hp|ttd-below-ttk/i.test(String(reason || ''));
    }
    function recentBattleOutcomeText(status) {
      const battle = recentBattle(status);
      if (!battle) return '--';
      if (battle.targetReappearedAfterKill) return '前段已击杀；目标重现后我方主动退出';
      if (battle.outcome === 'victory') return '胜利，目标已被击败';
      if (battle.outcome === 'defeat') return '失败，角色已被击败';
      if (battle.outcome === 'self-left') return '未击杀，我方主动退出';
      return '战斗结束，未确认击杀';
    }
    function recentBattleTimeText(status) {
      const battle = recentBattle(status);
      if (!battle) return '--';
      const windowText = battle.startedAt
        ? stamp(battle.startedAt) + (battle.endedAt ? ' - ' + stamp(battle.endedAt) : '')
        : (battle.endedAt ? stamp(battle.endedAt) : '--');
      const durationValue = number(battle.durationMs);
      return joinNonBlank([windowText, durationValue === null ? '' : '持续 ' + durationClock(durationValue)]);
    }
    function recentBattleHpText(status) {
      const battle = recentBattle(status);
      if (!battle) return '--';
      const targetName = battle.target?.name || '敌方';
      const sideText = (label, startHp, endHp) => {
        const start = number(startHp);
        const end = number(endHp);
        if (start !== null && end !== null) return label + ' ' + start + ' → ' + end;
        return '';
      };
      if (battle.targetReappearedAfterKill) {
        const targetStart = number(battle.targetHpStart);
        const targetEnd = number(battle.targetHpEnd);
        return joinNonBlank([
          sideText('我方', battle.selfHpStart, battle.selfHpEnd),
          targetStart === null ? targetName + ' 已在前段被击杀' : targetName + ' ' + targetStart + ' → 0（前段击杀）',
          targetEnd === null ? '' : targetName + '重现后 ' + targetEnd
        ]);
      }
      return joinNonBlank([
        sideText('我方', battle.selfHpStart, battle.selfHpEnd),
        sideText(targetName, battle.targetHpStart, battle.targetHpEnd)
      ]);
    }
    function recentInjuryHpText(status) {
      const injury = status.recentExit?.injury || {};
      const previousHp = number(injury.previousHp);
      const currentHp = number(injury.currentHp);
      if (previousHp === null || currentHp === null) return '';
      const hpDrop = number(injury.hpDrop);
      return '我方 ' + previousHp + ' → ' + currentHp
        + (hpDrop === null ? '' : ' / 本次承伤 ' + hpDrop);
    }
    function confirmedLeaveHpText(status) {
      const confirmation = status.recentExit?.leaveConfirmation || {};
      const selfHp = number(confirmation.selfHp);
      if (selfHp === null) return '';
      const hpLoss = number(confirmation.hpLossAfterTrigger);
      return '我方 ' + selfHp
        + (hpLoss !== null && hpLoss > 0 ? ' / 退出请求期间再损失 ' + hpLoss : '');
    }
    function recentBattleDamageText(status) {
      const battle = recentBattle(status);
      if (!battle) return '--';
      const selfDamage = number(battle.selfDamage);
      const targetDamage = number(battle.targetDamage);
      if (battle.targetReappearedAfterKill) {
        return joinNonBlank([
          selfDamage === null ? '' : '交战窗口承伤 ' + selfDamage,
          '目标重现，未汇总跨重生对敌伤害'
        ]);
      }
      return joinNonBlank([
        selfDamage === null ? '' : '我方承伤 ' + selfDamage,
        targetDamage === null ? '' : '对敌造成 ' + targetDamage
      ]);
    }
    function recentBattleHealingText(status) {
      const battle = recentBattle(status);
      if (!battle) return '';
      const selfHealing = number(battle.selfHealing);
      const targetHealing = number(battle.targetHealing);
      return joinNonBlank([
        selfHealing === null || selfHealing <= 0 ? '' : '我方恢复 ' + selfHealing,
        battle.targetReappearedAfterKill
          ? (battle.target?.name || '敌方') + '击杀后以满血重现（非恢复）'
          : '',
        battle.targetReappearedAfterKill || targetHealing === null || targetHealing <= 0
          ? ''
          : (battle.target?.name || '敌方') + '恢复 ' + targetHealing
      ]);
    }
    function recentBattleShootingText(status) {
      const battle = recentBattle(status);
      if (!battle) return '--';
      const requestedShots = number(battle.requestedShots);
      const acceptedShots = number(battle.acceptedShots ?? battle.actualShots);
      const hits = number(battle.confirmedHits);
      const hitRate = number(battle.estimatedHitRate);
      const shotText = requestedShots !== null && acceptedShots !== null && requestedShots !== acceptedShots
        ? '请求 ' + requestedShots + ' 发 / 确认 ' + acceptedShots + ' 发'
        : (acceptedShots === null ? '' : acceptedShots + ' 发');
      return joinNonBlank([
        shotText && battle.targetReappearedAfterKill ? '交战窗口 ' + shotText : shotText,
        hits === null ? '' : hits + ' 中',
        hitRate === null ? '' : '确认命中率 ' + hitRate + '%'
      ]);
    }
    function pointCoordText(point) {
      if (!point || (number(point.x) === null && number(point.y) === null)) return '--';
      return coord(point.x) + ', ' + coord(point.y);
    }
    const reasonMap = {
      'best-opportunity-coin': '综合收益最高',
      'best-opportunity-coin-route': '综合收益最高',
      'best-opportunity-visible-coin': '去看得见的金币',
      'high-value-visible-coin-priority': '优先捡高价值金币',
      'post-kill-drop-priority': '优先捡刚击杀目标的掉币',
      'post-kill-loot-safe-dodge': '安全闪避并接近大额掉币',
      'near-coin-priority': '优先捡近处金币',
      'foot-coin-priority': '先捡脚边金币',
      'single-coin-bait-hold': '当日时间充裕，动态收益门槛生效，守着 1 金币等待捡币脚本',
      'single-coin-bait-return': '返回 1 金币诱饵附近',
      'single-coin-bait-release': '发现新收益，先捡掉 1 金币诱饵',
      'best-opportunity': '综合收益最高',
      'best-opportunity-drop-target': '选择收益最高的目标',
      'best-opportunity-afk-drop-target': '攻击不动且有掉落的目标',
      'approach-profitable-drop-target': '靠近高收益目标',
      'opportunistic-afk-drop-shot': '顺手打不动的目标',
      'combat-attack': '正在打架',
      'combat-spacing': '保持距离并开火',
      'combat-tangent-dodge': '边躲边打',
      'combat-trade-disadvantage-leave': '战斗交换持续不利，预计继续交战风险过高，主动退出',
      'combat-pressure-disadvantage-leave': '遭到持续火力压制，我方血量处于劣势，主动退出',
      'combat-hp-disadvantage-leave': '与敌人交战时血量差距过大，主动退出',
      'combat-low-hp-disadvantage-leave': '战斗中我方低血且落后，主动退出',
      'combat-low-hp-no-damage-leave': '战斗中我方低血且久攻未造成伤害，主动退出',
      'combat-critical-hp-leave': '战斗中我方血量进入危险线，紧急退出',
      'cloudflare-challenge': 'Cloudflare 挑战已确认，自动登录已停止',
      'realtime-transport-degraded': '战斗中实时传输持续异常，为避免失去控制，主动退出',
      'realtime-transport-critical-latency': '实时传输延迟严重，已强制退出并等待确认离场',
      'outbound-control-unresponsive': '战斗中移动或射击指令持续失效，为避免原地承伤，主动退出',
      'combat-action-settlement-stalled': '战斗中移动指令失效，为避免原地承伤，主动退出',
      'combat-miss-close-timeout-leave': '攻击效率持续低下且无法保持更近距离，为避免无效体力消耗而主动退出',
      'combat-no-damage-generation-limit-leave': '普通收益战斗持续无伤害达到全局上限，主动退出止损',
      'defensive-exchange-no-progress-leave': '防守交战持续无进展，撤退后仍无法脱离，主动退出',
      'combat-exit-poor-exchange': '持续交战的伤害交换明显不利，主动退出',
      'injury-leave': '角色受伤后为避免继续掉血，主动退出',
      'pursuit-leave': '被危险玩家持续追击，主动退出',
      'profit-live-snapshot-active-threat': '附近玩家有活动威胁证据，退出',
      'recovery-low-hp-active-threat-leave': '恢复时活动玩家进入攻击射程外的血量安全预警区，主动退出',
      'recovery-low-hp-contact-leave': '低血量恢复时，活动玩家持续逼近，主动退出',
      'recovery-contact-guard-retreat': '回血时发现活动玩家持续逼近，保持闪避储备并撤离接触区',
      'recovery-contact-threat-leave': '回血时逼近玩家进入攻击范围或已开火，主动退出',
      'recovery-contact-no-dodge-budget-leave': '回血时玩家持续逼近且闪避体力不足，主动退出',
      'dynamic-whitelist-low-hp-contact-leave': '低血量时动态白名单玩家进入安全半径，主动退出',
      'dynamic-whitelist-contact-no-dodge-budget-leave': '动态白名单玩家近身且闪避体力不足，主动退出',
      'incoming-bullet-dodge': '发现碰撞路径来弹，立即闪避',
      'stamina-budget-coin-leave': '体力不足，退出等待恢复',
      'stamina-exhausted-leave': '体力耗尽，退出等待恢复',
      'dynamic-profit-threshold-wait': '当日时间充裕，动态收益门槛生效，等待更高收益目标',
      'outside-center-hard-boundary-leave': '已超出中心区 1300 米硬边界且无大额金币目标，立即退出',
      'outside-center-idle-timeout-leave': '超出中心区等待 3 分钟仍无收益，退出后重连',
      'wait-for-full-stamina-and-hp': '等待血量和体力恢复',
      'realtime-control-released': '当前没有需要实时接管的战斗或避险动作，等待常规规划',
      'move-to-target': '向目标移动',
      'no-opportunistic-shot': '没有顺手开火目标',
      'missing-target': '没有目标',
      'no-target': '没有目标',
      'manual-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'learned-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'imported-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'next-login-point-pending-snapshot-safety': '等待下一轮登录点安全检查',
      'login-point-safe-connecting': '登录点已安全，正在连接游戏',
      'manual-session-updated': '授权已更新，等待下一轮连接',
      'auth-token-invalid': '登录信息失效，需要重新授权',
      'unsafe-login-point': '登录点不安全',
      'snapshot safety not confirmed: active-near-login-point': '登录点附近有危险玩家，暂不进入',
      'snapshot safety not confirmed: damage-actor-near-login-point': '今日伤害过我的玩家在登录点附近，暂不进入',
      'snapshot-safety-streak-pending': '登录点已安全，等待连续确认',
      'snapshot-safety-streak-missing': '缺少登录点安全结果',
      'daily-first-login-delay': '每日首次登录将在 00:02 开始',
      'missing-manual-session': '等待登录信息',
      'missing-login-point': '缺少登录点坐标',
      'missing-snapshot-tick': '快照缺少时间戳',
      'stale-snapshot-tick': '快照过期',
      'no-prior-tick': '没有历史时间戳',
      fresh: '快照已更新',
      safe: '安全',
      'active-near-login-point': '登录点附近有危险玩家',
      'damage-actor-near-login-point': '今日伤害过我的玩家在登录点附近',
      'single-blocker-timeout-bypass': '同一名玩家持续阻挡超过 1 小时，满血强制登录',
      'previous-bypass-consumed': '上一轮强制登录机会已使用',
      'blocker-changed': '阻碍玩家已变化，重新计时',
      'new-single-blocker': '开始记录单一阻碍玩家',
      'login-point-not-full-hp': '登录点记录不是满血',
      'multiple-blocking-players': '附近存在多名阻碍玩家',
      'no-single-blocking-player': '当前不是单一玩家阻挡',
      'non-player-blocking-factor': '存在玩家以外的安全阻碍',
      'self-present-reentry': '已经在游戏中，直接连接',
      'cycle-complete': '本轮结束，等待下一轮',
      'ws-closed': '连接断开，准备重连',
      'ws-error': '连接异常，准备重连',
      'frame-gap': '画面更新中断，准备重连',
      'action-settlement-stalled': '非战斗移动指令未产生位置变化，正在重连',
      'stale-self': '自身状态太久没更新，准备重连',
      'no-self': '没有看到自己，等待恢复',
      'direct-leave-failed': '退出确认失败，重试',
      'shutdown-leave': '程序停止或重启前安全退出',
      'restart-drain-ready': '程序重启前已安全退出',
      'restart-drain-new-commitment-blocked': '程序正在准备重启，已暂停接取新的金币或战斗任务',
      'confirmed-leave-snapshot-quarantine': '已确认退出，等待快照刷新',
      'stale-confirmed-leave-snapshot-tick': '已确认退出，等待更新后的快照',
      'explicit-stop': '手动停止',
      'self-test': '测试',
      'login-point-bootstrap-failed': '登录点检查失败',
      'source-ip-preflight': '正在测试出口 IP',
      'source-ip-preflight-ready': '出口 IP 预检完成',
      'source-ip-preflight-temporary-error': '出口 IP 临时异常，等待重试',
      'source-ip-preflight-insufficient': '可用出口不足 3 个，冷却一小时',
      'source-ip-preflight-deferred': '出口测试耗时超过 10 秒，等待下一个登录时点',
      'source-ip-preflight-deferred-next-login-point': '出口测试耗时超过 10 秒，已保留 3 个 IP',
      'source-ip-preflight-reused-without-retest': '复用已保存的 3 个出口 IP，不重复测试',
      'source-ip-preflight-error': '出口预检异常，禁止登录',
      'source-ip-risk-403': '主页返回 403，已加入风控列表',
      'source-ip-login-websocket-attempt': '正在使用主出口登录',
      'snapshot-safety-retry': '重新检查登录点安全',
      'snapshot-confirmed-offline': '快照确认角色已离线',
      'in-game-snapshot-safety-retry': '可能仍在游戏中，快速重连',
      'unsupported-control-mode': '当前方式不支持',
      'unknown-error': '出现异常'
    };
    const dataGapMap = {
      'self-stamina-from-snapshot': '体力数据来自快照补全',
      'snapshot-coin-fallback-only': '没有实时金币数据，使用快照金币',
      'unknown-realtime-frame-age': '实时画面更新时间未知',
      'missing-realtime-self': '实时自身状态缺失',
      'no-coin-frame-type-observed': '未收到实时金币数据',
      'self-killed-player-drop-visible': '发现自己击杀后的掉落',
      'snapshot-active-threat-visible': '快照发现危险玩家',
      'whitelisted-target-visible': '附近有白名单目标，已跳过',
      'recently-active-target-visible': '附近目标近期活动，谨慎处理',
      'afk-stamina-cooldown-target-visible': 'AFK目标体力冷却中',
      'no-realtime-bullet-evidence': '没有实时子弹证据',
      'missing-self-or-target': '缺少自己或目标状态'
    };
    const kindMap = {
      coin: '捡金币',
      'seek-coin': '去捡金币',
      'seek-enemy': '靠近挂机玩家',
      'profit-candidate': '选择金币目标',
      attack: '攻击目标',
      'combat-live': '打架',
      velocity: '移动中',
      flee: '避开危险',
      leave: '退出游戏',
      'safety-exit': '退出游戏',
      recover: '恢复',
      patrol: '巡找',
      wait: '等待',
      'loop-wait': '等待下一轮',
      stop: '停止',
      stopped: '已停止',
      'post-attack-drop-wait': '等待掉落',
      'return-block-scan': '避开危险',
      'source-ip-preflight': '测试出口 IP',
      'source-ip-preflight-cooldown': '出口不足冷却'
    };
    const modeMap = {
      'read-only': '只观察',
      'movement-only': '只移动',
      'non-combat-profit': '只捡金币',
      'profit-live': '自动捡金币',
      'combat-dry-run': '模拟打架',
      'combat-live': '自动打架',
      'dry-run': '演练',
      idle: '空闲'
    };
    const reasonWordMap = {
      active: '危险玩家',
      action: '动作',
      afk: '不动目标',
      after: '之后',
      approach: '靠近',
      attack: '攻击',
      auth: '登录',
      blocked: '被拦住',
      bootstrap: '初始化',
      budget: '预算',
      candidate: '候选目标',
      close: '靠近',
      closed: '断开',
      coin: '金币',
      combat: '打架',
      command: '指令',
      complete: '结束',
      connect: '连接',
      control: '控制',
      critical: '危险血量',
      danger: '危险',
      decision: '判断',
      disabled: '关闭',
      disadvantage: '劣势',
      dodge: '躲避',
      drop: '掉落',
      error: '异常',
      explicit: '手动',
      failed: '失败',
      fallback: '备用检查',
      firing: '开火',
      frame: '画面',
      gap: '中断',
      global: '全局',
      high: '高',
      hold: '等待',
      hp: '血量',
      ignore: '忽略',
      injury: '受伤',
      invulnerable: '无敌',
      leave: '退出',
      live: '实时',
      login: '登录点',
      low: '低',
      manual: '手动',
      missing: '缺少',
      mode: '方式',
      motion: '移动',
      move: '移动',
      moving: '移动',
      near: '附近',
      no: '没有',
      offline: '离线',
      opportunity: '机会',
      opportunistic: '顺手',
      passive: '普通目标',
      pending: '等待',
      point: '位置',
      post: '之后',
      pressure: '压力',
      priority: '优先',
      profit: '收益',
      pursuit: '追击',
      recover: '恢复',
      recovery: '恢复',
      reconnect: '重连',
      reentry: '继续接管',
      retry: '重试',
      route: '路线',
      safe: '安全',
      safety: '安全检查',
      scan: '扫描',
      self: '自己',
      session: '登录信息',
      shoot: '开火',
      shot: '开火',
      snapshot: '快照检查',
      spacing: '保持距离',
      stale: '过期',
      stamina: '体力',
      stop: '停止',
      stuck: '卡住',
      target: '目标',
      threat: '危险',
      timeout: '超时',
      token: '登录信息',
      transport: '连接',
      unsupported: '不支持',
      unsafe: '不安全',
      value: '价值',
      velocity: '移动',
      visible: '可见',
      wait: '等待',
      whitelist: '白名单',
      whitelisted: '白名单',
      ws: '连接'
    };
    function kindText(kind) {
      if (!kind) return '--';
      return kindMap[kind] || '等待';
    }
    function reasonText(reason) {
      const text = String(reason || '');
      if (!text) return '--';
      if (reasonMap[text]) return reasonMap[text];
      if (/stamina/i.test(text)) return '体力不足，等待恢复';
      if (/coin/i.test(text)) return '正在找金币';
      if (/leave/i.test(text)) return '正在退出游戏';
      if (/combat/i.test(text)) return '正在处理打架';
      if (/active|threat|danger/i.test(text)) return '附近有危险';
      if (/wait/i.test(text)) return '等待中';
      if (/stop/i.test(text)) return '已停止';
      if (/403|forbidden|unauthorized|not logged in/i.test(text)) return '登录信息可能失效，需要重新授权';
      if (/login|session|auth|token/i.test(text)) return '等待登录信息';
      if (/ws|websocket|connect|frame|transport/i.test(text)) return '连接不稳定';
      if (/whitelist/i.test(text)) return '目标在白名单，跳过';
      const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const translated = [];
      for (const word of words) {
        if (/^\d+$/.test(word)) continue;
        const mapped = reasonWordMap[word];
        if (mapped && !translated.includes(mapped)) translated.push(mapped);
      }
      return translated.length ? translated.join('，') : '状态更新中';
    }
    function dangerousPlayerExitReasonText(status, reason) {
      const raw = String(reason || '');
      const recoveryContactText = recoveryContactExitReasonText(status, raw);
      if (recoveryContactText) return recoveryContactText;
      if (raw === 'combat-miss-close-timeout-leave') {
        const detail = missCloseExitReasonText(status.recentExit?.missClose || status.combat?.exit?.missClose || {});
        if (detail) return detail;
      }
      if (raw === 'injury-leave') {
        const battle = status.game?.inGame ? null : recentBattle(status);
        const target = status.decision?.target || status.action?.target || battle?.target || status.recentExit?.target || null;
        if (target) {
          const damage = battle ? recentBattleDamageText(status) : '--';
          const name = target.name || (target.userId !== null && target.userId !== undefined ? '玩家 ' + target.userId : '附近玩家');
          return '与 ' + name + ' 交战后受伤' + (damage === '--' ? '' : '（' + damage + '）') + '，主动退出';
        }
      }
      if (raw !== 'profit-live-snapshot-active-threat') return reasonText(raw);
      const target = status.action?.target || status.decision?.target || status.recentExit?.target || null;
      if (!target) return reasonText(raw);
      const evidence = [];
      if (target.distance !== null && target.distance !== undefined) evidence.push('距离 ' + distance(target.distance));
      if (String(target.profitMetadataMode || '').toLowerCase() === 'active' || target.profitMetadataActive) {
        evidence.push('快照为 Active');
      } else if (target.active) {
        evidence.push('实时活动');
      }
      if (target.firing) evidence.push('正在开火');
      if (target.moving) evidence.push('正在移动');
      else if (target.recentlyMoved || target.recentlyActive) evidence.push('近期有活动');
      if (target.invulnerable) evidence.push('无敌还剩 ' + invulnerableText(target.invulnerableRemainingMs));
      const name = target.name || (target.userId !== null && target.userId !== undefined ? '玩家 ' + target.userId : '附近玩家');
      return '危险玩家 ' + name + (evidence.length ? '（' + evidence.join('、') + '）' : '') + '，退出';
    }
    function lastExitReasonText(status, reason) {
      const translated = dangerousPlayerExitReasonText(status, reason);
      return translated === '正在退出游戏' ? '已退出游戏' : translated;
    }
    function modeText(mode, combatEnabled) {
      const text = modeMap[mode] || (mode ? '自动运行' : '--');
      return combatEnabled ? text + ' / 可打架' : text;
    }
    function sourceText(source) {
      const text = String(source || '').toLowerCase();
      if (!text) return '--';
      if (text.includes('real') || text.includes('live') || text.includes('native')) return 'WS实时位置';
      if (text.includes('snapshot') || text.includes('fallback')) return 'WS状态帧';
      if (text.includes('state')) return '记录';
      return '--';
    }
    function dataGapText(gap) {
      const text = String(gap || '');
      if (!text) return '';
      if (dataGapMap[text]) return dataGapMap[text];
      const blockedPrefix = 'snapshot-fallback-blocked:';
      if (/snapshot-coins-out-of-visible-range/i.test(text)) return '快照金币超出可见范围';
      if (text.startsWith(blockedPrefix)) {
        const blockedReason = text.slice(blockedPrefix.length);
        if (/snapshot-coins-out-of-visible-range/i.test(blockedReason)) return '快照金币备用被阻止：快照金币超出可见范围';
        return '快照金币备用被阻止：' + reasonText(blockedReason);
      }
      return reasonText(text);
    }
    function dataGapsText(decision) {
      const gaps = Array.isArray(decision?.dataGaps) ? decision.dataGaps : [];
      const actionable = gaps.filter(gap => [
        'missing-realtime-self',
        'unknown-realtime-frame-age'
      ].includes(String(gap || '')));
      const translated = actionable.map(dataGapText).filter(Boolean);
      if (translated.length) {
        return translated.join(' / ');
      }
      return '--';
    }
    function authStatusText(status) {
      const auth = status.auth || {};
      if (auth.state === 'invalid' || auth.invalid) return '登录信息失效';
      if (auth.state === 'missing' || auth.missing) return '等待授权';
      if (auth.authenticated || status.session?.authenticated) return '授权可用';
      if (status.session?.tokenPresent) return '登录信息不完整';
      return '等待授权';
    }
    function authStatusShortText(status) {
      const text = authStatusText(status);
      if (text === '授权可用') return '可用';
      if (text === '登录信息失效') return '失效';
      if (text === '等待授权') return '等待';
      if (text === '登录信息不完整') return '不完整';
      return text;
    }
    function authPromptText(status) {
      const auth = status.auth || {};
      if (auth.prompt) return auth.prompt;
      if (auth.invalid) return '登录信息可能已经失效，请重新授权';
      if (auth.missing || !status.session?.tokenPresent) return '缺少可用登录信息，请先授权';
      return '登录信息可用';
    }
    function authClass(status) {
      const auth = status.auth || {};
      if (auth.invalid) return 'bad';
      if (auth.needsReauth || auth.missing) return 'warn';
      if (auth.authenticated || status.session?.authenticated) return 'ok';
      return 'warn';
    }
    function setAuthUrl(url) {
      const value = String(url || '');
      const link = document.getElementById('authLink');
      const pre = document.getElementById('authUrl');
      const nextHref = value || '#';
      if (link.getAttribute('href') !== nextHref) link.href = nextHref;
      const nextText = value ? '打开授权页' : '';
      if (link.textContent !== nextText) link.textContent = nextText;
      if (pre.textContent !== value) pre.textContent = value;
      const nextDisplay = value ? 'block' : 'none';
      if (pre.style.display !== nextDisplay) pre.style.display = nextDisplay;
    }
    function updateAuthPanel(status) {
      const auth = status.auth || {};
      const panel = document.getElementById('authPanel');
      if (panel) {
        const authUsable = Boolean(auth.authenticated || status.session?.authenticated);
        const showAuthPanel = Boolean(auth.needsReauth || auth.invalid || auth.missing || !authUsable);
        panel.hidden = !showAuthPanel;
      }
      setText('authPrompt', authPromptText(status));
      setText('authState', authStatusText(status));
      setClass('authState', 'pill ' + authClass(status));
      setAuthUrl(auth.authUrl || '');
      const message = document.getElementById('authMessage');
      if (message && !message.textContent) {
        if (message.className !== 'auth-message muted') message.className = 'auth-message muted';
      }
    }
    function activeTarget(status) {
      if (status.game?.inGame === false) return null;
      const kind = status.action?.kind || status.decision?.kind || '';
      const targetKinds = new Set(['coin', 'seek-coin', 'profit-candidate', 'attack', 'seek-enemy', 'seek-drop', 'combat-live', 'flee', 'leave', 'safety-exit', 'post-attack-drop-wait']);
      if (status.action?.target) return status.action.target;
      if (targetKinds.has(kind) && status.decision?.target) return status.decision.target;
      if ((kind === 'attack' || kind === 'combat-live') && status.combat?.target) return status.combat.target;
      return null;
    }
    function loginPointRequired(status) {
      const detail = status.loginPointSafety?.detail || {};
      const required = number(detail.required ?? status.loginPointSafety?.required);
      return required !== null && required > 0 ? Math.max(1, Math.round(required)) : 3;
    }
    function loginPointProgressText(status, safeLike = false) {
      const detail = status.loginPointSafety?.detail || {};
      const required = loginPointRequired(status);
      const rawStreak = number(detail.streak ?? status.loginPointSafety?.streak);
      let streak = rawStreak === null
        ? (status.loginPointSafety?.ok ? required : (safeLike ? 1 : 0))
        : Math.round(rawStreak);
      if (status.loginPointSafety?.ok) streak = Math.max(streak, required);
      if (safeLike && streak <= 0) streak = 1;
      streak = Math.min(required, Math.max(0, streak));
      return String(streak) + '/' + String(required);
    }
    function loginPointSafetyCheckInFlight(status) {
      const action = status.action || status.decision || {};
      const kind = String(action.kind || '');
      const reason = String(action.reason || '');
      const nextRunAt = String(action.nextRunAt || '');
      const preflightPhase = String(status.network?.sourceIpPreflight?.phase || '');
      if (kind === 'snapshot-wait') return true;
      if (nextRunAt) return false;
      return /pending-snapshot-safety/i.test(reason)
        || (kind === 'loop-wait' && preflightPhase === 'snapshot-wait');
    }
    function loginPointDisplay(status) {
      if (status.game?.inGame) return { state: 'none', text: '--' };
      const reconnectRemainingMs = number(status.stats?.offline?.reconnectRemainingMs);
      const cooldownActive = reconnectRemainingMs !== null && reconnectRemainingMs > 1000;
      const detail = status.loginPointSafety?.detail || {};
      const reason = String(status.loginPointSafety?.reason || '');
      const detailReason = String(detail.reason || '');
      const originalReason = String(detail.originalReason || '');
      const reasonText = [reason, detailReason, originalReason].join(' ');
      const checkInFlight = loginPointSafetyCheckInFlight(status);
      const pendingResult = /pending-snapshot-safety|snapshot-safety-streak-pending/i.test(reasonText);
      const checkedAt = String(status.loginPointSafety?.checkedAt || detail.checkedAt || '');
      const completedResult = Boolean(checkedAt && !pendingResult);
      const withCooldown = display => {
        if (!cooldownActive || display.state === 'reentry') return display;
        return {
          ...display,
          cooldown: true,
          text: display.text + '（重登冷却中）'
        };
      };
      if (cooldownActive && !checkInFlight && !completedResult) {
        return { state: 'cooldown', text: '重登冷却中，冷却结束后再检查' };
      }
      if (/confirmed-leave-snapshot-quarantine|stale-confirmed-leave-snapshot-tick/i.test(reasonText)) {
        return withCooldown({ state: 'pending', text: '等待退出后的快照刷新' });
      }
      if (/self-present-reentry/i.test(reasonText) || (detail.selfPresent === true && detail.bypassedPreLoginSafety)) {
        return { state: 'reentry', text: '检测到角色仍在线，正在恢复实时连接（不会新登录）' };
      }
      if (/single-blocker-timeout-bypass/i.test(reasonText)) {
        return withCooldown({ state: 'safe', text: '满血强制登录' });
      }
      if (checkInFlight) {
        const currentCheckOk = status.loginPointSafety?.ok ?? detail.ok;
        const previousCheck = detail.previousCheck || null;
        const progress = loginPointProgressText(status, false);
        if (completedResult && currentCheckOk === false) {
          return { state: 'unsafe', reviewing: true, checking: true, text: '不安全（正在复查 ' + progress + '）' };
        }
        if (completedResult && currentCheckOk === true) {
          return { state: 'safe', reviewing: true, checking: true, text: '上次检查安全，正在复查 ' + progress };
        }
        if (previousCheck?.ok === false) {
          return { state: 'unsafe', reviewing: true, checking: true, text: '不安全（正在复查 ' + progress + '）' };
        }
        if (previousCheck?.ok === true) {
          return { state: 'safe', reviewing: true, checking: true, text: '上次检查安全，正在复查 ' + progress };
        }
        return { state: 'pending', checking: true, text: '正在检查登录点安全 ' + progress };
      }
      const pendingSafeReason = /snapshot-safety-streak-pending/i.test(detailReason)
        && /^safe$/i.test(originalReason);
      const streak = number(detail.streak ?? status.loginPointSafety?.streak);
      const safeLike = Boolean(
        status.loginPointSafety?.ok === true
          || detail.ok === true
          || pendingSafeReason
          || (streak !== null && streak > 0 && /pending|streak/i.test(reasonText))
      );
      if (safeLike) {
        return withCooldown({ state: 'safe', text: '安全 ' + loginPointProgressText(status, true) });
      }
      if (/pending-snapshot-safety/i.test(reasonText)) {
        const offline = status.stats?.offline || {};
        const afterOffline = Boolean(offline.lastExitAt || offline.lastExitReason || status.recentExit);
        if (afterOffline) {
          return withCooldown({ state: 'pending', afterOffline: true, text: '离线后等待检查 ' + loginPointProgressText(status, false) });
        }
        const previousCheck = detail.previousCheck || null;
        if (previousCheck?.ok === true) {
          return withCooldown({ state: 'safe', reviewing: true, text: '上次检查安全，正在复查 ' + loginPointProgressText(status, false) });
        }
        if (previousCheck?.ok === false) {
          return withCooldown({ state: 'unsafe', reviewing: true, text: '不安全（正在复查 ' + loginPointProgressText(status, false) + '）' });
        }
        return withCooldown({ state: 'pending', text: '待检查 ' + loginPointProgressText(status, false) });
      }
      return withCooldown({ state: 'unsafe', text: '不安全' });
    }
    function loginPointText(status) {
      return loginPointDisplay(status).text;
    }
    function freshnessText(detail) {
      const fresh = detail?.freshness || null;
      if (!fresh) return '--';
      const parts = [reasonText(fresh.reason)];
      if (fresh.tick !== null && fresh.tick !== undefined) parts.push('tick ' + fresh.tick);
      if (fresh.tickDelta !== null && fresh.tickDelta !== undefined) parts.push('差值 ' + fresh.tickDelta);
      return parts.join(' / ');
    }
    function loginPointDetailText(status) {
      const detail = status.loginPointSafety?.detail || null;
      if (!detail) return '--';
      const parts = [];
      if (detail.reason) parts.push(reasonText(detail.reason));
      if (detail.radius !== null && detail.radius !== undefined) parts.push('范围 ' + distance(detail.radius));
      if (detail.activeNearbyCount !== null && detail.activeNearbyCount !== undefined) parts.push('Active ' + detail.activeNearbyCount);
      if (detail.nearbyCount !== null && detail.nearbyCount !== undefined) parts.push('附近 ' + detail.nearbyCount);
      if (detail.entityCount !== null && detail.entityCount !== undefined) parts.push('实体 ' + detail.entityCount);
      if (detail.httpStatus !== null && detail.httpStatus !== undefined) parts.push('HTTP ' + detail.httpStatus);
      return parts.length ? parts.join(' / ') : '--';
    }
    function blockingFactorsText(status) {
      const factors = Array.isArray(status.loginPointSafety?.detail?.blockingFactors)
        ? status.loginPointSafety.detail.blockingFactors
        : [];
      if (!factors.length) return '--';
      return groupBlockingFactors(factors).map(row => {
        const label = row.factor.type === 'player'
          ? targetLabel(row.factor)
          : '快照检查';
        const reasons = row.reasons.map(reasonText).filter((reason, index, list) => reason !== '--' && list.indexOf(reason) === index);
        return joinNonBlank([label, reasons.join('、')]);
      }).join('；');
    }
    function singleBlockerHoldText(status) {
      const hold = status.loginPointSafety?.detail?.singleBlockerHold || null;
      if (!hold?.active) return '--';
      const elapsed = duration(hold.durationMs);
      const remaining = duration(hold.remainingMs);
      return joinNonBlank([
        hold.name || (hold.userId ? '#' + hold.userId : '单一玩家'),
        '已持续 ' + elapsed,
        hold.eligible ? '已达到强制登录条件' : '还需 ' + remaining,
        '检查 ' + (hold.observationCount || 0) + ' 次'
      ]);
    }
    function unsafeReasonText(status) {
      if (status.game?.inGame || loginPointDisplay(status).state !== 'unsafe') return '--';
      const detail = status.loginPointSafety?.detail || {};
      const previousCheck = detail.previousCheck || null;
      const raw = loginPointDisplay(status).reviewing && previousCheck?.ok === false
        ? previousCheck.reason
        : (detail.unsafeReason || detail.reason || status.loginPointSafety?.reason);
      if (!raw || /^safe$/i.test(String(raw)) || /pending-snapshot-safety|snapshot-safety-streak-pending/i.test(String(raw))) return '--';
      const translated = reasonText(raw);
      return translated === '安全' ? '--' : translated;
    }
    function loginPointPendingReasonText(status) {
      if (status.game?.inGame || loginPointDisplay(status).state !== 'pending') return '--';
      const detail = status.loginPointSafety?.detail || {};
      const raw = detail.reason || status.loginPointSafety?.reason || detail.originalReason;
      return raw ? reasonText(raw) : '--';
    }
    function offlineBlockerText(status) {
      const blocker = status.stats?.offline?.blocker || null;
      if (!blocker) return '--';
      if (blocker.reason === 'stamina-exhausted-leave') {
        const windows = Array.isArray(blocker.exhausted) && blocker.exhausted.length
          ? blocker.exhausted.join('+')
          : '长周期';
        return joinNonBlank([
          windows + '体力耗尽',
          blocker.remaining1d === null || blocker.remaining1d === undefined ? '--' : '1d ' + staminaPair(blocker.remaining1d, 20000),
          blocker.remaining1h === null || blocker.remaining1h === undefined ? '--' : '1h ' + staminaPair(blocker.remaining1h, 3000),
          blocker.nextReadyAt ? '恢复 ' + fullStamp(blocker.nextReadyAt) : '--'
        ]);
      }
      return reasonText(blocker.reason);
    }
    function actionText(status) {
      const decision = status.decision || {};
      const action = status.action || {};
      const kind = action.kind || decision.kind || 'wait';
      const target = activeTarget(status);
      if (kind === 'coin') return '捡金币 ' + targetLabel(target);
      if (kind === 'seek-coin') return '去捡金币 ' + targetLabel(target);
      if (kind === 'profit-candidate') return '选择金币目标 ' + targetLabel(target);
      if (kind === 'seek-enemy') return '靠近高Drop挂机玩家 ' + targetLabel(target);
      if (kind === 'attack' || kind === 'combat-live') return '打目标 ' + targetLabel(target);
      return kindText(kind);
    }
    function actionTitleText(status) {
      const action = status.action || status.decision || {};
      const kind = String(action.kind || action.actionKind || status.decision?.kind || 'wait');
      const reason = String(action.reason || status.decision?.reason || '');
      const target = activeTarget(status) || action.target || status.decision?.target || null;
      if (kind === 'source-ip-preflight' || kind === 'source-ip-preflight-cooldown') {
        return sourceIpPreflightPhaseText(status.network);
      }
      if (reason === 'restart-drain-new-commitment-blocked') return '正在准备重启';
      if (kind === 'post-attack-drop-wait' || /post-kill-settlement-wait|post-attack-drop-wait/i.test(reason)) return '等待掉落';
      if (reason === 'single-coin-bait-hold') return '正在等待';
      if (kind === 'coin' || kind === 'seek-coin' || kind === 'profit-candidate') {
        const amount = number(target?.amount);
        if (String(reason).includes('bait')) return '正在蹲守1金币诱饵';
        return amount !== null && amount <= 1 ? '正在移动前往小额金币' : '正在移动前往大额金币';
      }
      if (kind === 'seek-enemy') return '正在靠近高Drop挂机玩家';
      if (kind === 'attack') {
        const afk = target && target.active !== true && target.firing !== true && target.moving !== true;
        return afk ? '正在攻击高Drop挂机玩家' : '正在攻击玩家';
      }
      if (kind === 'combat-live' || /combat|fight/i.test(kind + ' ' + reason)) return '正在交战';
      if (kind === 'recover') return '正在恢复体力';
      if (kind === 'flee' || kind === 'safety-exit' || kind === 'leave') return '正在避开危险';
      if (kind === 'wait' || kind === 'loop-wait') return '正在等待';
      return actionText(status);
    }
    function actionReasonDisplay(status) {
      const action = status.action || status.decision || {};
      const reason = String(action.reason || status.decision?.reason || status.recentExit?.reason || '');
      const kind = String(action.kind || status.decision?.kind || '');
      if (reason === 'restart-drain-new-commitment-blocked') {
        return restartDrainBlockedReasonText({
          blockedAction: action.blockedAction || status.decision?.action?.blockedAction || null,
          commitmentKey: status.runner?.restartDrain?.commitmentKey || ''
        });
      }
      if (reason === 'best-opportunity' || reason === 'best-opportunity-coin' || reason === 'best-opportunity-coin-route' || reason === 'best-eligible-profit') return '综合收益最高';
      if (reason === 'post-attack-drop-wait-position' || reason === 'post-kill-settlement-wait') return '等待掉落确认';
      if (kind === 'coin' || kind === 'seek-coin' || kind === 'profit-candidate') return reasonText(reason) === actionTitleText(status) ? '综合收益最高' : reasonText(reason);
      return actionReasonText(status);
    }
    function offlineActionTitleText(status) {
      if (status.runner?.connectionFailure?.type === 'cloudflare-challenge') {
        return 'Cloudflare 挑战已确认，自动登录已停止';
      }
      if (status.auth?.needsReauth) return '等待重新授权';
      const offline = status.stats?.offline || {};
      const reconnectRemainingMs = number(offline.reconnectRemainingMs);
      if (reconnectRemainingMs !== null && reconnectRemainingMs > 1000) return '等待重登冷却时间';
      const action = status.action || status.decision || {};
      const reason = String(action.reason || status.decision?.reason || '');
      const preflightPhase = String(status.network?.sourceIpPreflight?.phase || '');
      if (action.kind === 'source-ip-preflight' || action.kind === 'source-ip-preflight-cooldown'
        || ['testing', 'retry-wait', 'deferred', 'insufficient'].includes(preflightPhase)) {
        return sourceIpPreflightPhaseText(status.network);
      }
      if (reason === 'login-point-safe-connecting') return '登录点已安全，正在连接游戏';
      if (loginPointSafetyCheckInFlight(status)) return '正在检查登录点安全';
      const loginState = loginPointDisplay(status).state;
      if (/snapshot|login-point|prelogin|edge/i.test(reason) || loginState === 'pending') {
        return '等待登录点快照安全检查';
      }
      if (loginState === 'unsafe') return '等待登录点恢复安全';
      if (action.kind === 'stopped' || action.kind === 'stop') return '程序已停止';
      return actionTitleText(status);
    }
    function nonBlankText(text) {
      const normalized = value(text);
      return normalized === '--' ? '' : normalized;
    }
    function addRow(list, label, text, always = false, attrs = null) {
      const normalized = value(text);
      if (always || normalized !== '--') list.push([label, normalized, attrs]);
    }
    function joinNonBlank(items, separator = ' / ') {
      const parts = items.map(nonBlankText).filter(Boolean);
      return parts.length ? parts.join(separator) : '--';
    }
    const COIN_ROUTE_RING_PATH = 'M512.048762 0C794.770286 0 1024 229.205333 1024 512.048762 1024 794.819048 794.770286 1024 512.048762 1024 229.229714 1024 0 794.794667 0 512.048762 0 229.229714 229.229714 0 512.048762 0z m0 97.52381C283.111619 97.52381 97.52381 283.062857 97.52381 512.048762 97.52381 740.937143 283.111619 926.47619 512.048762 926.47619 740.937143 926.47619 926.47619 740.937143 926.47619 512.048762 926.47619 283.111619 740.937143 97.52381 512.048762 97.52381z';
    const TARGET_ICON_PATHS = {
      coinBait: ['M617.130667 654.229333a71.104 71.104 0 1 0 142.229333 0 71.104 71.104 0 0 0-142.229333 0zM368.256 760.896a142.229333 142.229333 0 1 1 0-284.437333 142.229333 142.229333 0 0 1 0 284.437333z m0-213.333333a71.104 71.104 0 1 0 0 142.208 71.104 71.104 0 0 0 0-142.208z', 'M937.130667 938.666667H581.589333v-35.562667a53.333333 53.333333 0 0 0-106.666666 0V938.666667h-219.306667c-199.466667-3.242667-194.432-352.725333-132.010667-479.722667A710.101333 710.101333 0 0 1 369.770667 119.445333a176.426667 176.426667 0 0 1 202.965333-3.946666l364.394667 272.042666V938.666667z m-289.621334-71.104h218.517334v-426.666667H255.637333a70.592 70.592 0 0 0-65.578666 43.477333 452.266667 452.266667 0 0 0-35.157334 169.834667 452.266667 452.266667 0 0 0 35.157334 169.856 70.570667 70.570667 0 0 0 65.578666 43.498667h153.344a124.906667 124.906667 0 0 1 238.506667 0zM473.877333 156.437333a102.805333 102.805333 0 0 0-61.546666 20.16 646.250667 646.250667 0 0 0-170.666667 194.069334c4.714667-0.490667 9.472-0.746667 14.229333-0.725334h538.624L531.797333 173.568a104.704 104.704 0 0 0-57.92-17.130667z'],
      coinSingle: ['M512 85.333333a42.666667 42.666667 0 0 1 42.666667 42.666667v88.405333A298.752 298.752 0 0 1 807.594667 469.333333H896a42.666667 42.666667 0 1 1 0 85.333334h-88.405333A298.709333 298.709333 0 0 1 554.666667 807.552V896a42.666667 42.666667 0 1 1-85.333334 0v-88.448A298.709333 298.709333 0 0 1 216.405333 554.666667H128a42.666667 42.666667 0 1 1 0-85.333334h88.405333A298.752 298.752 0 0 1 469.333333 216.405333V128a42.666667 42.666667 0 0 1 42.666667-42.666667z m0 213.333334a213.333333 213.333333 0 1 0 0 426.666666 213.333333 213.333333 0 0 0 0-426.666666z m0 128a85.333333 85.333333 0 1 1 0 170.666666 85.333333 85.333333 0 0 1 0-170.666666z'],
      coin1: ['M512.048762 0C794.770286 0 1024 229.205333 1024 512.048762 1024 794.819048 794.770286 1024 512.048762 1024 229.229714 1024 0 794.794667 0 512.048762 0 229.229714 229.229714 0 512.048762 0z m0 97.52381C283.111619 97.52381 97.52381 283.062857 97.52381 512.048762 97.52381 740.937143 283.111619 926.47619 512.048762 926.47619 740.937143 926.47619 926.47619 740.937143 926.47619 512.048762 926.47619 283.111619 740.937143 97.52381 512.048762 97.52381zM585.142857 219.428571v587.044572h-96.597333v-464.213333L365.714286 393.094095v-102.15619l125.903238-62.732191L585.142857 219.428571z'],
      coin2: ['M512.048762 0C794.770286 0 1024 229.205333 1024 512.048762 1024 794.819048 794.770286 1024 512.048762 1024 229.229714 1024 0 794.794667 0 512.048762 0 229.229714 229.229714 0 512.048762 0z m0 97.52381C283.111619 97.52381 97.52381 283.062857 97.52381 512.048762 97.52381 740.937143 283.111619 926.47619 512.048762 926.47619 740.937143 926.47619 926.47619 740.937143 926.47619 512.048762 926.47619 283.111619 740.937143 97.52381 512.048762 97.52381zM707.047619 806.473143v-77.092572H450.56l-0.804571-1.999238 124.976761-139.897904c40.71619-47.957333 69.973333-86.25981 87.747048-114.883048 17.773714-28.598857 26.648381-59.221333 26.648381-91.794286 0-48.225524-15.945143-87.186286-47.835429-116.857905C609.401905 234.276571 565.101714 219.428571 508.367238 219.428571c-59.172571 0-106.179048 17.16419-141.06819 51.468191-34.864762 34.328381-51.638857 76.239238-50.273524 125.805714l0.828952 2.389334h95.670857c0-29.42781 8.143238-53.808762 24.405334-73.142858 16.286476-19.334095 39.765333-29.013333 70.460952-29.013333 26.331429 0 46.518857 7.753143 60.635429 23.259429 14.140952 15.481905 21.187048 35.57181 21.187047 60.220952 0 20.650667-5.851429 42.25219-17.505524 64.78019-11.702857 22.503619-32.572952 51.126857-62.707809 85.820953l-185.246476 209.091047v66.364953H707.047619z'],
      coin3: ['M512.048762 0C794.770286 0 1024 229.205333 1024 512.048762 1024 794.819048 794.770286 1024 512.048762 1024 229.229714 1024 0 794.794667 0 512.048762 0 229.229714 229.229714 0 512.048762 0z m0 97.52381C283.111619 97.52381 97.52381 283.062857 97.52381 512.048762 97.52381 740.937143 283.111619 926.47619 512.048762 926.47619 740.937143 926.47619 926.47619 740.937143 926.47619 512.048762 926.47619 283.111619 740.937143 97.52381 512.048762 97.52381z m-1.219048 707.047619c57.709714 0 104.838095-14.848 141.409524-44.519619 36.571429-29.696 54.857143-70.704762 54.857143-123.050667 0-32.548571-7.972571-60.342857-23.966476-83.382857-15.969524-23.064381-39.009524-40.326095-69.071238-51.785143 26.282667-12.239238 46.811429-29.208381 61.561904-50.956191a124.903619 124.903619 0 0 0 22.137905-71.68c0-52.077714-16.725333-91.745524-50.176-118.954666C614.13181 233.033143 568.539429 219.428571 510.854095 219.428571c-54.735238 0-100.181333 14.774857-136.338285 44.324572-36.156952 29.574095-53.443048 66.072381-51.809524 109.568l0.804571 2.364952h94.695619c0-22.918095 8.777143-42.008381 26.404572-57.246476 17.603048-15.213714 39.69219-22.844952 66.243047-22.844952 28.696381 0 50.639238 7.753143 65.828572 23.235047 15.164952 15.506286 22.747429 35.620571 22.747428 60.367238 0 27.599238-7.046095 49.078857-21.138285 64.438858-14.06781 15.36-37.10781 23.064381-69.071239 23.06438h-65.828571v74.605715h65.828571c33.328762 0 58.172952 7.92381 74.556953 23.82019 16.408381 15.872 24.600381 39.984762 24.600381 72.265143 0 26.819048-8.801524 48.761905-26.428953 65.828572-17.603048 17.066667-41.301333 25.575619-71.094857 25.575619-28.720762 0-52.224-8.143238-70.509714-24.405334-18.285714-16.286476-27.428571-36.400762-27.428571-60.367238h-95.085715l-0.804571 2.340572c-1.365333 48.956952 17.603048 87.576381 56.880762 115.809523C413.184 790.479238 458.849524 804.571429 510.854095 804.571429z'],
      coin4: [COIN_ROUTE_RING_PATH, 'M636.977762 804.571429v-129.804191h73.947428v-78.750476h-73.947428V219.428571h-100.059429L292.571429 614.887619l2.413714 59.879619h244.736V804.571429h97.28z m-97.256619-208.579048h-151.893333l140.239238-216.624762 9.264762-22.503619 2.389333 0.414476v238.713905z'],
      coin5: [COIN_ROUTE_RING_PATH, 'M499.98019 822.857143c63.951238 0 111.981714-18.18819 144.091429-54.613333 32.109714-36.449524 48.176762-83.797333 48.176762-142.092191 0-61.513143-15.262476-109.689905-45.738667-144.481524-30.500571-34.816-73.142857-51.95581-127.902476-51.419428a166.034286 166.034286 0 0 0-53.248 8.899047 163.693714 163.693714 0 0 0-41.472 21.065143l17.798095-155.794286h229.10781V219.428571h-310.857143l-34.011429 334.262858 84.187429 6.899809c5.948952-16.725333 15.457524-29.42781 28.525714-38.034286 13.116952-8.655238 33.158095-12.970667 60.123429-12.970666 30.47619 0 53.979429 10.727619 70.436571 32.182857 16.457143 21.455238 24.673524 49.859048 24.673524 85.187047 0 36.717714-7.94819 65.438476-23.868952 86.235429-15.920762 20.772571-39.253333 31.158857-70.022096 31.158857-26.721524 0-48.37181-7.753143-64.975238-23.283809-16.579048-15.506286-24.868571-37.034667-24.868571-64.560762l-92.306286 2.852571-0.804571 2.023619c-1.340952 51.809524 15.847619 91.672381 51.614476 119.588572 35.742476 27.940571 79.530667 41.910857 131.34019 41.910857z'],
      coin6: [COIN_ROUTE_RING_PATH, 'M534.308571 219.428571c22.918095 0 45.056 2.218667 66.389334 6.680381 21.308952 4.461714 40.472381 10.313143 57.465905 17.603048l-19.017143 76.092952-9.849905-3.705904a331.629714 331.629714 0 0 0-38.716952-11.459048c-15.920762-3.657143-34.54781-5.461333-55.856762-5.461333-35.888762 0-64.853333 14.433524-86.820572 43.300571-21.991619 28.867048-32.987429 67.047619-32.987428 114.541714v30.768762l6.095238-5.802666a170.666667 170.666667 0 0 1 50.761143-31.451429c21.991619-8.899048 46.201905-13.336381 72.655238-13.336381 50.468571 0 90.209524 17.408 119.222857 52.199619 28.988952 34.816 43.495619 80.408381 43.495619 136.825905 0 59.63581-17.408 107.78819-52.224 144.481524-34.791619 36.717714-80.798476 55.05219-137.996191 55.05219-58.026667 0-105.862095-20.918857-143.506285-62.73219C335.774476 721.188571 316.952381 663.990857 316.952381 591.384381v-128.292571l0.121905-9.362286c1.706667-68.022857 22.381714-123.611429 62.000762-166.716953C420.522667 241.956571 472.259048 219.428571 534.308571 219.428571z m-21.845333 294.278096c-23.478857 0-43.398095 4.242286-59.733333 12.726857a93.184 93.184 0 0 0-37.814857 35.011047v35.230477l0.097523 8.679619c1.121524 42.837333 10.678857 76.775619 28.623239 101.814857 19.163429 26.721524 43.593143 40.057905 73.264761 40.057905 28.867048 0 51.46819-11.312762 67.779048-33.987048 16.335238-22.674286 24.502857-51.687619 24.502857-87.04 0-34.523429-8.557714-61.927619-25.697524-82.16381-17.13981-20.23619-40.813714-30.354286-71.021714-30.354285z'],
      coin7: [COIN_ROUTE_RING_PATH, 'M548.035048 828.952381v-65.755429c0-77.409524 0-281.112381 166.887619-419.108571v-99.376762H333.092571v99.352381H599.771429c-142.726095 143.555048-150.576762 338.407619-150.576762 419.132952V828.952381h98.816z'],
      coin8: [COIN_ROUTE_RING_PATH, 'M517.656381 816.274286c56.417524 0 102.887619-14.457905 139.459048-43.373715 36.571429-28.891429 54.857143-69.778286 54.857142-122.63619 0-31.256381-9.654857-58.855619-28.964571-82.822095-19.285333-23.966476-45.104762-42.057143-77.507048-54.296381 27.257905-11.971048 48.835048-28.964571 64.75581-50.956191 15.920762-22.016 23.893333-47.34781 23.893333-75.995428 0-49.980952-16.530286-88.356571-49.590857-115.029334-33.060571-26.697143-75.629714-40.057905-127.707428-40.057904-55.05219 0-99.57181 13.287619-133.558858 39.862857-34.011429 26.575238-51.004952 64.975238-51.004952 115.224381 0 28.647619 8.216381 53.979429 24.697905 75.971047 16.457143 22.016 38.985143 39.009524 67.584 50.956191-33.987048 12.263619-60.903619 30.354286-80.749715 54.320762a126.098286 126.098286 0 0 0-29.744761 82.797714c0 52.882286 18.944 93.769143 56.856381 122.660571 37.912381 28.91581 86.820571 43.349333 146.724571 43.349334z m0-341.016381c-25.624381 0-46.543238-7.875048-62.732191-23.649524-16.188952-15.750095-24.283429-36.376381-24.283428-61.903238 0-25.526857 7.899429-45.641143 23.673905-60.342857 15.798857-14.726095 36.644571-22.064762 62.537143-22.064762 22.942476 0 41.837714 7.606857 56.661333 22.844952 14.872381 15.238095 22.28419 35.108571 22.28419 59.562667 0 25.526857-7.363048 46.153143-22.064762 61.927619-14.701714 15.750095-33.401905 23.625143-56.07619 23.625143z m0 265.216c-31.012571 0-56.32-8.533333-75.873524-25.6-19.577905-17.042286-29.354667-39.740952-29.354667-68.144762 0-27.867429 9.849905-50.712381 29.549715-68.559238 19.69981-17.822476 44.665905-26.745905 74.873905-26.745905 27.550476 0 50.590476 8.923429 69.241904 26.745905 18.602667 17.846857 27.91619 40.71619 27.916191 68.559238 0 28.379429-9.191619 51.102476-27.550476 68.169143-18.334476 17.066667-41.276952 25.6-68.803048 25.6z'],
      coin9: [COIN_ROUTE_RING_PATH, 'M489.374476 804.571429c62.342095 0 113.39581-18.822095 153.209905-56.441905 39.789714-37.61981 59.708952-89.380571 59.708952-155.282286V431.542857c0-66.925714-18.285714-119.02781-54.857143-156.257524C610.864762 238.055619 563.053714 219.428571 503.954286 219.428571c-53.711238 0-98.279619 18.480762-133.778286 55.466667C334.701714 311.881143 316.952381 358.887619 316.952381 415.914667c0 59.879619 15.847619 106.886095 47.542857 140.995047 31.719619 34.133333 75.50781 51.2 131.364572 51.2 21.845333 0 42.081524-4.437333 60.708571-13.287619a125.68381 125.68381 0 0 0 47.37219-39.472762v41.033143c0 41.935238-10.605714 74.459429-31.792761 97.645714-21.187048 23.161905-48.761905 34.767238-82.773334 34.767239-21.577143 0-40.740571-1.633524-57.465905-4.876191a251.757714 251.757714 0 0 1-51.419428-16.213333l-15.774476 72.265143c18.895238 8.045714 39.204571 14.189714 60.928 18.358857 21.699048 4.144762 42.959238 6.241524 63.731809 6.241524z m15.798857-270.311619c-29.159619 0-51.46819-10.800762-66.998857-32.426667-15.506286-21.601524-23.259429-50.249143-23.259428-85.918476 0-34.620952 8.557714-63.341714 25.697523-86.137905 17.13981-22.79619 38.765714-34.182095 64.950858-34.182095 30.768762 0 54.857143 10.361905 72.265142 31.061333s26.087619 50.200381 26.087619 88.478476v67.559619c-8.899048 15.36-21.699048 27.794286-38.448761 37.302857-16.725333 9.508571-36.815238 14.262857-60.294096 14.262858z'],
      afk: ['M139.936 132.48a26.784 26.784 0 0 1 37.12 7.456c11.232 16.832 32.384 26.56 68.96 31.872 17.824 2.624 37.6 3.968 59.424 5.216l9.6 0.544c18.784 1.056 38.816 2.176 58.88 4.16 47.104 4.576 97.984 13.984 143.392 40.32a230.56 230.56 0 0 1 80.384 77.952l-105.6 105.6c-13.024-35.584-31.136-61.216-51.744-80.576-28.128-26.4-62.56-42.752-100.032-55.584a1030.72 1030.72 0 0 0-51.52-15.744l55.52 299.712-61.312 61.312L211.552 228.8c-30.496-12.448-59.552-29.92-79.04-59.136a26.784 26.784 0 0 1 7.424-37.152z m478.432 399.424c35.616 13.024 61.248 31.136 80.608 51.744 26.4 28.16 42.752 62.592 55.584 100.032 5.824 16.96 10.784 34.144 15.744 51.52l-299.712-55.488-61.28 61.312L795.2 812.48c12.48 30.464 29.92 59.52 59.136 79.04a26.784 26.784 0 1 0 29.76-44.608c-16.864-11.2-26.56-32.384-31.904-68.928a702.912 702.912 0 0 1-5.216-59.456l-0.544-9.6c-1.056-18.784-2.208-38.784-4.16-58.88-4.576-47.04-13.984-97.92-40.32-143.36a230.56 230.56 0 0 0-77.984-80.384l-105.6 105.6z m-282.976 207.232v71.104c0 4.16-1.664 8.192-4.608 11.2L267.264 885.44a15.872 15.872 0 0 1-27.136-11.168v-88.448h-88.64a15.872 15.872 0 0 1-11.232-27.104l63.456-63.488a15.872 15.872 0 0 1 11.232-4.672H282.88l432.32-432.32-32.512-10.88c-20.352-6.752-20.352-35.552 0-42.336l161.984-54.016a22.336 22.336 0 0 1 28.256 28.256l-54.016 162.016c-6.784 20.352-35.552 20.352-42.336 0l-10.88-32.544-430.304 430.368z'],
      combat: ['M102.771153 78.619592c48.991808 4.309142 95.998401 8.250918 142.956899 12.695137 14.046924 1.330298 25.778106 7.962346 35.295877 18.650779 73.906244 83.014692 148.023288 165.843142 221.665519 249.091148 7.059789 7.981788 10.072403 7.765871 16.994046-0.060375 73.136717-82.662675 146.752342-164.901701 220.067114-247.40781 10.045797-11.308557 21.928429-18.827811 36.94647-20.231787 47.355541-4.423753 94.762247-8.277524 142.101415-12.852726 8.309246-0.803295 9.635451 1.737574 8.900717 9.217942-4.562922 46.551222-8.909927 93.124957-13.011338 139.719158-1.418302 16.124236-8.761548 28.515451-20.668739 39.110763-85.083817 75.694983-169.935344 151.656025-255.17061 227.180116-7.133468 6.321986-7.853875 9.657964-1.154289 16.799618 20.00359 21.327748 39.002292 43.596937 58.775638 65.148789 4.842285 5.272074 5.688559 8.258081-0.01842 13.845333-30.665417 30.015617-60.98291 60.383252-91.034343 91.006713-5.13802 5.235235-7.910157 4.851495-13.002129 0.205685-24.777313-22.598694-50.110281-44.597731-74.79345-67.296709-5.375427-4.947685-8.139378-4.358261-13.142322 0.205685-24.197098 22.080901-49.047066 43.454698-73.063039 65.726957-6.804986 6.310729-10.345626 5.486968-16.431228-0.731664-29.456892-30.115901-59.288315-59.870576-89.329515-89.400123-4.992711-4.91187-5.409197-7.568373-0.509606-12.895705 20.330024-22.099321 39.802518-44.992727 60.311621-66.916039 6.241145-6.67298 4.958942-9.525957-1.202385-14.993482-85.184101-75.577303-170.032558-151.533228-255.200286-227.130997-12.958126-11.500938-20.408819-24.949228-21.892613-42.249243-3.926426-45.832861-8.109702-91.644233-12.58462-137.424906C93.702614 78.683037 96.587314 76.230172 102.771153 78.619592z', 'M412.296719 832.969199c-11.241019 0.195451-20.199041-4.595668-27.944446-12.419867-16.189727-16.352433-32.660864-32.426527-48.675606-48.941666-4.389984-4.532223-6.965645-5.308913-11.861142-0.357134-36.1882 36.612872-72.617901 72.984245-109.189841 109.214401-4.314259 4.276397-4.565992 6.864338 0.046049 10.837836 5.304819 4.563946 10.257621 9.593496 14.932084 14.811334 8.079002 9.018398 7.480368 19.0908-1.243317 28.034497-8.973372 9.200546-20.101827 10.357905-28.869514 1.664919-43.211151-42.823318-86.22992-85.844134-129.069611-129.037888-9.156544-9.231245-8.308223-19.370163 1.034563-28.780487 9.05319-9.117658 19.465331-9.530051 28.903284-1.133823 0.291642 0.255827 0.558725 0.544399 0.859577 0.791016 6.800893 5.597485 11.806907 17.618263 19.522636 16.479323 7.181563-1.060145 13.063527-11.308557 19.397792-17.631566 31.188326-31.141254 62.203714-62.449307 93.623307-93.348038 5.367241-5.276167 5.67014-8.111748 0.060375-13.444197-16.388249-15.58393-32.218796-31.752168-48.109718-47.853891-17.371646-17.594727-17.260106-39.08211 0.084934-56.82931 2.998287-3.068895 6.022157-6.115278 9.091052-9.109472 18.247596-17.827017 39.422871-17.773805 57.611116 0.39295 65.669652 65.598021 131.298372 131.233903 196.881043 196.916858 18.615986 18.642592 18.543332 39.750329 0.083911 58.475809C431.776376 829.644477 425.95274 832.973292 412.296719 832.969199z', 'M849.243349 593.153298c0.067538 11.125385-4.102435 20.361747-11.999288 28.167526-16.35141 16.178471-32.377408 32.689517-48.922223 48.671513-4.862751 4.695952-5.826705 7.252171-0.367367 12.625552 36.403095 35.817764 72.481801 71.969125 108.391662 108.290355 4.819772 4.875031 7.644097 4.710278 11.857049-0.246617 4.28049-5.025457 9.141194-9.602705 14.047947-14.042831 8.774851-7.942903 19.301602-7.481392 28.04166 0.914836 9.632381 9.254781 10.958586 19.721157 2.026146 28.739555-43.068911 43.49563-86.367043 86.767156-129.879046 129.814578-8.695033 8.600889-19.891026 7.138584-28.797883-2.245134-8.68787-9.154497-8.962116-18.794042-0.75827-28.058033 1.028423-1.166569 2.217505-2.185782 3.314489-3.297093 16.548908-16.736173 16.539698-16.727986 0.251733-33.010835-31.986505-31.977295-64.187905-63.739696-95.752808-96.123244-6.664793-6.841825-10.093892-6.160303-16.137539 0.282433-13.859659 14.783705-28.497031 28.840862-42.840714 43.167149-22.122857 22.100344-41.556465 22.200628-63.427588 0.347924-1.929955-1.929955-3.864004-3.855818-5.779633-5.798053-17.902742-18.144242-18.078751-39.645952-0.159636-57.612139 47.354518-47.482431 94.814436-94.856391 142.233422-142.275377 18.47477-18.469654 36.888142-36.997636 55.444776-55.385425 18.10331-17.938558 39.320541-17.84339 57.592696 0.067538C845.30669 573.48126 849.143065 580.042699 849.243349 593.153298z'],
      flee: ['M512 482.133333m-76.8 0a76.8 76.8 0 1 0 153.6 0 76.8 76.8 0 1 0-153.6 0Z', 'M981.333333 524.8h-256c-25.6 0-42.666667-17.066667-42.666666-42.666667 0-59.733333-34.133333-119.466667-85.333334-149.333333-21.333333-12.8-25.6-38.4-17.066666-59.733333l128-221.866667c8.533333-8.533333 17.066667-17.066667 25.6-17.066667 12.8-4.266667 21.333333 0 34.133333 4.266667C925.866667 128 1024 298.666667 1024 482.133333c0 21.333333-17.066667 42.666667-42.666667 42.666667z m-217.6-85.333333h170.666667c-12.8-119.466667-76.8-230.4-174.933333-302.933334l-85.333334 149.333334c46.933333 38.4 81.066667 89.6 89.6 153.6zM298.666667 524.8H42.666667c-25.6 0-42.666667-17.066667-42.666667-42.666667C0 298.666667 98.133333 128 256 38.4c8.533333-4.266667 21.333333-8.533333 34.133333-4.266667 8.533333 0 17.066667 8.533333 25.6 17.066667l128 221.866667v4.266666c8.533333 21.333333 4.266667 42.666667-17.066666 55.466667-51.2 29.866667-85.333333 85.333333-85.333334 149.333333 0 21.333333-17.066667 42.666667-42.666666 42.666667z m-209.066667-85.333333h170.666667c8.533333-59.733333 42.666667-115.2 89.6-153.6l-85.333334-149.333334c-102.4 68.266667-166.4 179.2-174.933333 302.933334zM512 994.133333c-89.6 0-179.2-25.6-256-68.266666-21.333333-12.8-25.6-38.4-17.066667-59.733334v-4.266666l128-217.6c4.266667-8.533333 17.066667-17.066667 25.6-21.333334 12.8-4.266667 21.333333 0 34.133334 4.266667 51.2 29.866667 119.466667 29.866667 170.666666 0 8.533333-4.266667 21.333333-8.533333 34.133334-4.266667 12.8 4.266667 21.333333 8.533333 25.6 21.333334 4.266667 4.266667 128 221.866667 128 221.866666 12.8 21.333333 4.266667 46.933333-17.066667 59.733334-76.8 42.666667-166.4 68.266667-256 68.266666z m-174.933333-123.733333c110.933333 51.2 243.2 51.2 349.866666 0-42.666667-72.533333-68.266667-119.466667-85.333333-149.333333-55.466667 21.333333-123.733333 21.333333-179.2 0l-85.333333 149.333333z']
    };
    const TARGET_ICON_VIEWBOX = {
      coinSingle: '85.333333 85.333333 853.333334 853.333334',
      afk: '96 96 832 832',
      combat: '64 64 896 896'
    };
    function targetIcon(name) {
      const paths = TARGET_ICON_PATHS[name];
      if (!paths) return null;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', name.startsWith('coin') ? 'target-icon target-icon-coin' : 'target-icon');
      svg.setAttribute('viewBox', TARGET_ICON_VIEWBOX[name] || '0 0 1024 1024');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('aria-hidden', 'true');
      for (const data of paths) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', data);
        svg.appendChild(path);
      }
      return svg;
    }
    function appendCell(row, text, className = '', icon = '') {
      const cell = document.createElement('div');
      cell.className = ['nearby-cell', className].filter(Boolean).join(' ');
      if (icon) {
        cell.classList.add('target-name');
        const svg = targetIcon(icon);
        if (svg) cell.appendChild(svg);
        const label = document.createElement('span');
        label.className = 'target-name-text';
        label.textContent = value(text);
        cell.appendChild(label);
      } else {
        cell.textContent = value(text);
      }
      row.appendChild(cell);
      return cell;
    }
    function nearbyDistanceClass(status, distanceCm) {
      const n = number(distanceCm);
      const attackRange = number(status.nearby?.ar);
      return n !== null && attackRange !== null && n <= attackRange ? 'range-attack' : 'range-view';
    }
    function invulnerableText(ms) {
      const n = number(ms);
      if (n === null) return '--';
      if (n < 0) return '是';
      return String(Math.max(1, Math.ceil(Math.max(0, n) / 1000))) + 's';
    }
    function createNearbyRow(kind, cells, head = false, rowClass = '') {
      const row = document.createElement('div');
      row.className = ['nearby-row', kind + '-row', head ? 'nearby-head' : '', rowClass].filter(Boolean).join(' ');
      for (const cell of cells) appendCell(row, cell.text, cell.className, cell.icon);
      return row;
    }
    function createNearbySummaryRow(kind, text) {
      const row = document.createElement('div');
      row.className = ['nearby-row', kind + '-row', 'nearby-summary'].join(' ');
      appendCell(row, text, 'muted');
      return row;
    }
    function mapUnavailableReason(status) {
      if (!status?.game?.inGame) return '当前离线';
      if (number(status.self?.x) === null || number(status.self?.y) === null) return '暂无自身坐标';
      if (number(status.nearby?.vr) === null || number(status.nearby?.vr) <= 0) return '暂无可视范围';
      const observedAgeMs = number(status.nearby?.ageMs);
      const elapsedSinceRefreshMs = lastStatusReceivedAtMs ? Math.max(0, Date.now() - lastStatusReceivedAtMs) : 0;
      if (observedAgeMs !== null && observedAgeMs + elapsedSinceRefreshMs > MAP_STALE_MS) return '地图数据已过期';
      return '';
    }
    function setMapHeader(reason, visibleRange, coinCount, playerCount) {
      if (reason) {
        setRichText('mapTitleMeta', [{ text: reason }], 'muted');
        return;
      }
      setRichText('mapTitleMeta', [
        { text: '半径 ' + distance(visibleRange), className: 'meta-label' },
        { text: ' | 金币 ', className: 'meta-label' },
        { text: String(coinCount), className: 'coin' },
        { text: ' | 玩家 ', className: 'meta-label' },
        { text: String(playerCount), className: 'active-player' }
      ]);
    }
    function prepareMapCanvas(canvas) {
      const rect = canvas.getBoundingClientRect();
      const size = Math.max(1, Math.min(rect.width, rect.height));
      const pixelRatio = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
      const bitmapSize = Math.max(1, Math.round(size * pixelRatio));
      if (canvas.width !== bitmapSize || canvas.height !== bitmapSize) {
        canvas.width = bitmapSize;
        canvas.height = bitmapSize;
      }
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, size, size);
      return { context, size };
    }
    function drawMapBase(context, size, attackRange, visibleRange) {
      const center = size / 2;
      const radius = Math.max(1, center - 2);
      context.save();
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.clip();
      context.fillStyle = '#121518';
      context.fillRect(0, 0, size, size);
      context.strokeStyle = 'rgba(155,167,180,.16)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(center, 2);
      context.lineTo(center, size - 2);
      context.moveTo(2, center);
      context.lineTo(size - 2, center);
      context.stroke();
      if (attackRange > 0 && visibleRange > attackRange) {
        context.setLineDash([4, 4]);
        context.strokeStyle = 'rgba(251,113,133,.68)';
        context.beginPath();
        context.arc(center, center, radius * attackRange / visibleRange, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
      }
      context.restore();
      context.strokeStyle = 'rgba(96,165,250,.62)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.stroke();
      return { center, radius };
    }
    function traceMapDirectionArrow(context, marker) {
      const angle = Math.atan2(marker.direction.vy, marker.direction.vx);
      const arcRadius = marker.radius + Math.max(1.5, marker.radius * .3);
      const arcHalfAngle = Math.acos(.6);
      const tipDistance = marker.radius * 2;
      context.beginPath();
      context.arc(marker.px, marker.py, arcRadius, angle - arcHalfAngle, angle + arcHalfAngle);
      context.lineTo(
        marker.px + Math.cos(angle) * tipDistance,
        marker.py + Math.sin(angle) * tipDistance
      );
      context.closePath();
    }
    function drawMapMarker(context, marker) {
      context.save();
      if (marker.direction) {
        context.fillStyle = marker.color;
        traceMapDirectionArrow(context, marker);
        context.fill();
      }
      context.fillStyle = marker.color;
      context.beginPath();
      context.arc(marker.px, marker.py, marker.radius, 0, Math.PI * 2);
      context.fill();
      if (marker.invulnerable) {
        context.strokeStyle = '#60a5fa';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(marker.px, marker.py, marker.radius + 2, 0, Math.PI * 2);
        context.stroke();
      }
      context.restore();
    }
    function mapTargetMatchesPlayer(target, item) {
      if (!target) return false;
      const targetId = targetIdentity(target);
      const rowId = item?.[9] === null || item?.[9] === undefined || item?.[9] === '' ? '' : String(item[9]);
      if (targetId && rowId) return targetId === rowId;
      return !targetId && Boolean(target.name) && String(target.name) === String(item?.[0] || '');
    }
    function mapPlayerTargetRole(status, item, afk) {
      if (mapTargetMatchesPlayer(status.combat?.target, item)) return 'combat';
      const actionKind = String(status.action?.kind || status.decision?.actionKind || status.decision?.kind || '');
      if (actionKind === 'coin' || actionKind === 'seek-coin' || !mapTargetMatchesPlayer(status.action?.target, item)) return '';
      if (['flee', 'safety-exit', 'leave'].includes(actionKind)) return '';
      return afk ? 'afk' : 'combat';
    }
    function mapVelocity(vxValue, vyValue) {
      const vx = number(vxValue);
      const vy = number(vyValue);
      return vx !== null && vy !== null && Math.hypot(vx, vy) > .001 ? { vx, vy } : null;
    }
    function mapPlayerRecordNames(status) {
      const names = new Set();
      for (const item of Array.isArray(status.dynamicWhitelist?.p) ? status.dynamicWhitelist.p : []) names.add(String(item || ''));
      for (const item of Array.isArray(status.easyKillPlayers?.p) ? status.easyKillPlayers.p : []) names.add(String(Array.isArray(item) ? item[0] : item || ''));
      for (const item of Array.isArray(status.dailyDamagePlayers?.p) ? status.dailyDamagePlayers.p : []) names.add(String(Array.isArray(item) ? item[0] : item || ''));
      names.delete('');
      return names;
    }
    function drawMapTargetPath(context, center, markers, color) {
      if (!markers.length) return;
      context.save();
      context.strokeStyle = color;
      context.lineWidth = .75;
      context.beginPath();
      context.moveTo(center, center);
      for (const marker of markers) context.lineTo(marker.px, marker.py);
      context.stroke();
      context.restore();
    }
    function drawMapLabel(context, marker, size) {
      if (!marker.label) return;
      context.font = (marker.targetRole ? '700 ' : '600 ') + '11px system-ui,-apple-system,Segoe UI,sans-serif';
      const metrics = context.measureText(marker.label);
      const textWidth = Math.ceil(metrics.width);
      const textHeight = Math.max(11, Math.ceil((metrics.actualBoundingBoxAscent || 8) + (metrics.actualBoundingBoxDescent || 3)));
      const leftSide = marker.px < marker.mapCenter;
      const topSide = marker.py < marker.mapCenter;
      const gap = marker.radius + 5;
      const edgePadding = 3;
      let x = leftSide ? marker.px - gap - textWidth : marker.px + gap;
      let y = topSide ? marker.py - gap - textHeight : marker.py + gap;
      x = Math.max(edgePadding, Math.min(size - edgePadding - textWidth, x));
      y = Math.max(edgePadding, Math.min(size - edgePadding - textHeight, y));
      context.textAlign = 'left';
      context.textBaseline = 'top';
      context.lineJoin = 'round';
      context.strokeStyle = 'rgba(8,12,18,.94)';
      context.lineWidth = 3;
      context.strokeText(marker.label, x, y);
      context.fillStyle = marker.targetRole === 'combat'
        ? '#fb7185'
        : (marker.targetRole === 'afk' ? '#4ade80' : (marker.kind === 'coin' ? '#fbbf24' : '#eef2f5'));
      context.fillText(marker.label, x, y);
    }
    function cancelMapMarkerAnimation(resetPositions = false) {
      if (mapAnimationFrame && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(mapAnimationFrame);
      }
      mapAnimationFrame = 0;
      if (resetPositions) {
        mapRenderedMarkerPositions = new Map();
        mapRenderedCanvasSize = 0;
      }
    }
    function rememberMapMarkerPositions(markers, canvasSize) {
      mapRenderedMarkerPositions = new Map(
        markers
          .filter(marker => marker.mapKey)
          .map(marker => [marker.mapKey, { px: marker.px, py: marker.py }])
      );
      mapRenderedCanvasSize = canvasSize;
    }
    function mapAnimationNow() {
      return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    }
    function mapMotionAnimationAllowed() {
      if (typeof requestAnimationFrame !== 'function') return false;
      if (document.visibilityState && document.visibilityState !== 'visible') return false;
      return !(typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    function mapMarkerPositionsMoved(markers, previousPositions) {
      return markers.some(marker => {
        const previous = marker.mapKey ? previousPositions.get(marker.mapKey) : null;
        return previous && Math.hypot(marker.px - previous.px, marker.py - previous.py) > .35;
      });
    }
    function paintTargetMapScene(scene, markers) {
      const { context, size, status, visibleRange, attackRange, emptyReason } = scene;
      context.clearRect(0, 0, size, size);
      const frame = drawMapBase(context, size, attackRange, visibleRange || 1);
      context.save();
      context.beginPath();
      context.arc(frame.center, frame.center, frame.radius, 0, Math.PI * 2);
      context.clip();
      const coinMarkers = markers.filter(marker => marker.kind === 'coin');
      const routeMarkers = coinMarkers.filter(marker => marker.routeOrder > 0).sort((a, b) => a.routeOrder - b.routeOrder);
      drawMapTargetPath(context, frame.center, routeMarkers.length ? routeMarkers : coinMarkers.filter(marker => marker.selected), '#fbbf24');
      const playerTarget = markers.find(marker => marker.targetRole === 'combat')
        || markers.find(marker => marker.targetRole === 'afk');
      if (playerTarget) drawMapTargetPath(context, frame.center, [playerTarget], playerTarget.targetRole === 'combat' ? '#fb7185' : '#4ade80');
      for (const marker of markers.filter(marker => !marker.selected)) drawMapMarker(context, marker);
      for (const marker of markers.filter(marker => marker.selected)) drawMapMarker(context, marker);
      drawMapMarker(context, {
        px: frame.center,
        py: frame.center,
        radius: 5,
        color: '#eef2f5',
        direction: mapVelocity(status.self?.vx, status.self?.vy),
        invulnerable: false
      });
      context.restore();
      for (const marker of markers.filter(marker => marker.label && !marker.selected && !marker.targetRole)) drawMapLabel(context, marker, size);
      for (const marker of markers.filter(marker => marker.label && (marker.selected || marker.targetRole))) drawMapLabel(context, marker, size);
      mapHitTargets = markers;
      if (emptyReason) {
        context.fillStyle = '#9ba7b4';
        context.font = '12px system-ui,-apple-system,Segoe UI,sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(emptyReason, frame.center, frame.center + 24);
      }
    }
    function startMapMarkerAnimation(scene, markers, animate = true) {
      cancelMapMarkerAnimation(false);
      const previousPositions = mapRenderedMarkerPositions;
      const shouldAnimate = animate
        && mapRenderedCanvasSize === scene.size
        && mapMotionAnimationAllowed()
        && mapMarkerPositionsMoved(markers, previousPositions);
      const renderAtProgress = progress => {
        const renderedMarkers = markers.map(marker => (
          interpolateMapMarker(marker, marker.mapKey ? previousPositions.get(marker.mapKey) : null, progress)
        ));
        paintTargetMapScene(scene, renderedMarkers);
        rememberMapMarkerPositions(renderedMarkers, scene.size);
      };
      if (!shouldAnimate) {
        renderAtProgress(1);
        return;
      }
      renderAtProgress(0);
      const startedAt = mapAnimationNow();
      const step = frameAt => {
        const frameTime = Number(frameAt);
        const elapsedMs = (Number.isFinite(frameTime) ? frameTime : mapAnimationNow()) - startedAt;
        const progress = mapAnimationProgress(elapsedMs, MAP_MOVE_ANIMATION_MS);
        renderAtProgress(progress);
        if (progress < 1) {
          mapAnimationFrame = requestAnimationFrame(step);
        } else {
          mapAnimationFrame = 0;
        }
      };
      mapAnimationFrame = requestAnimationFrame(step);
    }
    function renderTargetMap(status, options = {}) {
      latestMapStatus = status || null;
      const canvas = document.getElementById('targetMap');
      if (!canvas) return;
      if (options.resetPositions) cancelMapMarkerAnimation(true);
      const prepared = prepareMapCanvas(canvas);
      if (!prepared) return;
      const { context, size } = prepared;
      const visibleRange = Math.max(0, number(status?.nearby?.vr) || 0);
      const attackRange = Math.max(0, number(status?.nearby?.ar) || 0);
      const frame = { center: size / 2, radius: Math.max(1, size / 2 - 2) };
      const unavailable = mapUnavailableReason(status);
      mapHitTargets = [];
      mapEmptyReason = unavailable;
      hideMapTooltip();
      if (unavailable) {
        cancelMapMarkerAnimation(true);
        context.clearRect(0, 0, size, size);
        drawMapBase(context, size, attackRange, visibleRange || 1);
        setMapHeader(unavailable, visibleRange, 0, 0);
        context.fillStyle = '#9ba7b4';
        context.font = '12px system-ui,-apple-system,Segoe UI,sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(unavailable, frame.center, frame.center);
        hideMapTooltip();
        return;
      }
      const selfX = Number(status.self.x);
      const selfY = Number(status.self.y);
      const scale = frame.radius / visibleRange;
      const coinRows = Array.isArray(status.nearby?.c) ? status.nearby.c : [];
      const playerRows = Array.isArray(status.nearby?.p) ? status.nearby.p : [];
      const markers = [];
      const recordNames = mapPlayerRecordNames(status);
      for (const item of coinRows) {
        const x = number(item?.[7]);
        const y = number(item?.[8]);
        if (x === null || y === null) continue;
        const dx = x - selfX;
        const dy = y - selfY;
        if (Math.hypot(dx, dy) > visibleRange * 1.01) continue;
        const amount = Math.max(0, number(item?.[1]) || 0);
        markers.push({
          mapKey: mapMarkerKey('coin', item?.[0]),
          px: frame.center + dx * scale,
          py: frame.center + dy * scale,
          radius: Math.min(5.5, 2.5 + Math.log2(amount + 1) * .55),
          color: '#fbbf24',
          kind: 'coin',
          selected: panelFlag(item?.[3]),
          routeOrder: Math.max(0, number(item?.[4]) || 0),
          invulnerable: false,
          label: amount > 1 ? integer(amount) : '',
          mapCenter: frame.center,
          tooltip: [
            '金币 ' + value(item?.[0]),
            '数额 ' + integer(item?.[1]) + ' · 距离 ' + distance(item?.[2])
          ].join(String.fromCharCode(10))
        });
      }
      for (const item of playerRows) {
        const x = number(item?.[12]);
        const y = number(item?.[13]);
        if (x === null || y === null) continue;
        const dx = x - selfX;
        const dy = y - selfY;
        if (Math.hypot(dx, dy) > visibleRange * 1.01) continue;
        const afk = isAfkNearbyPlayer(item);
        const invulnerable = isInvulnerableNearbyPlayer(item?.[4]);
        const targetRole = mapPlayerTargetRole(status, item, afk);
        const name = String(item?.[0] || '');
        const label = targetRole === 'combat'
          ? name + ' HP ' + integer(item?.[1])
          : (targetRole === 'afk' ? name + ' Drop ' + integer(item?.[3]) : (recordNames.has(name) ? name : ''));
        markers.push({
          mapKey: mapMarkerKey('player', item?.[9], name),
          px: frame.center + dx * scale,
          py: frame.center + dy * scale,
          radius: 4.5,
          color: afk ? '#4ade80' : '#fb7185',
          kind: 'player',
          selected: Boolean(targetRole),
          targetRole,
          direction: afk ? null : mapVelocity(item?.[14], item?.[15]),
          invulnerable,
          label,
          mapCenter: frame.center,
          tooltip: [
            value(item?.[0]),
            'HP ' + integer(item?.[1]) + ' · Drop ' + integer(item?.[3]) + ' · 距离 ' + distance(item?.[5]),
            invulnerable ? '无敌 ' + invulnerableText(item?.[4]) : ''
          ].filter(Boolean).join(String.fromCharCode(10))
        });
      }
      const emptyReason = (coinRows.length || playerRows.length) && !markers.length ? '目标缺少坐标' : '';
      mapEmptyReason = emptyReason;
      if (emptyReason) {
        setMapHeader(emptyReason, visibleRange, 0, 0);
      } else {
        setMapHeader('', visibleRange, markers.filter(marker => marker.kind === 'coin').length, markers.filter(marker => marker.kind === 'player').length);
      }
      startMapMarkerAnimation({
        context,
        size,
        status,
        visibleRange,
        attackRange,
        emptyReason
      }, markers, options.animate !== false);
    }
    function hideMapTooltip() {
      const tooltip = document.getElementById('mapTooltip');
      if (!tooltip) return;
      tooltip.classList.remove('visible');
    }
    function updateMapTooltip(event) {
      const canvas = document.getElementById('targetMap');
      const stage = document.getElementById('mapStage');
      const tooltip = document.getElementById('mapTooltip');
      if (!canvas || !stage || !tooltip || !mapHitTargets.length) {
        hideMapTooltip();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const marker = mapHitTargets
        .map(item => ({ item, distance: Math.hypot(localX - item.px, localY - item.py) }))
        .filter(candidate => candidate.distance <= Math.max(10, candidate.item.radius + 5))
        .sort((a, b) => a.distance - b.distance || Number(b.item.selected) - Number(a.item.selected))[0]?.item;
      if (!marker) {
        hideMapTooltip();
        return;
      }
      tooltip.textContent = marker.tooltip;
      tooltip.classList.add('visible');
      const left = Math.min(stage.clientWidth - tooltip.offsetWidth - 5, Math.max(5, localX + 12));
      const top = Math.min(stage.clientHeight - tooltip.offsetHeight - 5, Math.max(5, localY + 12));
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }
    function renderNearbyCoins(status) {
      const node = document.getElementById('nearbyCoins');
      if (!node) return;
      if (!status.nearby || typeof status.nearby !== 'object') status.nearby = {};
      const items = Array.isArray(status.nearby?.c) ? status.nearby.c : [];
      const hiddenLowCoinCount = Math.max(0, Number(status.nearby?.coinLowHiddenCount || 0) || 0);
      const largeCount = items.filter(item => number(item?.[1]) !== null && number(item?.[1]) > 1).length;
      const smallCount = items.filter(item => number(item?.[1]) === 1).length + hiddenLowCoinCount;
      status.nearby._largeCount = largeCount;
      status.nearby._smallCount = smallCount;
      setRichText('nearbyTitleMeta', [
        { text: '金币 ', className: 'meta-label' },
        { text: String(largeCount), className: 'coin' },
        { text: '/', className: 'meta-label' },
        { text: String(smallCount), className: 'small-coin' },
        { text: ' | 玩家 ', className: 'meta-label' },
        { text: String((status.nearby?._activeCount || 0)), className: 'active-player' },
        { text: '/', className: 'meta-label' },
        { text: String((status.nearby?._afkCount || 0)), className: 'ok' }
      ]);
      const actionReason = String(status.action?.reason || status.decision?.reason || '');
      const hasMultipleRouteTargets = items.some(item => {
        const routeIndex = number(item?.[4]);
        return routeIndex !== null && routeIndex > 1;
      });
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createNearbyRow('coin', [
        { text: 'ID' },
        { text: '数额' },
        { text: '距离' }
      ], true));
      if (!items.length && hiddenLowCoinCount === 0) {
        fragment.appendChild(createNearbyRow('coin', [{ text: '无' }, { text: '--' }, { text: '--' }]));
      } else {
        for (const item of items) {
          const [id, amount, distanceCm, selected, routeOrder, , bait] = item;
          const routeIndex = number(routeOrder);
          const routeNext = routeIndex !== null && routeIndex > 1;
          const baitCoin = panelFlag(bait);
          const baitPresented = baitCoin && actionReason.startsWith('single-coin-bait-');
          const rowClass = [
            selected ? 'target-current target-coin' : (routeNext ? 'target-route-next target-coin' : ''),
            baitPresented ? 'target-bait' : ''
          ].filter(Boolean).join(' ');
          const icon = nearbyCoinIcon({
            selected,
            bait: baitCoin,
            hasMultipleRouteTargets,
            routeOrder: routeIndex,
            actionReason
          });
          fragment.appendChild(createNearbyRow('coin', [
            { text: id, icon },
            { text: integer(amount), className: 'coin' },
            { text: distance(distanceCm), className: 'distance-badge ' + nearbyDistanceClass(status, distanceCm) }
          ], false, rowClass));
        }
      }
      fragment.appendChild(createNearbySummaryRow('coin', '已折叠' + hiddenLowCoinCount + '个小额金币'));
      node.replaceChildren(fragment);
    }
    function panelFlag(value) {
      return value === true || value === 1 || value === '1';
    }
    function isAfkNearbyPlayer(item) {
      return panelFlag(item?.[10]);
    }
    function isGreenAfkNearbyPlayer(item) {
      return panelFlag(item?.[11]);
    }
    function isInvulnerableNearbyPlayer(invMs) {
      const n = number(invMs);
      return n !== null && n !== 0;
    }
    function playerHpCell(hp, invMs) {
      if (isInvulnerableNearbyPlayer(invMs)) return { text: invulnerableText(invMs), className: 'info' };
      return { text: integer(hp), className: hpAttrs(hp).className };
    }
    function playerStaminaCell(staminaMs, afk, greenAfk) {
      if (afk) return { text: 'AFK', className: greenAfk ? 'ok' : '' };
      return { text: unit(staminaMs) };
    }
    function renderNearbyPlayers(status) {
      const node = document.getElementById('nearbyPlayers');
      if (!node) return;
      if (!status.nearby || typeof status.nearby !== 'object') status.nearby = {};
      const items = Array.isArray(status.nearby?.p) ? status.nearby.p : [];
      const hiddenLowAfkCount = Math.max(0, Number(status.nearby?.playerLowHiddenCount || 0) || 0);
      let activeCount = 0;
      let afkCount = hiddenLowAfkCount;
      for (const item of items) {
        if (isAfkNearbyPlayer(item)) afkCount += 1;
        else activeCount += 1;
      }
      status.nearby._activeCount = activeCount;
      status.nearby._afkCount = afkCount;
      setRichText('nearbyTitleMeta', [
        { text: '金币 ', className: 'meta-label' },
        { text: String((status.nearby?._largeCount || 0)), className: 'coin' },
        { text: '/', className: 'meta-label' },
        { text: String((status.nearby?._smallCount || 0)), className: 'small-coin' },
        { text: ' | 玩家 ', className: 'meta-label' },
        { text: String(activeCount), className: 'active-player' },
        { text: '/', className: 'meta-label' },
        { text: String(afkCount), className: 'ok' }
      ]);
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createNearbyRow('player', [
        { text: '名称' },
        { text: '血量' },
        { text: '体力' },
        { text: 'Drop' },
        { text: '距离' }
      ], true));
      if (!items.length && hiddenLowAfkCount === 0) {
        fragment.appendChild(createNearbyRow('player', [
          { text: '无' },
          { text: '--' },
          { text: '--' },
          { text: '--' },
          { text: '--' }
        ]));
      } else {
        const actionKind = String(status.action?.kind || status.decision?.actionKind || status.decision?.kind || '');
        const fleeTarget = (actionKind === 'flee' || actionKind === 'safety-exit' || actionKind === 'leave') && Boolean(status.action?.target);
        const fleeTargetId = targetIdentity(status.action?.target);
        const fleeTargetName = String(status.action?.target?.name || '');
        for (const item of items) {
          const [name, hp, staminaMs, drop, invMs, distanceCm, selected, , , playerId] = item;
          const hpCell = playerHpCell(hp, invMs);
          const afkTarget = isAfkNearbyPlayer(item);
          const staminaCell = playerStaminaCell(staminaMs, afkTarget, isGreenAfkNearbyPlayer(item));
          const rowTargetId = playerId === null || playerId === undefined || playerId === '' ? '' : String(playerId);
          const isFleeTarget = fleeTarget && selected && (
            (fleeTargetId && rowTargetId && fleeTargetId === rowTargetId)
            || (!fleeTargetId && fleeTargetName && String(name) === fleeTargetName)
          );
          const targetType = isFleeTarget ? 'flee' : (afkTarget ? 'afk' : 'combat');
          const rowClass = selected ? 'target-current target-' + targetType : '';
          fragment.appendChild(createNearbyRow('player', [
            { text: name, icon: selected ? targetType : '' },
            hpCell,
            staminaCell,
            { text: integer(drop), className: 'coin' },
            { text: distance(distanceCm), className: 'distance-badge ' + nearbyDistanceClass(status, distanceCm) }
          ], false, rowClass));
        }
      }
      fragment.appendChild(createNearbySummaryRow('player', '已折叠' + hiddenLowAfkCount + '个低收益挂机玩家'));
      node.replaceChildren(fragment);
    }
    function highDropValueText(item) {
      const values = [item?.[1], item?.[2], item?.[3]];
      const merged = [];
      for (const current of values) {
        const next = number(current);
        if (next === null) continue;
        if (!merged.length || merged[merged.length - 1] !== next) merged.push(next);
      }
      return merged.length ? merged.map(integer).join(' -> ') : '--';
    }
    function createHighDropRow(name, drops, estimatedQuota, head = false, online = undefined, self = false) {
      const row = document.createElement('div');
      row.className = 'high-drop-row' + (head ? ' high-drop-head' : '');
      const nameCell = document.createElement('div');
      const onlineClass = online === true ? 'online' : (online === false ? 'offline' : 'unknown');
      const showPresence = online !== undefined;
      nameCell.className = 'high-drop-cell' + (!head && showPresence ? ' high-drop-name ' + onlineClass + (self ? ' self' : '') : '');
      if (head || !showPresence) {
        nameCell.textContent = value(name);
      } else {
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        const text = document.createElement('span');
        text.className = 'high-drop-cell';
        text.textContent = value(name);
        nameCell.title = online === true ? '在线' : (online === false ? '离线' : '等待全局快照确认');
        nameCell.append(dot, text);
      }
      const dropCell = document.createElement('div');
      dropCell.className = 'high-drop-cell' + (head ? '' : (showPresence ? ' high-drop-values ' + onlineClass + (self ? ' self' : '') : ' muted'));
      dropCell.textContent = value(drops);
      const quotaCell = document.createElement('div');
      quotaCell.className = 'high-drop-cell' + (head ? '' : (showPresence ? ' high-drop-values ' + onlineClass + (self ? ' self' : '') : ' muted'));
      quotaCell.textContent = value(estimatedQuota);
      row.append(nameCell, dropCell, quotaCell);
      return row;
    }
    function renderHighDropPlayers(status) {
      const node = document.getElementById('highDropPlayers');
      if (!node) return;
      const items = Array.isArray(status.highDropPlayers?.p) ? status.highDropPlayers.p.slice() : [];
      const self = status.game?.inGame ? status.self : (status.lastKnown?.self || status.self);
      const selfName = self?.name || (self?.userId ? '#' + self.userId : '自己');
      const selfUserId = number(self?.userId ?? status.session?.userId);
      const today = status.stats?.today || {};
      const dropBaselinePending = today.dropBaselinePending === true;
      const selfInitialDrop = dropBaselinePending ? null : number(today.initialDrop) ?? number(self?.drop);
      const selfMaxDrop = dropBaselinePending ? null : number(today.maxDrop) ?? number(self?.drop);
      const selfLatestDrop = dropBaselinePending ? null : number(today.latestDrop) ?? number(self?.drop);
      setRichText('highDropTitleMeta', [
        { text: '更新于', className: 'meta-label' },
        { text: stamp(status.highDropPlayers?.lastSnapshotAt) }
      ]);
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createHighDropRow('玩家名称', 'Drop', '推测额度', true));
      const rankedItems = items
        .filter(item => selfUserId === null || number(item?.[4]) !== selfUserId)
        .map(item => ({ item, self: false, online: item?.[5] }));
      if (selfInitialDrop !== null || selfMaxDrop !== null) {
        const initial = selfInitialDrop ?? selfMaxDrop;
        const maximum = selfMaxDrop ?? selfInitialDrop;
        const latest = selfLatestDrop;
        rankedItems.push({
          item: [selfName, initial, maximum, latest, selfUserId, status.game?.inGame === true],
          self: true,
          online: status.game?.inGame === true
        });
      }
      rankedItems.sort((left, right) => highDropRankValue(right.item) - highDropRankValue(left.item)
        || (number(right.item?.[2]) ?? -Infinity) - (number(left.item?.[2]) ?? -Infinity)
        || String(left.item?.[0] || '').localeCompare(String(right.item?.[0] || '')));
      if (!rankedItems.length) {
        fragment.appendChild(createHighDropRow('无', '--', '--'));
      } else {
        for (const entry of rankedItems) {
          const item = entry.item;
          fragment.appendChild(createHighDropRow(
            item?.[0],
            highDropValueText(item),
            integer(estimatedHighDropQuota(item?.[1], item?.[2], item?.[3])),
            false,
            entry.online,
            entry.self
          ));
        }
      }
      node.replaceChildren(fragment);
    }
    function createPlayerMemoryName(name, className = '') {
      const node = document.createElement('span');
      node.className = ['player-memory-name', className].filter(Boolean).join(' ');
      node.textContent = value(name);
      return node;
    }
    function renderPlayerMemory(status) {
      const node = document.getElementById('playerMemoryPlayers');
      if (!node) return;
      const fragment = document.createDocumentFragment();
      const whitelistItems = Array.isArray(status.dynamicWhitelist?.p) ? status.dynamicWhitelist.p : [];
      const easyItems = Array.isArray(status.easyKillPlayers?.p) ? status.easyKillPlayers.p : [];
      const damageItems = Array.isArray(status.dailyDamagePlayers?.p) ? status.dailyDamagePlayers.p : [];
      for (const item of whitelistItems) fragment.appendChild(createPlayerMemoryName(item, 'dynamic-whitelist-name'));
      const add = document.createElement('button');
      add.type = 'button'; add.className = 'dynamic-whitelist-add'; add.title = '添加白名单玩家';
      add.innerHTML = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M514.048 62.464q93.184 0 175.616 35.328t143.872 96.768 96.768 143.872 35.328 175.616q0 94.208-35.328 176.128t-96.768 143.36-143.872 96.768-175.616 35.328q-94.208 0-176.64-35.328t-143.872-96.768-96.768-143.36-35.328-176.128q0-93.184 35.328-175.616t96.768-143.872 143.872-96.768 176.64-35.328zM772.096 576.512q26.624 0 45.056-18.944t18.432-45.568-18.432-45.056-45.056-18.432l-192.512 0 0-192.512q0-26.624-18.944-45.568t-45.568-18.944-45.056 18.944-18.432 45.568l0 192.512-192.512 0q-26.624 0-45.056 18.432t-18.432 45.056 18.432 45.568 45.056 18.944l192.512 0 0 191.488q0 26.624 18.432 45.568t45.056 18.944 45.568-18.944 18.944-45.568l0-191.488 192.512 0z"/></svg>';
      add.addEventListener('click', event => { event.stopPropagation(); showDynamicWhitelistPopover(add); });
      fragment.appendChild(add);
      for (const item of easyItems) {
        const score = Math.min(3, Math.max(1, Math.round(number(item?.[1]) || 1)));
        fragment.appendChild(createPlayerMemoryName(item?.[0], 'easy-kill-score-' + score));
      }
      for (const item of damageItems) fragment.appendChild(createPlayerMemoryName(Array.isArray(item) ? item?.[0] : item, 'damage-player-name'));
      node.replaceChildren(fragment);
      setRichText('playerMemoryTitleMeta', [
        { text: '白名单 ', className: 'meta-label' },
        { text: String(Array.isArray(status.dynamicWhitelist?.p) ? status.dynamicWhitelist.p.length : 0), className: 'whitelist-meta-count' },
        { text: ' | 行走的金币 ', className: 'meta-label' },
        { text: String(Array.isArray(status.easyKillPlayers?.p) ? status.easyKillPlayers.p.length : 0), className: 'easy-kill-meta-count' },
        { text: ' | 仇恨之书 ', className: 'meta-label' },
        { text: String(Array.isArray(status.dailyDamagePlayers?.p) ? status.dailyDamagePlayers.p.length : 0), className: 'damage-meta-count' }
      ]);
    }
    function showDynamicWhitelistPopover(anchor) {
      document.querySelector('.dynamic-whitelist-popover')?.remove();
      const panel = document.createElement('div'); panel.className = 'dynamic-whitelist-popover';
      const input = document.createElement('input'); input.placeholder = '玩家名称';
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '确定';
      panel.append(input, button); document.body.appendChild(panel);
      const rect = anchor.getBoundingClientRect();
      panel.style.left = Math.max(6, Math.min(window.innerWidth - panel.offsetWidth - 6, rect.left)) + 'px';
      panel.style.top = Math.max(6, Math.min(window.innerHeight - panel.offsetHeight - 6, rect.bottom + 5)) + 'px';
      input.focus();
      const close = event => { if (!panel.contains(event.target) && event.target !== anchor) { panel.remove(); document.removeEventListener('click', close, true); } };
      document.addEventListener('click', close, true);
      button.addEventListener('click', async () => {
        try { await api('/api/dynamic-whitelist', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ name: input.value }) }); panel.remove(); requestStatusRefresh(true); }
        catch (error) { input.setCustomValidity(error.message || '添加失败'); input.reportValidity(); }
      });
    }
    function updateNearbyPanels(status) {
      const panel = document.getElementById('nearbyGrid');
      if (!panel) return;
      const show = Boolean(status.game?.inGame);
      panel.hidden = !show;
      const nearbyAgeMs = Number(status.nearby?.ageMs);
      panel.title = Number.isFinite(nearbyAgeMs) ? '附近观察数据年龄 ' + duration(nearbyAgeMs) : '';
      if (!show) {
        document.getElementById('nearbyCoins')?.replaceChildren();
        document.getElementById('nearbyPlayers')?.replaceChildren();
        setRichText('nearbyTitleMeta', [
          { text: '金币 ', className: 'meta-label' }, { text: '0', className: 'coin' }, { text: '/', className: 'meta-label' },
          { text: '0', className: 'small-coin' }, { text: ' | 玩家 ', className: 'meta-label' },
          { text: '0', className: 'active-player' }, { text: '/', className: 'meta-label' }, { text: '0', className: 'ok' }
        ]);
        return;
      }
      renderNearbyCoins(status);
      renderNearbyPlayers(status);
    }
    function fighterStateText(actor) {
      if (!actor) return '--';
      if (actor.moving && actor.firing) return '移动+开火';
      if (actor.moving) return '移动';
      if (actor.firing) return '开火';
      return '静止';
    }
    function battleStaminaFragments(actor) {
      return [
        { text: unit(actor?.stamina5s), className: battleStaminaClass(actor) },
        { text: '/', className: '' },
        { text: unit(actor?.stamina1h), className: '' },
        { text: '/', className: '' },
        { text: unit(actor?.stamina1d), className: '' }
      ];
    }
    function battleStaminaClass(actor) {
      const remaining = number(actor?.stamina5s);
      if (remaining === null) return 'muted';
      const seconds = remaining / 1000;
      if (seconds >= 10) return 'ok';
      if (seconds >= 5) return 'warn';
      return 'bad';
    }
    function syncHpMeter(prefix, actor) {
      const hp = number(actor?.hp);
      const maxHpValue = number(actor?.maxHp);
      const maxHp = maxHpValue !== null && maxHpValue > 0 ? maxHpValue : 100;
      const ratio = hp === null ? 0 : Math.max(0, Math.min(1, hp / maxHp));
      setText(prefix + 'Hp', hp === null ? '--' : integer(hp));
      setClass(prefix + 'Hp', 'fighter-summary-hp ' + hpAttrs(hp).className);
      const fill = document.getElementById(prefix + 'HpFill');
      if (!fill) return;
      const width = (ratio * 100).toFixed(1) + '%';
      if (fill.style.width !== width) fill.style.width = width;
      const tone = hpAttrs(hp).className;
      const className = 'hp-fill ' + tone;
      if (fill.className !== className) fill.className = className;
    }
    function updateBattleDuration() {
      const node = document.getElementById('battleDuration');
      const panel = document.getElementById('battlePanel');
      if (!node || !panel || panel.hidden) return;
      const startedAt = node.dataset.battleStartedAt || '';
      const startedMs = Date.parse(startedAt);
      if (Number.isFinite(startedMs)) {
        setText('battleDuration', durationClock(Date.now() - startedMs));
        return;
      }
      setText('battleDuration', durationClock(node.dataset.battleDurationMs || 0));
    }
    function updateBattlePanel(status) {
      const panel = document.getElementById('battlePanel');
      if (!panel) return;
      const battle = status.battle || null;
      const show = Boolean(status.game?.inGame && battle?.active && battle.self && battle.target);
      panel.hidden = !show;
      const durationNode = document.getElementById('battleDuration');
      if (!show) {
        setText('battleTitleMeta', '--');
        if (durationNode) {
          delete durationNode.dataset.battleStartedAt;
          delete durationNode.dataset.battleDurationMs;
        }
        return;
      }
      setText('battleDistance', distance(battle.distance));
      setText('battleStartedAt', stamp(battle.startedAt));
      setText('battleMovementDistance', distance(battle.movementDistance));
      setText('battleSelfName', battle.self.name || (battle.self.userId ? '#' + battle.self.userId : '我方'));
      setText('battleTargetName', battle.target.name || (battle.target.userId ? '#' + battle.target.userId : '敌方'));
      setText('battleSelfDrop', integer(battle.self.drop));
      setText('battleTargetDrop', integer(battle.target.drop));
      setText('battleSelfState', fighterStateText(battle.self));
      setText('battleTargetState', fighterStateText(battle.target));
      syncHpMeter('battleSelf', battle.self);
      syncHpMeter('battleTarget', battle.target);
      setInlineRichText('battleSelfStamina', battleStaminaFragments(battle.self), 'fighter-stamina');
      setInlineRichText('battleTargetStamina', battleStaminaFragments(battle.target), 'fighter-stamina');
      setText('battleTitleMeta', (battle.self.name || '我方') + ' ' + integer(battle.self.hp) + '/' + integer(battle.self.maxHp || 100)
        + ' vs ' + integer(battle.target.hp) + '/' + integer(battle.target.maxHp || 100) + ' ' + (battle.target.name || '敌方'));
      if (durationNode) {
        durationNode.dataset.battleStartedAt = battle.startedAt || '';
        durationNode.dataset.battleDurationMs = String(Math.max(0, Number(battle.durationMs || 0)));
      }
      updateBattleDuration();
    }
    function targetStateText(target) {
      if (!target) return '--';
      return joinNonBlank([
        target.active === null || target.active === undefined ? '--' : '活动 ' + bool(target.active),
        target.moving === null || target.moving === undefined ? '--' : '移动 ' + bool(target.moving),
        target.firing === null || target.firing === undefined ? '--' : '开火 ' + bool(target.firing)
      ]);
    }
    function actionReasonText(status) {
      const reason = status.action?.reason || status.decision?.reason || status.recentExit?.reason;
      return dangerousPlayerExitReasonText(status, reason);
    }
    function isCombatStatus(status, kind, reason) {
      const text = (kind + ' ' + reason + ' ' + (status.decision?.band || '')).toLowerCase();
      return /combat|fight/.test(text) || status.action?.kind === 'combat-live';
    }
    function isSafetyStatus(status, kind, reason) {
      const text = (kind + ' ' + reason + ' ' + (status.decision?.band || '')).toLowerCase();
      return !status.game?.inGame
        || /safety|safe|unsafe|threat|danger|flee|leave|injury|pursuit|stamina|offline|stop/.test(text);
    }
    function actionDetailRows(status) {
      const action = status.action || {};
      const decision = status.decision || {};
      const kind = action.kind || decision.kind || 'wait';
      const currentReason = action.reason || decision.reason || '';
      const target = activeTarget(status);
      const currentSession = status.stats?.currentSession || {};
      const offlineStats = status.stats?.offline || {};
      const { online, realtimeOnline } = panelSessionFlags(status);
      const reason = currentReason;
      const loginDisplay = online ? { state: 'none', text: '--' } : loginPointDisplay(status);
      const rowsOut = [];
      const liveCombat = Boolean(realtimeOnline && (kind === 'combat-live' || action.kind === 'combat-live'));

      addRow(rowsOut, '状态', online ? actionTitleText(status) : offlineActionTitleText(status), true);
      const preflight = status.network?.sourceIpPreflight || null;
      const preflightPhase = String(preflight?.phase || '');
      if (!online && preflight && ['testing', 'retry-wait', 'deferred', 'insufficient', 'ready', 'login-attempt', 'login-failed', 'snapshot-wait'].includes(preflightPhase)) {
        addRow(rowsOut, '出口预检', sourceIpPreflightPhaseText(status.network), true,
          preflightPhase === 'insufficient' ? classAttrs('bad') : classAttrs('info'));
        addRow(rowsOut, '预检进度', sourceIpPreflightProgressText(status.network));
        addRow(rowsOut, '当前测试 IP', preflight.currentIp || '--');
        addRow(rowsOut, '最近响应', sourceIpPreflightLastResultText(status.network));
        const preflightRetryAt = preflightPhase === 'insufficient'
          ? status.stats?.offline?.nextReconnectAt
          : preflight.nextRetryAt;
        addRow(rowsOut, preflightPhase === 'insufficient' ? '冷却结束' : '下次重试', countdownUntil(preflightRetryAt), false, { countdownAt: preflightRetryAt });
        if (preflightPhase === 'deferred') {
          addRow(rowsOut, '延期说明', sourceIpDeferredDetailText(status), true, classAttrs('warn'));
        }
        if (preflightPhase === 'insufficient') {
          addRow(rowsOut, '阻断原因', '可用出口不足 3 个，已进入一小时重连冷却', true, classAttrs('bad'));
        }
      }
      const cloudflareChallenge = status.runner?.connectionFailure?.type === 'cloudflare-challenge'
        ? status.runner.connectionFailure
        : null;
      if (!online && cloudflareChallenge) {
        addRow(rowsOut, '连接状态', 'Cloudflare 挑战已确认，已停止自动登录', true, classAttrs('bad'));
        addRow(rowsOut, '检测依据', Array.isArray(cloudflareChallenge.evidence) && cloudflareChallenge.evidence.length
          ? cloudflareChallenge.evidence.join('、')
          : '响应明确标记为 Challenge');
        addRow(rowsOut, '检测时间', fullStamp(cloudflareChallenge.detectedAt));
        addRow(rowsOut, 'HTTP 状态', cloudflareChallenge.status || '--');
        addRow(rowsOut, 'CF Ray', cloudflareChallenge.cfRay || '--');
        addRow(rowsOut, '游戏状态', cloudflareChallenge.inGameEvidence ? '存在游戏内证据' : '未确认进入游戏');
        addRow(rowsOut, '退出请求', cloudflareChallenge.leaveAttempted
          ? (cloudflareChallenge.leaveConfirmed ? '已调用并确认' : '已调用但未确认')
          : '未调用 leave');
      }
      if (online && !liveCombat) addRow(rowsOut, '原因', actionReasonDisplay(status), true);
      const decisionText = joinNonBlank([kindText(kind), actionReasonText(status)]);
      const statusText = actionText(status);
      const reasonDisplay = online ? actionReasonDisplay(status) : dangerousPlayerExitReasonText(status, reason);
      if (online
        && !liveCombat
        && decisionText !== '--'
        && decisionText !== statusText
        && decisionText !== reasonDisplay
        && decisionText !== joinNonBlank([statusText, reasonDisplay])) {
        addRow(rowsOut, '判断', decisionText);
      }
      if (online && !liveCombat) {
        addRow(rowsOut, '目标', targetLabel(target));
        addRow(rowsOut, '来源', sourceText(target?.authority));
        addRow(rowsOut, '目标状态', targetStateText(target));
      }
      const dataGapSummary = dataGapsText(decision);
      if (online && dataGapSummary !== '--') addRow(rowsOut, '数据缺口', dataGapSummary);

      if (realtimeOnline && !liveCombat && isCombatStatus(status, kind, reason)) {
        addRow(rowsOut, '战斗目标', targetLabel(status.combat?.target));
        addRow(rowsOut, '战斗退出', reasonText(status.combat?.exit?.reason));
        const exitHpText = combatExitHpText(status);
        if (exitHpText && exitHpText !== '--') addRow(rowsOut, '退出触发血量', exitHpText);
      }

      if (!realtimeOnline && isSafetyStatus(status, kind, reason)) {
        const reentry = loginDisplay.state === 'reentry';
        addRow(rowsOut, reentry ? '连接状态' : '登录点', loginPointText(status), false, loginPointAttrs(status));
        addRow(rowsOut, reentry ? '当前坐标' : '登录点坐标', pointCoordText(status.loginPointSafety?.point));
        if (loginDisplay.state === 'unsafe') {
          addRow(rowsOut, '不安全原因', unsafeReasonText(status));
          addRow(rowsOut, '阻碍因素', blockingFactorsText(status));
          const singleBlocker = singleBlockerHoldText(status);
          if (singleBlocker !== '--') addRow(rowsOut, '单人阻挡', singleBlocker);
        } else if (loginDisplay.state === 'pending') {
          addRow(rowsOut, '等待原因', loginPointPendingReasonText(status));
        }
        addRow(rowsOut, '保持离线', offlineBlockerText(status), false, status.stats?.offline?.blocker ? classAttrs('warn') : null);
        if (!loginDisplay.afterOffline) {
          addRow(
            rowsOut,
            reentry ? '状态确认时间' : (loginDisplay.reviewing ? '上次检查时间' : '检查时间'),
            fullStamp(status.loginPointSafety?.checkedAt || status.loginPointSafety?.detail?.checkedAt || status.loginPointSafety?.detail?.previousCheck?.checkedAt)
          );
        }
      }

      if (!online && offlineStats.nextReconnectAt) {
        addRow(rowsOut, '下次重连', fullStamp(offlineStats.nextReconnectAt));
        addRow(rowsOut, '剩余时间', countdownUntil(offlineStats.nextReconnectAt), false, { countdownAt: offlineStats.nextReconnectAt });
      }

      return rowsOut;
    }
    function lastExitDetailRows(status) {
      const offlineStats = status.stats?.offline || {};
      const reason = offlineStats.lastExitReason || status.recentExit?.reason || '';
      const battle = recentBattle(status);
      const staminaExhausted = isStaminaExhaustionExitReason(reason);
      const rowsOut = [];
      addRow(rowsOut, '退出原因', lastExitReasonText(status, reason), true);
      addRow(rowsOut, '退出时间', fullStamp(offlineStats.lastExitAt), true);
      const exitThreat = recentExitThreat(status);
      if (battle && !staminaExhausted) {
        addRow(rowsOut, '交战对手', targetLabel(battle.target), true);
        if (exitThreat) addRow(rowsOut, '退出威胁', targetLabel(exitThreat), true);
        if (battle.targetReappearedAfterKill && battle.priorKillConfirmation?.at) {
          addRow(rowsOut, '此前击杀', (battle.target?.name || '目标') + ' / ' + fullStamp(battle.priorKillConfirmation.at));
        }
        addRow(rowsOut, '战斗结果', recentBattleOutcomeText(status), true);
        addRow(rowsOut, battle.targetReappearedAfterKill ? '交战窗口' : '战斗时间', recentBattleTimeText(status));
        const battleHpText = recentBattleHpText(status);
        if (battleHpText) addRow(rowsOut, battle.targetReappearedAfterKill ? '分段血量' : '战斗起止血量', battleHpText);
        const damageText = recentBattleDamageText(status);
        if (damageText) addRow(rowsOut, battle.targetReappearedAfterKill ? '交战窗口承伤' : '输出承伤', damageText);
        const healingText = recentBattleHealingText(status);
        if (healingText) addRow(rowsOut, battle.targetReappearedAfterKill ? '目标重现' : '战斗恢复', healingText);
        addRow(rowsOut, battle.targetReappearedAfterKill ? '交战窗口射击' : '射击命中', recentBattleShootingText(status));
      } else if (exitThreat && !staminaExhausted) {
        addRow(rowsOut, '退出威胁', targetLabel(exitThreat), true);
      }
      const injuryHpText = recentInjuryHpText(status);
      if (!staminaExhausted && injuryHpText) addRow(rowsOut, '退出判定受击', injuryHpText);
      const exitHpText = combatExitHpText(status);
      if (!staminaExhausted && exitHpText && exitHpText !== '--') {
        addRow(rowsOut, hpTriggeredExit(status, reason) ? '退出触发血量' : '退出时血量', exitHpText);
      }
      const confirmedHpText = confirmedLeaveHpText(status);
      if (confirmedHpText) addRow(rowsOut, '离场确认血量', confirmedHpText);
      return rowsOut;
    }
    function updateLastExitPanel(status) {
      const panel = document.getElementById('lastExitPanel');
      if (!panel) return;
      const offline = status.stats?.offline || {};
      // A preserved logical session is still the current game while realtime
      // control reconnects. Only a finalized session exposes exit history.
      const show = lastExitPanelVisible(status);
      panel.hidden = !show;
      if (!show) {
        setText('lastExitTitleMeta', '--');
        rows('lastExitDetails', []);
        return;
      }
      rows('lastExitDetails', lastExitDetailRows(status));
      setText('lastExitTitleMeta', joinNonBlank([
        fullStamp(offline.lastExitAt),
        lastExitReasonText(status, offline.lastExitReason || status.recentExit?.reason)
      ]));
    }
    function setText(id, text) {
      const node = document.getElementById(id);
      if (!node) return;
      const next = value(text);
      if (node.textContent !== next) node.textContent = next;
    }
    function setClass(id, className) {
      const node = document.getElementById(id);
      if (!node) return;
      if (node.className !== className) node.className = className;
    }
    function setRichText(id, fragments, className = '') {
      const node = document.getElementById(id);
      if (!node) return;
      const normalized = (fragments || []).map(fragment => ({
        text: fragment?.text === null || fragment?.text === undefined ? '' : String(fragment.text),
        className: String(fragment?.className || '')
      }));
      const signature = JSON.stringify(normalized);
      if (node.dataset.richSignature !== signature) {
        const children = normalized.map(fragment => {
          const span = document.createElement('span');
          span.textContent = fragment.text;
          if (fragment.className) span.className = fragment.className;
          return span;
        });
        node.replaceChildren(...children);
        node.dataset.richSignature = signature;
      }
      const nextClass = ['title-meta', className].filter(Boolean).join(' ');
      if (node.className !== nextClass) node.className = nextClass;
    }
    function setInlineRichText(id, fragments, className = '') {
      const node = document.getElementById(id);
      if (!node) return;
      const normalized = (fragments || []).map(fragment => ({
        text: fragment?.text === null || fragment?.text === undefined ? '' : String(fragment.text),
        className: String(fragment?.className || '')
      }));
      const signature = JSON.stringify(normalized);
      if (node.dataset.richSignature !== signature) {
        const children = normalized.map(fragment => {
          const span = document.createElement('span');
          span.textContent = fragment.text;
          if (fragment.className) span.className = fragment.className;
          return span;
        });
        node.replaceChildren(...children);
        node.dataset.richSignature = signature;
      }
      if (node.className !== className) node.className = className;
    }
    function updateWebVersion(latestVersion) {
      const latest = String(latestVersion || '').trim();
      const current = String(WEB_PANEL_VERSION || '').trim();
      const node = document.getElementById('webVersion');
      if (!node) return;
      if (latest && current && latest !== current) {
        setText('webVersion', current + ' -> ' + latest);
        setClass('webVersion', 'warn');
        return;
      }
      setText('webVersion', latest || current || '--');
      setClass('webVersion', '');
    }
    function alreadyReloadedForWebVersion(latest) {
      if (!latest) return false;
      if (params.get('_webReloadVersion') === latest) return true;
      try {
        return sessionStorage.getItem(WEB_PANEL_RELOAD_KEY) === latest;
      } catch (_) {
        return false;
      }
    }
    function markReloadedForWebVersion(latest) {
      try {
        sessionStorage.setItem(WEB_PANEL_RELOAD_KEY, latest);
      } catch (_) {}
    }
    function clearReloadedForCurrentWebVersion() {
      try {
        if (sessionStorage.getItem(WEB_PANEL_RELOAD_KEY) === WEB_PANEL_VERSION) {
          sessionStorage.removeItem(WEB_PANEL_RELOAD_KEY);
        }
      } catch (_) {}
    }
    function maybeReloadForWebVersion(status) {
      const latest = String(status?.statusServer?.webVersion || '').trim();
      updateWebVersion(latest);
      if (!latest || latest === WEB_PANEL_VERSION) {
        clearReloadedForCurrentWebVersion();
        return false;
      }
      if (alreadyReloadedForWebVersion(latest)) return false;
      markReloadedForWebVersion(latest);
      const next = new URL(location.href);
      next.searchParams.set('_webReloadVersion', latest);
      next.searchParams.set('_webReloadAt', String(Date.now()));
      setTimeout(() => location.replace(next.toString()), 50);
      return true;
    }
    function readPanelCollapseState() {
      try {
        const parsed = JSON.parse(localStorage.getItem(PANEL_COLLAPSE_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter(([, collapsed]) => collapsed === true));
      } catch (_) {
        return {};
      }
    }
    function persistPanelCollapseState() {
      try {
        localStorage.setItem(PANEL_COLLAPSE_KEY, JSON.stringify(panelCollapseState));
      } catch (_) {}
    }
    function syncChatKillToggle() {
      const button = document.getElementById('chatCollapseToggle');
      if (!button) return;
      button.textContent = chatKillsCollapsed ? '展开' : '折叠';
      button.setAttribute('aria-expanded', String(!chatKillsCollapsed));
      button.title = chatKillsCollapsed ? '展开多条别人击杀记录' : '折叠多条别人击杀记录';
    }
    function syncPanelCollapse(panel) {
      const key = String(panel?.dataset?.panelKey || '');
      if (!key) return;
      const collapsed = panelCollapseState[key] === true;
      const title = panel.querySelector('[data-panel-title]');
      panel.classList.toggle('panel-collapsed', collapsed);
      if (title) {
        title.setAttribute('aria-expanded', String(!collapsed));
        title.title = collapsed ? '点击展开面板' : '点击折叠面板';
      }
    }
    function togglePanelCollapse(panel) {
      const key = String(panel?.dataset?.panelKey || '');
      if (!key) return;
      if (panelCollapseState[key] === true) delete panelCollapseState[key];
      else panelCollapseState[key] = true;
      persistPanelCollapseState();
      syncPanelCollapse(panel);
    }
    function initPanelCollapse() {
      document.querySelectorAll('section[data-panel-key]').forEach(panel => {
        const title = panel.querySelector('[data-panel-title]');
        if (!title) return;
        syncPanelCollapse(panel);
        panel.querySelector('.panel-head')?.addEventListener('click', event => {
          if (event.target.closest('button,a,input,textarea,select')) return;
          togglePanelCollapse(panel);
        });
        title.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          togglePanelCollapse(panel);
        });
      });
    }
    function setChatHint(text, className) {
      const node = document.getElementById('chatHint');
      if (!node) return;
      const nextText = text === null || text === undefined ? '' : String(text);
      const nextClass = 'chat-hint ' + (className || 'muted');
      if (node.textContent !== nextText) node.textContent = nextText;
      if (node.className !== nextClass) node.className = nextClass;
    }
    function syncChatCompose(chat) {
      const current = chat || latestChatStatus || {};
      const online = Boolean(current.sendAvailable);
      const available = online && !chatSendInFlight;
      const form = document.getElementById('chatForm');
      const input = document.getElementById('chatInput');
      const button = document.getElementById('chatSendBtn');
      if (input) {
        input.disabled = false;
        input.placeholder = '输入游戏聊天消息';
      }
      if (button) {
        button.disabled = !available;
        button.textContent = !online ? '离线' : (chatSendInFlight ? '发送中' : '发送');
      }
    }
    function isChatPanelRefreshAllowed() {
      const panel = document.getElementById('chatPanel');
      return !panel?.classList.contains('panel-collapsed');
    }
    function renderChat(chat) {
      latestChatStatus = chat && typeof chat === 'object' ? chat : {};
      const current = latestChatStatus;
      const messages = Array.isArray(current.messages) ? current.messages : [];
      const logNode = document.getElementById('chatLog');
      if (logNode) {
        const previousHeight = logNode.scrollHeight;
        const previousTop = logNode.scrollTop;
        const nearBottom = previousHeight - previousTop - logNode.clientHeight < 36;
        const fragment = document.createDocumentFragment();
        if (!messages.length) {
          const empty = document.createElement('div');
          empty.className = 'chat-empty';
          empty.textContent = current.snapshot?.lastAt ? '当前快照没有聊天消息' : '等待聊天快照';
          fragment.append(empty);
        } else {
          for (const item of groupChatMessagesForDisplay(messages, chatKillsCollapsed)) {
            if (item.type === 'other-kill-fold') {
              const row = document.createElement('div');
              row.className = 'chat-row chat-fold-summary';
              const textNode = document.createElement('span');
              textNode.className = 'chat-fold-text';
              textNode.textContent = item.count + '条击杀记录已折叠';
              row.append(textNode);
              fragment.append(row);
              continue;
            }
            const message = item.message;
            const kind = ['kill', 'system', 'chat'].includes(String(message?.kind || ''))
              ? String(message.kind)
              : 'chat';
            const row = document.createElement('div');
            row.className = 'chat-row chat-' + kind
              + (message?.mine ? ' mine' : '');
            const time = document.createElement('span');
            time.className = 'chat-time';
            time.textContent = minuteStamp(message?.occurredAt || message?.firstObservedAt);
            const author = document.createElement('span');
            author.className = 'chat-author';
            author.textContent = kind === 'kill'
              ? '击杀'
              : (kind === 'system'
                  ? '系统'
                  : (message?.name || (message?.userId ? 'User ' + message.userId : 'Unknown')));
            const textNode = document.createElement('span');
            textNode.className = 'chat-text';
            textNode.textContent = value(message?.text);
            row.append(time, author, textNode);
            fragment.append(row);
          }
        }
        logNode.replaceChildren(fragment);
        if (nearBottom || previousHeight <= logNode.clientHeight) {
          logNode.scrollTop = logNode.scrollHeight;
        } else {
          logNode.scrollTop = Math.max(0, previousTop + (logNode.scrollHeight - previousHeight));
        }
      }
      setText('chatRefreshAt', elapsedSecondsText(current.snapshot?.lastAt));
      syncChatKillToggle();
      syncChatCompose(current);
      if (!chatSendInFlight) setChatHint('', 'muted');
    }
    async function fetchStatus() {
      const requestedAt = new Date().toISOString();
      setText('stamp', fullStamp(requestedAt));
      setClass('stamp', 'info');
      const stampNode = document.getElementById('stamp');
      if (stampNode) stampNode.title = '正在调用状态接口';
      const url = '/api/panel-status' + (token ? '?token=' + encodeURIComponent(token) : '');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      lastStatusReceivedAtMs = Date.now();
      lastServerUpdatedAtMs = Date.parse(String(data?.updatedAt || '')) || lastStatusReceivedAtMs;
      return data;
    }
    async function fetchChat() {
      const url = '/api/chat' + (token ? '?token=' + encodeURIComponent(token) : '');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }
    async function api(path, options = {}) {
      const url = path + (token ? '?token=' + encodeURIComponent(token) : '');
      const res = await fetch(url, {
        ...options,
        headers: {
          'content-type': 'application/json',
          ...(options.headers || {})
        }
      });
      let data = null;
      try {
        data = await res.json();
      } catch (_) {
        data = null;
      }
      if (!res.ok) {
        const error = new Error(data?.error || data?.reason || ('HTTP ' + res.status));
        error.data = data;
        throw error;
      }
      return data || { ok: true };
    }
    async function refresh() {
      const statusPromise = fetchStatus();
      const chatPromise = isChatPanelRefreshAllowed() ? fetchChat() : Promise.resolve(latestChatStatus || {});
      const result = await Promise.all([statusPromise, chatPromise]);
      const s = result[0];
      const chat = result[1];
      if (maybeReloadForWebVersion(s)) return;
      if (isChatPanelRefreshAllowed()) renderChat(chat);
      updateAuthPanel(s);
      const authNeeds = Boolean(s.auth?.needsReauth);
      const statusClass = authNeeds ? authClass(s) : (s.runner?.lastError ? 'bad' : (s.runner?.running ? 'ok' : 'info'));
      setClass('stamp', statusClass);
      const stampNode = document.getElementById('stamp');
      if (stampNode) stampNode.title = '';
      setText('sourceIpCount', sourceIpCountText(s.network));
      setText('sourceIp', s.network?.sourceIp);
      setText('sourceIpPreflightPhase', sourceIpPreflightPhaseText(s.network));
      setText('sourceIpPreflightProgress', sourceIpPreflightProgressText(s.network));
      setText('sourceIpPreflightCurrentIp', s.network?.sourceIpPreflight?.currentIp || '--');
      setText('sourceIpPreflightLastResult', sourceIpPreflightLastResultText(s.network));
      setText('sourceIpPreflightNextRetry', countdownUntil(
        s.network?.sourceIpPreflight?.phase === 'insufficient'
          ? s.stats?.offline?.nextReconnectAt
          : s.network?.sourceIpPreflight?.nextRetryAt
      ));
      setClass('sourceIpPreflightPhase', String(s.network?.sourceIpPreflight?.phase || '').includes('insufficient') ? 'bad' : '');
      const transportHealth = s.network?.transportHealth || null;
      setText('transportHealthMode', transportModeText(transportHealth));
      const metricClass = transportMetricClass(transportHealth);
      setInlineRichText('transportLatency', latencyPairFragments(transportHealth?.latency, 'latency'), metricClass);
      setInlineRichText('transportQueue', latencyPairFragments(transportHealth?.processingQueue, 'queue'), metricClass);
      setInlineRichText('transportCommandLatency', transportCommandLatencyFragments(transportHealth?.command), metricClass);
      setInlineRichText('transportFrameLoss', transportFrameLossFragments(transportHealth?.frameLoss), metricClass);
      const transportClass = transportHealthClass(transportHealth);
      setClass('transportHealthMode', transportClass);
      setRichText('programRefreshMeta', [
        { text: elapsedSecondsValue(lastStatusReceivedAtMs), className: 'info' },
        { text: '/', className: 'meta-label' },
        { text: elapsedSecondsValue(lastServerUpdatedAtMs), className: 'muted' },
        { text: '前', className: 'meta-label' }
      ]);

      rows('actionDetails', actionDetailRows(s));
      updateBattlePanel(s);
      updateLastExitPanel(s);
      renderTargetMap(s);
      updateNearbyPanels(s);
      renderHighDropPlayers(s);
      renderPlayerMemory(s);
      const roleSelf = s.game?.inGame ? s.self : (s.lastKnown?.self || s.self);
      const roleStamina = s.game?.inGame ? s.stamina : (s.lastKnown?.stamina || s.stamina);
      const offlineRole = !s.game?.inGame && Boolean(s.lastKnown);
      const accountName = roleSelf?.name || s.self?.name || '账号';
      const loggedIn = Boolean(s.session?.authenticated);
      setRichText('accountTitleMeta', [
        { text: accountName + ' ', className: 'meta-label' },
        { text: loggedIn ? '已登录' : '未登录', className: loggedIn ? 'ok' : 'bad' }
      ], loggedIn ? 'ok' : 'bad');
      const roleTitleMuted = !s.game?.inGame;
      setRichText('roleTitleMeta', [
        { text: 'HP ', className: roleTitleMuted ? 'muted' : 'meta-label' },
        { text: integer(roleSelf?.hp), className: roleTitleMuted ? 'muted' : hpAttrs(roleSelf?.hp).className },
        { text: ' | Drop ', className: roleTitleMuted ? 'muted' : 'meta-label' },
        { text: integer(roleSelf?.drop), className: roleTitleMuted ? 'muted' : 'coin' }
      ], roleTitleMuted ? 'muted' : '');
      rows('accountStatus', [
        ['账号', s.session?.userId],
        ['名称', roleSelf?.name || s.self?.name],
        ['授权', authStatusShortText(s), authStatusAttrs(s)],
        ['登录信息', s.session?.tokenPresent ? '已有' : '缺失', tokenStatusAttrs(s)],
        ['已登录', bool(s.session?.authenticated), boolAttrs(s.session?.authenticated)],
        ['授权时间', fullStamp(s.auth?.tokenUpdatedAt || s.session?.tokenUpdatedAt)]
      ]);
      rows('roleStatus', [
        ['游戏内', bool(s.game?.inGame), gameStatusAttrs(s)],
        ['当前位置', s.game?.inGame ? pointCoordText(s.self) : '--'],
        [offlineRole ? '上次体力5s' : '体力5s', staminaPair(roleStamina?.remaining5s, 10)],
        [offlineRole ? '上次体力1h' : '体力1h', staminaPair(roleStamina?.remaining1h, 3000), staminaAttrs(roleStamina?.remaining1h, 3000)],
        [offlineRole ? '上次体力1d' : '体力1d', staminaPair(roleStamina?.remaining1d, 20000), staminaAttrs(roleStamina?.remaining1d, 20000)]
      ]);
      const currentSession = s.stats?.currentSession || {};
      const todayStats = s.stats?.today || {};
      const { online } = panelSessionFlags(s);
      setText('sessionPanelTitle', online ? '本次游戏' : '上次游戏');
      rows('currentSession', [
        ['进入时间', fullStamp(currentSession.enteredAt), true],
        ['持续时间', durationClock(currentSession.durationMs)]
      ]);
      rows('todayStats', [
        ['日期', todayStats.day],
        ['游戏时长', durationClock(todayStats.inGameDurationMs)]
      ]);
      setRichText('sessionTitleMeta', [
        { text: 'STA ', className: 'meta-label' }, { text: spentStaminaUnit(currentSession.staminaSpentMs), className: 'ok' },
        { text: ' | Coin ', className: 'meta-label' }, { text: integer(currentSession.coinsGained), className: 'coin' },
        { text: ' | Kill ', className: 'meta-label' }, { text: integer(currentSession.kills), className: 'bad' }
      ]);
      setRichText('todayTitleMeta', [
        { text: 'STA ', className: 'meta-label' }, { text: spentStaminaUnit(todayStats.staminaSpentMs), className: 'ok' },
        { text: ' | Coin ', className: 'meta-label' }, { text: integer(todayStats.coinsGained), className: 'coin' },
        { text: ' | Kill ', className: 'meta-label' }, { text: integer(todayStats.kills), className: 'bad' }
      ]);
      setText('actionTitleMeta', panelSessionFlags(s).online ? actionTitleText(s) : offlineActionTitleText(s));
      updateCountdownNodes();
    }
    function updateCountdownNodes() {
      document.querySelectorAll('[data-countdown-at]').forEach(node => {
        setValueText(node, countdownUntil(node.dataset.countdownAt || ''));
      });
      updateBattleDuration();
      if (lastStatusReceivedAtMs) {
        setRichText('programRefreshMeta', [
          { text: elapsedSecondsValue(lastStatusReceivedAtMs), className: 'info' },
          { text: '/', className: 'meta-label' },
          { text: elapsedSecondsValue(lastServerUpdatedAtMs), className: 'muted' },
          { text: '前', className: 'meta-label' }
        ]);
      }
      if (latestChatStatus?.snapshot?.lastAt) setText('chatRefreshAt', elapsedSecondsText(latestChatStatus.snapshot.lastAt));
      if (latestMapStatus) {
        const nextMapEmptyReason = mapUnavailableReason(latestMapStatus);
        if (nextMapEmptyReason === '地图数据已过期' && nextMapEmptyReason !== mapEmptyReason) {
          renderTargetMap(latestMapStatus, { animate: false, resetPositions: true });
        }
      }
    }
    function isPageVisibleForRefresh() {
      if (document.visibilityState) return document.visibilityState === 'visible';
      if (typeof document.hidden === 'boolean') return !document.hidden;
      return true;
    }
    function requestStatusRefresh(showFailure = true, force = false) {
      if (!isPageVisibleForRefresh()) return Promise.resolve(null);
      if (refreshInFlight && !force) return refreshInFlight;
      const waitForCurrent = refreshInFlight && force ? refreshInFlight.catch(() => null) : Promise.resolve();
      const currentRefresh = waitForCurrent
        .then(() => refresh())
        .catch(err => {
          if (showFailure) showStatusError(err);
        })
        .finally(() => {
          if (refreshInFlight === currentRefresh) refreshInFlight = null;
        });
      refreshInFlight = currentRefresh;
      return refreshInFlight;
    }
    function startAutoRefresh() {
      if (autoRefreshTimer || !isPageVisibleForRefresh()) return;
      autoRefreshTimer = setInterval(() => requestStatusRefresh(true), AUTO_REFRESH_MS);
      if (!countdownTimer) countdownTimer = setInterval(updateCountdownNodes, 1000);
    }
    function stopAutoRefresh() {
      cancelMapMarkerAnimation(true);
      if (!autoRefreshTimer) return;
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = 0;
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = 0;
      }
    }
    function syncAutoRefreshForVisibility() {
      if (isPageVisibleForRefresh()) {
        startAutoRefresh();
        requestStatusRefresh(true);
        return;
      }
      stopAutoRefresh();
      setClass('stamp', 'muted');
      const stampNode = document.getElementById('stamp');
      if (stampNode) stampNode.title = '页面不可见，自动刷新已暂停';
    }
    document.getElementById('authBtn').onclick = () => (async () => {
      setAuthMessage('正在获取授权链接', 'info');
      const data = await api('/api/auth-url', { method: 'POST' });
      setAuthUrl(data.authUrl || '');
      setAuthMessage(data.authUrl ? '授权链接已生成' : '授权链接已请求', 'ok');
      await requestStatusRefresh(true, true);
    })().catch(showError);
    document.getElementById('callbackBtn').onclick = () => (async () => {
      const input = document.getElementById('callbackInput').value.trim();
      if (!input) throw new Error('请先粘贴授权后的回调地址');
      setAuthMessage('正在提交回调', 'info');
      await api('/api/callback', { method: 'POST', body: JSON.stringify({ callbackUrl: input }) });
      document.getElementById('callbackInput').value = '';
      setAuthMessage('授权已更新', 'ok');
      await requestStatusRefresh(true, true);
    })().catch(showError);
    document.getElementById('chatForm').addEventListener('submit', event => {
      event.preventDefault();
      if (chatSendInFlight) return;
      const input = document.getElementById('chatInput');
      const text = String(input?.value || '').trim();
      if (!text) {
        setChatHint('消息不能为空', 'bad');
        input?.focus();
        return;
      }
      chatSendInFlight = true;
      syncChatCompose();
      setChatHint('', 'muted');
      (async () => {
        const data = await api('/api/chat/send', {
          method: 'POST',
          body: JSON.stringify({ text })
        });
        if (input) input.value = '';
        if (data.chat) renderChat(data.chat);
        await requestStatusRefresh(true, true);
      })().catch(err => {
        if (err?.data?.chat) renderChat(err.data.chat);
        setChatHint(err?.message || '聊天发送失败', 'bad');
      }).finally(() => {
        chatSendInFlight = false;
        syncChatCompose();
        input?.focus();
      });
    });
    document.getElementById('chatCollapseToggle').addEventListener('click', event => {
      event.preventDefault();
      chatKillsCollapsed = !chatKillsCollapsed;
      syncChatKillToggle();
      renderChat(latestChatStatus || {});
    });
    function setAuthMessage(text, className) {
      const node = document.getElementById('authMessage');
      if (!node) return;
      const nextText = value(text);
      const nextClass = 'auth-message ' + (className || 'muted');
      if (node.textContent !== nextText) node.textContent = nextText;
      if (node.className !== nextClass) node.className = nextClass;
    }
    function showError(err) {
      const message = String(err?.message || '');
      setAuthMessage(message || '请求失败', 'bad');
    }
    function showStatusError(err) {
      const message = String(err?.message || '请求失败');
      setClass('stamp', 'bad');
      const stampNode = document.getElementById('stamp');
      if (stampNode) stampNode.title = message;
    }
    document.addEventListener('visibilitychange', syncAutoRefreshForVisibility);
    window.addEventListener('pageshow', syncAutoRefreshForVisibility);
    window.addEventListener('pagehide', stopAutoRefresh);
    document.getElementById('targetMap')?.addEventListener('pointermove', updateMapTooltip);
    document.getElementById('targetMap')?.addEventListener('pointerleave', hideMapTooltip);
    const mapStage = document.getElementById('mapStage');
    if (mapStage && typeof ResizeObserver === 'function') {
      const mapResizeObserver = new ResizeObserver(() => {
        if (latestMapStatus) renderTargetMap(latestMapStatus, { animate: false, resetPositions: true });
      });
      mapResizeObserver.observe(mapStage);
    } else {
      window.addEventListener('resize', () => {
        if (latestMapStatus) renderTargetMap(latestMapStatus, { animate: false, resetPositions: true });
      });
    }
    initPanelCollapse();
    syncChatKillToggle();
    // Apply persisted panel classes before enabling transitions so refreshes do not animate.
    document.body.offsetHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => document.body.classList.remove('panel-collapse-initializing'));
    });
    syncAutoRefreshForVisibility();
  </script>
</body>
</html>`;
}

module.exports = {
  BROWSERLESS_WEB_PANEL_VERSION,
  estimatedHighDropQuotaCore,
  formatSpentStaminaCore,
  groupBlockingFactorsCore,
  groupChatMessagesForDisplay,
  highDropRankValueCore,
  interpolateMapMarkerCore,
  isStaminaExhaustionExitReasonCore,
  lastExitPanelVisibleCore,
  mapAnimationProgressCore,
  mapMarkerKeyCore,
  missCloseExitReasonTextCore,
  recoveryContactExitReasonTextCore,
  nearbyCoinIconCore,
  panelSessionFlagsCore,
  restartDrainBlockedReasonTextCore,
  transportMetricValueClassCore,
  renderBrowserlessWebPanel
};
