'use strict';

// Bump only when this browserless web page or its frontend assets change.
const BROWSERLESS_WEB_PANEL_VERSION = '2026.07.11.1';
const BROWSERLESS_WEB_PANEL_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23060b16'/%3E%3Ccircle cx='32' cy='32' r='23' fill='none' stroke='%2338bdf8' stroke-width='4' stroke-opacity='.55'/%3E%3Cpath d='M32 9v46M9 32h46' stroke='%2394a3b8' stroke-width='3' stroke-opacity='.45'/%3E%3Ccircle cx='32' cy='32' r='7' fill='%2334d399'/%3E%3Ccircle cx='46' cy='20' r='4' fill='%2338bdf8'/%3E%3Ccircle cx='19' cy='43' r='4' fill='%23fb7185'/%3E%3Cpath d='M32 32l14-12' stroke='%2338bdf8' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";

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
    .ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.info{color:var(--blue)}.coin{color:var(--coin)}.muted{color:var(--muted)}
    .value-with-dot{display:inline-flex;align-items:center;gap:6px}
    .field-value-text{min-width:0;overflow-wrap:anywhere}
    .status-dot{width:8px;height:8px;border-radius:999px;flex:0 0 auto;background:currentColor;box-shadow:0 0 0 1px rgba(255,255,255,.12)}
    .status-dot.breathe{animation:status-breathe 1.6s ease-in-out infinite}
    @keyframes status-breathe{0%,100%{opacity:.62;transform:scale(.82);box-shadow:0 0 0 0 rgba(255,255,255,.18)}50%{opacity:1;transform:scale(1);box-shadow:0 0 0 6px rgba(255,255,255,0)}}
    .layout{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,2fr);gap:10px;align-items:start}
    .stack{display:flex;flex-direction:column;gap:10px;min-width:0}
    .stats-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
    .nearby-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
    section{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:10px;min-width:0}
    h2{font-size:11px;line-height:1.2;margin:0 0 8px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    dl{display:grid;grid-template-columns:minmax(76px,auto) 1fr;gap:5px 9px;margin:0}
    dt{color:var(--muted);min-width:0}
    dd{margin:0;min-width:0;overflow-wrap:anywhere}
    .auth-panel{margin-bottom:0}
    .auth-panel[hidden]{display:none}
    .auth-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
    .auth-prompt{color:var(--muted);overflow-wrap:anywhere}
    .auth-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
    a{color:var(--blue);text-decoration:none;overflow-wrap:anywhere}
    a:hover{text-decoration:underline}
    textarea{width:100%;min-height:76px;margin-top:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--text);font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:8px;resize:vertical}
    pre.auth-url{display:none;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--muted);padding:8px;max-height:120px;overflow:auto}
    .auth-message{min-height:18px;overflow-wrap:anywhere}
    .nearby-list{display:grid;gap:4px;min-width:0}
    .nearby-row{display:grid;align-items:center;gap:6px;min-height:26px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .nearby-row:last-child{border-bottom:0}
    .nearby-head{color:var(--muted);font-size:11px;font-weight:700}
    .nearby-summary .nearby-cell{grid-column:1/-1;color:var(--muted)}
    .coin-row{grid-template-columns:minmax(48px,1.2fr) minmax(36px,.6fr) minmax(54px,.75fr) minmax(42px,.55fr)}
    .player-row{grid-template-columns:minmax(64px,1.3fr) minmax(38px,.55fr) minmax(42px,.65fr) minmax(42px,.55fr) minmax(54px,.8fr) minmax(54px,.75fr) minmax(42px,.55fr)}
    .nearby-cell{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .distance-badge{font-variant-numeric:tabular-nums}
    .range-attack{color:var(--green)}
    .range-view{color:var(--blue)}
    .selected-mark{color:var(--amber);font-weight:700}
    @media (max-width:760px){.layout{grid-template-columns:1fr}.stats-grid,.nearby-grid{grid-template-columns:1fr}}
    @media (max-width:520px){main{padding:10px}header{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>囤囤鼠历险记Bot</h1>
    </header>

    <div class="layout">
      <div class="stack left-stack">
        <section>
          <h2>程序状态</h2>
          <dl>
            <dt>网页版本</dt><dd id="webVersion">${BROWSERLESS_WEB_PANEL_VERSION}</dd>
            <dt>刷新时间</dt><dd id="stamp">--</dd>
            <dt>出口数量</dt><dd id="sourceIpCount">--</dd>
            <dt>当前出口</dt><dd id="sourceIp">--</dd>
          </dl>
        </section>
        <section>
          <h2>账号状态</h2>
          <dl id="accountStatus"></dl>
        </section>
        <section>
          <h2>角色状态</h2>
          <dl id="roleStatus"></dl>
        </section>
      </div>
      <div class="stack right-stack">
        <section id="authPanel" class="auth-panel" hidden>
          <div class="auth-head">
            <div>
              <h2>授权</h2>
              <div id="authPrompt" class="auth-prompt">--</div>
            </div>
            <span id="authState" class="pill">--</span>
          </div>
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
        </section>
        <section>
          <h2>当前动作</h2>
          <dl id="actionDetails"></dl>
        </section>
        <div class="stats-grid">
          <section>
            <h2 id="sessionPanelTitle">本次游戏</h2>
            <dl id="currentSession"></dl>
          </section>
          <section>
            <h2>今日累计</h2>
            <dl id="todayStats"></dl>
          </section>
        </div>
        <div id="nearbyGrid" class="nearby-grid" hidden>
          <section>
            <h2>附近金币</h2>
            <div id="nearbyCoins" class="nearby-list"></div>
          </section>
          <section>
            <h2>附近玩家</h2>
            <div id="nearbyPlayers" class="nearby-list"></div>
          </section>
        </div>
      </div>
    </div>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const token = params.get('token') || localStorage.graspRatBrowserlessToken || '';
    if (token) localStorage.graspRatBrowserlessToken = token;
    const WEB_PANEL_VERSION = ${JSON.stringify(BROWSERLESS_WEB_PANEL_VERSION)};
    const WEB_PANEL_RELOAD_KEY = 'graspRatBrowserlessPanelReloadedVersion';
    const AUTO_REFRESH_MS = 3000;
    let autoRefreshTimer = 0;
    let countdownTimer = 0;
    let refreshInFlight = null;

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
    function pointCoordText(point) {
      if (!point || (number(point.x) === null && number(point.y) === null)) return '--';
      return coord(point.x) + ', ' + coord(point.y);
    }
    const reasonMap = {
      'best-opportunity-coin': '选择收益最高的金币',
      'best-opportunity-coin-route': '按金币路线移动',
      'best-opportunity-visible-coin': '去看得见的金币',
      'high-value-visible-coin-priority': '优先捡高价值金币',
      'near-coin-priority': '优先捡近处金币',
      'foot-coin-priority': '先捡脚边金币',
      'best-opportunity-drop-target': '选择收益最高的目标',
      'best-opportunity-afk-drop-target': '攻击不动且有掉落的目标',
      'approach-profitable-drop-target': '靠近高收益目标',
      'opportunistic-afk-drop-shot': '顺手打不动的目标',
      'combat-attack': '正在打架',
      'combat-spacing': '保持距离并开火',
      'combat-tangent-dodge': '边躲边打',
      'combat-hp-disadvantage-leave': '血量劣势，退出',
      'combat-critical-hp-leave': '血量太低，退出',
      'injury-leave': '受伤后退出',
      'pursuit-leave': '被持续追击，退出',
      'profit-live-snapshot-active-threat': '附近有危险玩家，退出',
      'stamina-budget-coin-leave': '体力不足，退出等待恢复',
      'stamina-exhausted-leave': '体力耗尽，退出等待恢复',
      'wait-for-full-stamina-and-hp': '等待血量和体力恢复',
      'move-to-target': '向目标移动',
      'no-opportunistic-shot': '没有顺手开火目标',
      'missing-target': '没有目标',
      'no-target': '没有目标',
      'manual-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'learned-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'imported-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'manual-session-updated': '授权已更新，等待下一轮连接',
      'auth-token-invalid': '登录信息失效，需要重新授权',
      'unsafe-login-point': '登录点不安全',
      'snapshot safety not confirmed: active-near-login-point': '登录点附近有危险玩家，暂不进入',
      'snapshot-safety-streak-pending': '登录点已安全，等待连续确认',
      'snapshot-safety-streak-missing': '缺少登录点安全结果',
      'missing-manual-session': '等待登录信息',
      'missing-login-point': '缺少登录点坐标',
      'missing-snapshot-tick': '快照缺少时间戳',
      'stale-snapshot-tick': '快照过期',
      'no-prior-tick': '没有历史时间戳',
      fresh: '快照已更新',
      safe: '安全',
      'active-near-login-point': '登录点附近有危险玩家',
      'self-present-reentry': '已经在游戏中，继续接管',
      'cycle-complete': '本轮结束，等待下一轮',
      'ws-closed': '连接断开，准备重连',
      'ws-error': '连接异常，准备重连',
      'frame-gap': '画面更新中断，准备重连',
      'stale-self': '自身状态太久没更新，准备重连',
      'no-self': '没有看到自己，等待恢复',
      'direct-leave-failed': '退出确认失败，重试',
      'explicit-stop': '手动停止',
      'self-test': '测试',
      'login-point-bootstrap-failed': '登录点检查失败',
      'snapshot-safety-retry': '重新检查登录点安全',
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
      'return-block-scan': '避开危险'
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
      if (/combat/i.test(text)) return '正在处理打架';
      if (/active|threat|danger/i.test(text)) return '附近有危险';
      if (/leave/i.test(text)) return '正在退出游戏';
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
    function modeText(mode, combatEnabled) {
      const text = modeMap[mode] || (mode ? '自动运行' : '--');
      return combatEnabled ? text + ' / 可打架' : text;
    }
    function sourceText(source) {
      const text = String(source || '').toLowerCase();
      if (!text) return '--';
      if (text.includes('real') || text.includes('live') || text.includes('native')) return '实时';
      if (text.includes('snapshot') || text.includes('fallback')) return '快照';
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
      const translated = gaps.map(dataGapText).filter(Boolean);
      if (translated.length) {
        const hiddenCount = Math.max(0, Number(decision?.dataGapCount || 0) - gaps.length);
        return translated.join(' / ') + (hiddenCount ? ' / 另有 ' + hiddenCount + ' 项' : '');
      }
      return decision?.dataGapCount ? String(decision.dataGapCount) + ' 项' : '--';
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
    function loginPointDisplay(status) {
      if (status.game?.inGame) return { state: 'none', text: '--' };
      const detail = status.loginPointSafety?.detail || {};
      const reason = String(status.loginPointSafety?.reason || '');
      const detailReason = String(detail.reason || '');
      const originalReason = String(detail.originalReason || '');
      const reasonText = [reason, detailReason, originalReason].join(' ');
      const safeReason = /^safe$/i.test(detailReason) || /^safe$/i.test(originalReason);
      const streak = number(detail.streak ?? status.loginPointSafety?.streak);
      const safeLike = Boolean(
        status.loginPointSafety?.ok === true
          || detail.ok === true
          || safeReason
          || (streak !== null && streak > 0 && /pending|streak/i.test(reasonText))
      );
      if (safeLike) {
        return { state: 'safe', text: '安全 ' + loginPointProgressText(status, true) };
      }
      return { state: 'unsafe', text: '不安全' };
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
    function unsafeReasonText(status) {
      if (status.game?.inGame || loginPointDisplay(status).state === 'safe') return '--';
      const detail = status.loginPointSafety?.detail || {};
      const raw = detail.unsafeReason || detail.reason || status.loginPointSafety?.reason;
      if (!raw || /^safe$/i.test(String(raw)) || /pending-snapshot-safety|snapshot-safety-streak-pending/i.test(String(raw))) return '--';
      const translated = reasonText(raw);
      return translated === '安全' ? '--' : translated;
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
      if (kind === 'attack' || kind === 'combat-live') return '打目标 ' + targetLabel(target);
      return kindText(kind);
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
    function appendCell(row, text, className = '') {
      const cell = document.createElement('div');
      cell.className = ['nearby-cell', className].filter(Boolean).join(' ');
      cell.textContent = value(text);
      row.appendChild(cell);
      return cell;
    }
    function nearbyDistanceClass(status, distanceCm) {
      const n = number(distanceCm);
      const attackRange = number(status.nearby?.ar);
      return n !== null && attackRange !== null && n <= attackRange ? 'range-attack' : 'range-view';
    }
    function selectedText(flag) {
      return flag ? '是' : '--';
    }
    function invulnerableText(ms) {
      const n = number(ms);
      if (n === null) return '--';
      if (n < 0) return '是';
      return durationClock(n);
    }
    function createNearbyRow(kind, cells, head = false) {
      const row = document.createElement('div');
      row.className = ['nearby-row', kind + '-row', head ? 'nearby-head' : ''].filter(Boolean).join(' ');
      for (const cell of cells) appendCell(row, cell.text, cell.className);
      return row;
    }
    function createNearbySummaryRow(kind, text) {
      const row = document.createElement('div');
      row.className = ['nearby-row', kind + '-row', 'nearby-summary'].join(' ');
      appendCell(row, text, 'muted');
      return row;
    }
    function renderNearbyCoins(status) {
      const node = document.getElementById('nearbyCoins');
      if (!node) return;
      const items = Array.isArray(status.nearby?.c) ? status.nearby.c : [];
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createNearbyRow('coin', [
        { text: 'ID' },
        { text: '数额' },
        { text: '距离' },
        { text: '选择' }
      ], true));
      if (!items.length) {
        fragment.appendChild(createNearbyRow('coin', [{ text: '无' }, { text: '--' }, { text: '--' }, { text: '--' }]));
      } else {
        for (const item of items) {
          const [id, amount, distanceCm, selected] = item;
          fragment.appendChild(createNearbyRow('coin', [
            { text: id },
            { text: integer(amount), className: 'coin' },
            { text: distance(distanceCm), className: 'distance-badge ' + nearbyDistanceClass(status, distanceCm) },
            { text: selectedText(Boolean(selected)), className: selected ? 'selected-mark' : 'muted' }
          ]));
        }
      }
      node.replaceChildren(fragment);
    }
    function isLowValueAfkNearbyPlayer(item) {
      const drop = number(item?.[3]);
      const mode = String(item?.[7] || '').trim().toLowerCase();
      return drop !== null && drop < 3 && mode && mode !== 'active';
    }
    function renderNearbyPlayers(status) {
      const node = document.getElementById('nearbyPlayers');
      if (!node) return;
      const items = Array.isArray(status.nearby?.p) ? status.nearby.p : [];
      const visibleItems = items.filter(item => !isLowValueAfkNearbyPlayer(item));
      const hiddenLowAfkCount = items.length - visibleItems.length;
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createNearbyRow('player', [
        { text: '名称' },
        { text: '血量' },
        { text: '体力' },
        { text: 'Drop' },
        { text: '无敌' },
        { text: '距离' },
        { text: '选择' }
      ], true));
      if (!visibleItems.length && hiddenLowAfkCount === 0) {
        fragment.appendChild(createNearbyRow('player', [
          { text: '无' },
          { text: '--' },
          { text: '--' },
          { text: '--' },
          { text: '--' },
          { text: '--' },
          { text: '--' }
        ]));
      } else {
        for (const item of visibleItems) {
          const [name, hp, staminaMs, drop, invMs, distanceCm, selected] = item;
          fragment.appendChild(createNearbyRow('player', [
            { text: name },
            { text: integer(hp), className: hpAttrs(hp).className },
            { text: unit(staminaMs) },
            { text: integer(drop), className: 'coin' },
            { text: invulnerableText(invMs), className: invMs ? 'warn' : 'muted' },
            { text: distance(distanceCm), className: 'distance-badge ' + nearbyDistanceClass(status, distanceCm) },
            { text: selectedText(Boolean(selected)), className: selected ? 'selected-mark' : 'muted' }
          ]));
        }
      }
      if (hiddenLowAfkCount > 0) {
        fragment.appendChild(createNearbySummaryRow('player', '另有 ' + hiddenLowAfkCount + ' 个低收益挂机玩家，详情略'));
      }
      node.replaceChildren(fragment);
    }
    function updateNearbyPanels(status) {
      const panel = document.getElementById('nearbyGrid');
      if (!panel) return;
      const show = Boolean(status.game?.inGame);
      panel.hidden = !show;
      if (!show) {
        document.getElementById('nearbyCoins')?.replaceChildren();
        document.getElementById('nearbyPlayers')?.replaceChildren();
        return;
      }
      renderNearbyCoins(status);
      renderNearbyPlayers(status);
    }
    function targetStateText(target) {
      if (!target) return '--';
      return joinNonBlank([
        target.active === null || target.active === undefined ? '--' : '危险 ' + bool(target.active),
        target.moving === null || target.moving === undefined ? '--' : '移动 ' + bool(target.moving),
        target.firing === null || target.firing === undefined ? '--' : '开火 ' + bool(target.firing)
      ]);
    }
    function actionReasonText(status) {
      return reasonText(status.action?.reason || status.decision?.reason || status.recentExit?.reason);
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
      const reason = action.reason || decision.reason || status.recentExit?.reason || '';
      const target = activeTarget(status);
      const currentSession = status.stats?.currentSession || {};
      const offlineStats = status.stats?.offline || {};
      const online = Boolean(status.game?.inGame && currentSession.online);
      const rowsOut = [];

      addRow(rowsOut, '状态', actionText(status), true);
      addRow(rowsOut, '原因', reasonText(reason), true);
      const decisionText = joinNonBlank([kindText(kind), actionReasonText(status)]);
      const statusText = actionText(status);
      const reasonDisplay = reasonText(reason);
      if (decisionText !== '--'
        && decisionText !== statusText
        && decisionText !== reasonDisplay
        && decisionText !== joinNonBlank([statusText, reasonDisplay])) {
        addRow(rowsOut, '判断', decisionText);
      }
      addRow(rowsOut, '目标', targetLabel(target));
      addRow(rowsOut, '来源', sourceText(target?.authority));
      addRow(rowsOut, '目标状态', targetStateText(target));
      if (online) addRow(rowsOut, '数据缺口', dataGapsText(decision));

      if (isCombatStatus(status, kind, reason)) {
        addRow(rowsOut, '战斗目标', targetLabel(status.combat?.target));
        addRow(rowsOut, '战斗退出', reasonText(status.combat?.exit?.reason));
      }

      if (!online && isSafetyStatus(status, kind, reason)) {
        const loginDisplay = loginPointDisplay(status);
        addRow(rowsOut, '登录点', loginPointText(status), false, loginPointAttrs(status));
        addRow(rowsOut, '登录点坐标', pointCoordText(status.loginPointSafety?.point));
        addRow(rowsOut, '不安全原因', unsafeReasonText(status));
        addRow(rowsOut, '附近危险', loginDisplay.state === 'safe' ? '--' : targetLabel(status.loginPointSafety?.detail?.nearestActive));
        addRow(rowsOut, '保持离线', offlineBlockerText(status), false, status.stats?.offline?.blocker ? classAttrs('warn') : null);
        addRow(rowsOut, '检查时间', fullStamp(status.loginPointSafety?.checkedAt || status.loginPointSafety?.detail?.checkedAt));
      }

      if (!online) {
        addRow(rowsOut, '退出时间', fullStamp(offlineStats.lastExitAt));
        addRow(rowsOut, '下次重连', fullStamp(offlineStats.nextReconnectAt));
        addRow(rowsOut, '剩余时间', countdownUntil(offlineStats.nextReconnectAt), false, { countdownAt: offlineStats.nextReconnectAt });
      }

      return rowsOut;
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
      setText('stamp', '网页版本更新，正在刷新');
      setTimeout(() => location.replace(next.toString()), 50);
      return true;
    }
    async function fetchStatus() {
      const url = '/api/panel-status' + (token ? '?token=' + encodeURIComponent(token) : '');
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
        throw new Error(data?.error || data?.reason || ('HTTP ' + res.status));
      }
      return data || { ok: true };
    }
    async function refresh() {
      const s = await fetchStatus();
      if (maybeReloadForWebVersion(s)) return;
      updateAuthPanel(s);
      const authNeeds = Boolean(s.auth?.needsReauth);
      const statusClass = authNeeds ? authClass(s) : (s.runner?.lastError ? 'bad' : (s.runner?.running ? 'ok' : 'info'));
      setText('stamp', fullStamp(s.updatedAt));
      setClass('stamp', statusClass);
      setText('sourceIpCount', sourceIpCountText(s.network));
      setText('sourceIp', s.network?.sourceIp);

      rows('actionDetails', actionDetailRows(s));
      updateNearbyPanels(s);
      const roleSelf = s.game?.inGame ? s.self : (s.lastKnown?.self || s.self);
      const roleStamina = s.game?.inGame ? s.stamina : (s.lastKnown?.stamina || s.stamina);
      const offlineRole = !s.game?.inGame && Boolean(s.lastKnown);
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
        [offlineRole ? '上次血量' : '血量', hpText(roleSelf?.hp), hpAttrs(roleSelf?.hp)],
        [offlineRole ? '上次Drop' : 'Drop', roleSelf?.drop, classAttrs('coin')],
        [offlineRole ? '上次体力5s' : '体力5s', staminaPair(roleStamina?.remaining5s, 10)],
        [offlineRole ? '上次体力1h' : '体力1h', staminaPair(roleStamina?.remaining1h, 3000), staminaAttrs(roleStamina?.remaining1h, 3000)],
        [offlineRole ? '上次体力1d' : '体力1d', staminaPair(roleStamina?.remaining1d, 20000), staminaAttrs(roleStamina?.remaining1d, 20000)]
      ]);
      const currentSession = s.stats?.currentSession || {};
      const todayStats = s.stats?.today || {};
      const online = Boolean(s.game?.inGame && currentSession.online);
      setText('sessionPanelTitle', online ? '本次游戏' : '上次游戏');
      rows('currentSession', [
        ['进入时间', fullStamp(currentSession.enteredAt), true],
        ['持续时间', duration(currentSession.durationMs)],
        ['消耗体力', unit(currentSession.staminaSpentMs)],
        ['拾取金币', integer(currentSession.coinsGained)],
        ['击杀敌人', integer(currentSession.kills)]
      ]);
      rows('todayStats', [
        ['日期', todayStats.day],
        ['游戏时长', duration(todayStats.inGameDurationMs)],
        ['消耗体力', unit(todayStats.staminaSpentMs)],
        ['拾取金币', integer(todayStats.coinsGained)],
        ['击杀敌人', integer(todayStats.kills)]
      ]);
      updateCountdownNodes();
    }
    function updateCountdownNodes() {
      document.querySelectorAll('[data-countdown-at]').forEach(node => {
        setValueText(node, countdownUntil(node.dataset.countdownAt || ''));
      });
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
          if (showFailure) showError(err);
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
      setText('stamp', '已暂停刷新');
      setClass('stamp', 'muted');
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
      const match = /HTTP\s+(\d+)/i.exec(message);
      setText('stamp', match ? '请求失败：' + match[1] : '请求失败');
      setClass('stamp', 'bad');
      setAuthMessage(message || '请求失败', 'bad');
    }
    document.addEventListener('visibilitychange', syncAutoRefreshForVisibility);
    window.addEventListener('pageshow', syncAutoRefreshForVisibility);
    window.addEventListener('pagehide', stopAutoRefresh);
    syncAutoRefreshForVisibility();
  </script>
</body>
</html>`;
}

module.exports = {
  BROWSERLESS_WEB_PANEL_VERSION,
  renderBrowserlessWebPanel
};
