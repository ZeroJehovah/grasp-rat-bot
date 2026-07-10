'use strict';

// Bump only when this browserless web page or its frontend assets change.
const BROWSERLESS_WEB_PANEL_VERSION = '2026.07.10.7';

function renderBrowserlessWebPanel() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>抓鼠助手</title>
  <style>
    :root{color-scheme:dark;--bg:#101214;--panel:#181b1f;--panel2:#121518;--line:#30363d;--text:#eef2f5;--muted:#9ba7b4;--green:#4ade80;--amber:#fbbf24;--red:#fb7185;--blue:#60a5fa}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
    main{max-width:980px;margin:0 auto;padding:14px}
    header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    h1{margin:0;font-size:18px;line-height:1.2;font-weight:680;letter-spacing:0}
    button{font:inherit;min-height:32px;border:1px solid var(--line);background:#20252a;color:var(--text);border-radius:6px;padding:5px 10px;cursor:pointer}
    button:hover{border-color:#58616b}
    .toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
    .pill{display:inline-flex;align-items:center;min-height:28px;border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:var(--panel2);color:var(--muted);white-space:nowrap}
    .ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.info{color:var(--blue)}.muted{color:var(--muted)}
    .hero{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:12px;margin-bottom:10px}
    .botline{font-size:18px;line-height:1.25;font-weight:720;margin-bottom:4px;overflow-wrap:anywhere}
    .reason{color:var(--muted);overflow-wrap:anywhere}
    .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px}
    .metric{border:1px solid var(--line);background:var(--panel2);border-radius:6px;padding:8px;min-width:0}
    .label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
    .value{display:block;font-size:14px;min-height:20px;overflow-wrap:anywhere}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    section{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:10px;min-width:0}
    section.wide{grid-column:span 2}
    h2{font-size:11px;line-height:1.2;margin:0 0 8px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    dl{display:grid;grid-template-columns:minmax(76px,auto) 1fr;gap:5px 9px;margin:0}
    dt{color:var(--muted);min-width:0}
    dd{margin:0;min-width:0;overflow-wrap:anywhere}
    .auth-panel{margin-bottom:10px}
    .auth-panel[hidden]{display:none}
    .auth-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
    .auth-prompt{color:var(--muted);overflow-wrap:anywhere}
    .auth-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
    a{color:var(--blue);text-decoration:none;overflow-wrap:anywhere}
    a:hover{text-decoration:underline}
    textarea{width:100%;min-height:76px;margin-top:8px;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--text);font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:8px;resize:vertical}
    pre.auth-url{display:none;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--muted);padding:8px;max-height:120px;overflow:auto}
    .auth-message{min-height:18px;overflow-wrap:anywhere}
    @media (max-width:780px){.grid{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:1fr 1fr}section.wide{grid-column:auto}}
    @media (max-width:520px){main{padding:10px}header{align-items:flex-start;flex-direction:column}.toolbar{justify-content:flex-start}.grid,.metrics{grid-template-columns:1fr}.botline{font-size:16px}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>抓鼠助手</h1>
      <div class="toolbar">
        <span id="webVersion" class="pill">网页 ${BROWSERLESS_WEB_PANEL_VERSION}</span>
        <span id="stamp" class="pill">--</span>
        <button id="refreshBtn" type="button" title="刷新状态">刷新</button>
        <button id="stopBtn" type="button" title="停止自动运行">停止</button>
      </div>
    </header>

    <section class="hero">
      <div id="botLine" class="botline">助手 --</div>
      <div id="reason" class="reason">--</div>
      <div class="metrics">
        <div class="metric"><span class="label">血量</span><span id="hp" class="value">--</span></div>
        <div class="metric"><span class="label">体力</span><span id="stamina" class="value">--</span></div>
        <div class="metric"><span class="label">Drop</span><span id="drop" class="value">--</span></div>
        <div class="metric"><span class="label">位置</span><span id="position" class="value">--</span></div>
        <div class="metric"><span class="label">运行方式</span><span id="mode" class="value">--</span></div>
      </div>
    </section>

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

    <div class="grid">
      <section class="wide">
        <h2>当前动作</h2>
        <dl id="actionDetails"></dl>
      </section>
      <section>
        <h2>账号状态</h2>
        <dl id="session"></dl>
      </section>
      <section>
        <h2>本次游戏</h2>
        <dl id="currentSession"></dl>
      </section>
      <section>
        <h2>今日累计</h2>
        <dl id="todayStats"></dl>
      </section>
      <section class="wide">
        <h2>上次运行</h2>
        <dl id="lastRun"></dl>
      </section>
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
    const stamp = iso => {
      if (!iso) return '--';
      const date = new Date(iso);
      return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour12: false }) : iso;
    };
    const fullStamp = iso => {
      if (!iso) return '--';
      const date = new Date(iso);
      return Number.isFinite(date.getTime())
        ? date.toLocaleString('zh-CN', { hour12: false })
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
    const integer = v => {
      const n = number(v);
      return n === null ? '--' : String(Math.max(0, Math.round(n)));
    };
    function rows(id, pairs) {
      const node = document.getElementById(id);
      node.textContent = '';
      for (const pair of pairs) {
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = pair[0];
        dd.textContent = value(pair[1]);
        node.append(dt, dd);
      }
    }
    function targetLabel(target) {
      if (!target) return '--';
      const name = target.name || (target.userId ? '#' + target.userId : (target.id ? '#' + target.id : '目标'));
      const parts = [name];
      if (target.distance !== null && target.distance !== undefined) parts.push('距离 ' + distance(target.distance));
      if (target.hp !== null && target.hp !== undefined) parts.push('血量 ' + target.hp);
      if (target.drop !== null && target.drop !== undefined) parts.push('掉落 ' + target.drop);
      if (target.amount !== null && target.amount !== undefined) parts.push('金币 ' + target.amount);
      return parts.join(' / ');
    }
    function pointText(point) {
      if (!point || (number(point.x) === null && number(point.y) === null)) return '--';
      const parts = ['(' + coord(point.x) + ', ' + coord(point.y) + ')'];
      if (point.hp !== null && point.hp !== undefined) parts.push('血量 ' + point.hp);
      if (point.source) parts.push(sourceText(point.source) === '--' ? String(point.source) : sourceText(point.source));
      return parts.join(' / ');
    }
    function positionText(status) {
      if (status.game?.inGame) return pointText(status.self);
      return pointText(status.loginPointSafety?.point);
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
      'missing-manual-session': '等待登录信息',
      'missing-login-point': '缺少登录点坐标',
      'missing-snapshot-tick': '快照缺少时间戳',
      'stale-snapshot-tick': '快照过期',
      'no-prior-tick': '没有历史时间戳',
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
    function resultText(ok) {
      if (ok === null || ok === undefined) return '--';
      return ok ? '正常' : '异常';
    }
    function authStatusText(status) {
      const auth = status.auth || {};
      if (auth.state === 'invalid' || auth.invalid) return '登录信息失效';
      if (auth.state === 'missing' || auth.missing) return '等待授权';
      if (auth.authenticated || status.session?.authenticated) return '授权可用';
      if (status.session?.tokenPresent) return '登录信息不完整';
      return '等待授权';
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
      link.href = value || '#';
      link.textContent = value ? '打开授权页' : '';
      pre.textContent = value;
      pre.style.display = value ? 'block' : 'none';
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
        message.className = 'auth-message muted';
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
    function loginPointText(status) {
      if (status.game?.inGame) return '已在游戏中';
      if (status.loginPointSafety?.ok) return '安全';
      const reason = String(status.loginPointSafety?.reason || '');
      if (/pending|retry|snapshot|check/i.test(reason)) return '检查中';
      if (/unsafe|active|threat|danger/i.test(reason)) return '不安全';
      return '未确认';
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
      if (status.game?.inGame || status.loginPointSafety?.ok) return '--';
      const detail = status.loginPointSafety?.detail || {};
      return reasonText(detail.unsafeReason || detail.reason || status.loginPointSafety?.reason);
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
    function addRow(list, label, text, always = false) {
      const normalized = value(text);
      if (always || normalized !== '--') list.push([label, normalized]);
    }
    function joinNonBlank(items, separator = ' / ') {
      const parts = items.map(nonBlankText).filter(Boolean);
      return parts.length ? parts.join(separator) : '--';
    }
    function targetStateText(target) {
      if (!target) return '--';
      return joinNonBlank([
        target.active === null || target.active === undefined ? '--' : '危险 ' + bool(target.active),
        target.moving === null || target.moving === undefined ? '--' : '移动 ' + bool(target.moving),
        target.firing === null || target.firing === undefined ? '--' : '开火 ' + bool(target.firing)
      ]);
    }
    function movementDirectionText(action) {
      const command = action?.movement?.command || {};
      if (command.dx === null && command.dy === null && command.dx === undefined && command.dy === undefined) return '--';
      return [command.dx, command.dy].map(value).join(', ');
    }
    function actionReasonText(status) {
      return reasonText(status.action?.reason || status.decision?.reason || status.recentExit?.reason);
    }
    function isProfitStatus(status, kind, reason) {
      const text = (kind + ' ' + reason).toLowerCase();
      return /coin|profit|drop|post-attack/.test(text);
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
      addRow(rowsOut, '判断', joinNonBlank([kindText(kind), actionReasonText(status)]));
      addRow(rowsOut, '目标', targetLabel(target));
      addRow(rowsOut, '来源', sourceText(target?.authority));
      addRow(rowsOut, '目标状态', targetStateText(target));
      addRow(rowsOut, '数据缺口', decision.dataGapCount ? decision.dataGaps?.join(' / ') || decision.dataGapCount : '--');

      if (isProfitStatus(status, kind, reason)) {
        addRow(rowsOut, '金币目标', targetLabel(status.profit?.best?.target));
        addRow(rowsOut, '金币原因', reasonText(status.profit?.best?.reason));
        addRow(rowsOut, '金币评分', status.profit?.best?.score);
        addRow(rowsOut, '金币消耗', unit(status.profit?.best?.staminaCost));
        addRow(rowsOut, '可选金币', status.profit?.candidateCount);
      }

      if (action.movement || ['coin', 'seek-coin', 'profit-candidate', 'velocity', 'flee', 'patrol', 'attack', 'combat-live'].includes(kind)) {
        addRow(rowsOut, '移动原因', reasonText(action.movement?.reason || action.reason));
        addRow(rowsOut, '移动方向', movementDirectionText(action));
        addRow(rowsOut, '移动次数', action.counts?.velocity);
        addRow(rowsOut, '停止次数', action.counts?.stop);
      }

      if (action.shoot || status.combat?.shooting || ['attack', 'combat-live'].includes(kind)) {
        addRow(rowsOut, '能开火', bool(action.shoot?.ok ?? status.combat?.shooting?.wouldShoot));
        addRow(rowsOut, '已跳过', bool(action.shoot?.skipped));
        addRow(rowsOut, '开火原因', reasonText(action.shoot?.reason || status.combat?.shooting?.reason));
        addRow(rowsOut, '开火次数', action.counts?.shoot);
        addRow(rowsOut, '连发次数', action.counts?.shootRepeat);
        addRow(rowsOut, '开火回执', action.lastShootAck ? resultText(action.lastShootAck.ok) + ' / ' + stamp(action.lastShootAck.at) : '--');
      }

      if (isCombatStatus(status, kind, reason)) {
        addRow(rowsOut, '战斗目标', targetLabel(status.combat?.target));
        addRow(rowsOut, '战斗移动', reasonText(status.combat?.movement?.reason));
        addRow(rowsOut, '战斗开火', status.combat?.shooting ? (bool(status.combat.shooting.wouldShoot) + ' / ' + reasonText(status.combat.shooting.reason)) : '--');
        addRow(rowsOut, '战斗退出', reasonText(status.combat?.exit?.reason));
        addRow(rowsOut, '战斗候选', status.combat?.candidateCount);
      }

      if (isSafetyStatus(status, kind, reason)) {
        addRow(rowsOut, '登录点', loginPointText(status));
        addRow(rowsOut, '登录点坐标', status.game?.inGame ? '--' : pointText(status.loginPointSafety?.point));
        addRow(rowsOut, '登录点原因', status.game?.inGame ? '当前已连入游戏' : reasonText(status.loginPointSafety?.reason));
        addRow(rowsOut, '不安全原因', unsafeReasonText(status));
        addRow(rowsOut, '检查详情', status.game?.inGame ? '--' : loginPointDetailText(status));
        addRow(rowsOut, '快照新鲜度', status.game?.inGame ? '--' : freshnessText(status.loginPointSafety?.detail));
        addRow(rowsOut, '最近危险', status.game?.inGame ? '--' : targetLabel(status.loginPointSafety?.detail?.nearestActive));
        addRow(rowsOut, '最近实体', status.game?.inGame ? '--' : targetLabel(status.loginPointSafety?.detail?.nearest));
        addRow(rowsOut, '检查时间', stamp(status.loginPointSafety?.checkedAt));
        addRow(rowsOut, '最近阻止', reasonText(status.recentBlock?.reason));
        addRow(rowsOut, '最近退出', reasonText(status.recentExit?.reason));
      }

      if (!online) {
        addRow(rowsOut, '退出时间', fullStamp(offlineStats.lastExitAt));
        addRow(rowsOut, '退出原因', reasonText(offlineStats.lastExitReason));
        addRow(rowsOut, '下次重连', fullStamp(offlineStats.nextReconnectAt));
        addRow(rowsOut, '剩余时间', duration(offlineStats.reconnectRemainingMs));
      }

      return rowsOut;
    }
    function setText(id, text) {
      document.getElementById(id).textContent = value(text);
    }
    function setClass(id, className) {
      document.getElementById(id).className = className;
    }
    function updateWebVersion(latestVersion) {
      const latest = String(latestVersion || '').trim();
      const current = String(WEB_PANEL_VERSION || '').trim();
      const node = document.getElementById('webVersion');
      if (!node) return;
      if (latest && current && latest !== current) {
        node.textContent = '网页 ' + current + ' -> ' + latest;
        node.className = 'pill warn';
        return;
      }
      node.textContent = '网页 ' + (latest || current || '--');
      node.className = 'pill';
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
      setText('botLine', '网页版本更新，正在刷新');
      setText('reason', '正在拉取最新网页 ' + latest);
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
      const reason = authNeeds ? authPromptText(s) : reasonText(s.runner?.lastError || s.action?.reason || s.decision?.reason || s.recentExit?.reason);
      document.getElementById('stamp').textContent = stamp(s.updatedAt);
      setClass('stamp', 'pill ' + statusClass);
      setText('botLine', '助手：' + (authNeeds ? authStatusText(s) : actionText(s)));
      setText('reason', reason);
      setText('hp', s.self?.hp);
      setText('stamina', '5秒 ' + unit(s.stamina?.remaining5s) + ' / 1小时 ' + unit(s.stamina?.remaining1h) + ' / 1天 ' + unit(s.stamina?.remaining1d));
      setText('drop', s.self?.drop);
      setText('position', positionText(s));
      setText('mode', modeText(s.runner?.controlMode || s.runner?.mode, s.runner?.combatEnabled));

      rows('actionDetails', actionDetailRows(s));
      rows('session', [
        ['账号', s.session?.userId],
        ['授权', authStatusText(s)],
        ['已登录', bool(s.session?.authenticated)],
        ['游戏内', bool(s.game?.inGame)],
        ['当前位置', s.game?.inGame ? pointText(s.self) : '--'],
        ['登录信息', s.session?.tokenPresent ? '已有' : '缺失'],
        ['更新时间', stamp(s.auth?.tokenUpdatedAt || s.session?.tokenUpdatedAt)],
        ['出口数量', s.network?.sourceIpCount],
        ['当前出口', s.network?.sourceIp]
      ]);
      const currentSession = s.stats?.currentSession || {};
      const todayStats = s.stats?.today || {};
      const online = Boolean(s.game?.inGame && currentSession.online);
      rows('currentSession', [
        ['状态', online ? '在线' : '不在线'],
        ['进入时间', online ? fullStamp(currentSession.enteredAt) : '--'],
        ['持续时间', online ? duration(currentSession.durationMs) : '--'],
        ['消耗体力', online ? unit(currentSession.staminaSpentMs) : '--'],
        ['拾取金币', online ? integer(currentSession.coinsGained) : '--'],
        ['击杀敌人', online ? integer(currentSession.kills) : '--']
      ]);
      rows('todayStats', [
        ['日期', todayStats.day],
        ['游戏时长', duration(todayStats.inGameDurationMs)],
        ['消耗体力', unit(todayStats.staminaSpentMs)],
        ['拾取金币', integer(todayStats.coinsGained)],
        ['击杀敌人', integer(todayStats.kills)]
      ]);
      rows('lastRun', [
        ['结果', resultText(s.runner?.lastRun?.ok)],
        ['原因', reasonText(s.runner?.lastRun?.reason || s.runner?.lastRun?.error)],
        ['收到画面', s.runner?.lastRun?.frames],
        ['判断次数', s.runner?.lastRun?.decisions],
        ['动作次数', s.runner?.lastRun?.actions],
        ['结束时间', stamp(s.runner?.lastRun?.completedAt)]
      ]);
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
    }
    function stopAutoRefresh() {
      if (!autoRefreshTimer) return;
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = 0;
    }
    function syncAutoRefreshForVisibility() {
      if (isPageVisibleForRefresh()) {
        startAutoRefresh();
        requestStatusRefresh(true);
        return;
      }
      stopAutoRefresh();
      document.getElementById('stamp').textContent = '已暂停刷新';
      document.getElementById('stamp').className = 'pill muted';
    }
    document.getElementById('refreshBtn').onclick = () => requestStatusRefresh(true, true);
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
    document.getElementById('stopBtn').onclick = () => (async () => {
      await api('/api/stop', { method: 'POST' });
      await requestStatusRefresh(true, true);
    })().catch(showError);
    function setAuthMessage(text, className) {
      const node = document.getElementById('authMessage');
      if (!node) return;
      node.textContent = value(text);
      node.className = 'auth-message ' + (className || 'muted');
    }
    function showError(err) {
      const message = String(err?.message || '');
      const match = /HTTP\s+(\d+)/i.exec(message);
      document.getElementById('stamp').textContent = match ? '请求失败：' + match[1] : '请求失败';
      document.getElementById('stamp').className = 'pill bad';
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
