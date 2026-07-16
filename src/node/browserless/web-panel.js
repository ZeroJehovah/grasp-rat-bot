'use strict';

// Bump only when this browserless web page or its frontend assets change.
const BROWSERLESS_WEB_PANEL_VERSION = '2026.07.16.2';
const BROWSERLESS_WEB_PANEL_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23060b16'/%3E%3Ccircle cx='32' cy='32' r='23' fill='none' stroke='%2338bdf8' stroke-width='4' stroke-opacity='.55'/%3E%3Cpath d='M32 9v46M9 32h46' stroke='%2394a3b8' stroke-width='3' stroke-opacity='.45'/%3E%3Ccircle cx='32' cy='32' r='7' fill='%2334d399'/%3E%3Ccircle cx='46' cy='20' r='4' fill='%2338bdf8'/%3E%3Ccircle cx='19' cy='43' r='4' fill='%23fb7185'/%3E%3Cpath d='M32 32l14-12' stroke='%2338bdf8' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E";

function panelSessionFlagsCore(status = {}) {
  const online = Boolean(status?.stats?.currentSession?.online);
  return {
    online,
    realtimeOnline: Boolean(status?.game?.inGame && online)
  };
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
    grouped.push({ type: 'other-kill-group', messages: source.slice(index, end) });
    index = end;
  }
  return grouped;
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
    .ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.info{color:var(--blue)}.coin{color:var(--coin)}.muted{color:var(--muted)}
    .value-with-dot{display:inline-flex;align-items:center;gap:6px}
    .field-value-text{min-width:0;overflow-wrap:anywhere}
    .status-dot{width:8px;height:8px;border-radius:999px;flex:0 0 auto;background:currentColor;box-shadow:0 0 0 1px rgba(255,255,255,.12)}
    .status-dot.breathe{animation:status-breathe 1.6s ease-in-out infinite}
    @keyframes status-breathe{0%,100%{opacity:.62;transform:scale(.82);box-shadow:0 0 0 0 rgba(255,255,255,.18)}50%{opacity:1;transform:scale(1);box-shadow:0 0 0 6px rgba(255,255,255,0)}}
    .layout{display:grid;grid-template-columns:minmax(240px,1fr) minmax(0,2fr);gap:10px;align-items:start}
    .stack{display:flex;flex-direction:column;gap:10px;min-width:0}
    .stats-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
    .battle-panel[hidden]{display:none}
    .battle-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px;padding:7px 9px;border:1px solid var(--line);border-radius:7px;background:var(--panel2);text-align:center;font-variant-numeric:tabular-nums}
    .battle-meta span{min-width:0;color:var(--muted)}
    .battle-meta strong{display:block;margin-top:2px;color:var(--text);font-size:14px;font-weight:700;overflow-wrap:anywhere}
    .battle-fighters{display:grid;grid-template-columns:minmax(0,1fr) minmax(54px,.18fr) minmax(0,1fr);gap:10px;align-items:stretch}
    .fighter{min-width:0;border:1px solid var(--line);border-radius:8px;background:var(--panel2);padding:9px}
    .fighter-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:7px}
    .fighter-side{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.04em}
    .fighter-name{min-width:0;font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fighter.enemy .fighter-head{flex-direction:row-reverse}
    .fighter.enemy dl{direction:rtl}
    .fighter.enemy dt,.fighter.enemy dd{direction:ltr}
    .fighter.enemy dt{text-align:right}.fighter.enemy dd{text-align:left}
    .fighter-vs{display:flex;align-items:center;justify-content:center;color:var(--red);font-size:16px;font-weight:800;letter-spacing:.08em}
    .hp-label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;color:var(--muted);font-variant-numeric:tabular-nums}
    .fighter.enemy .hp-label{flex-direction:row-reverse}
    .hp-track{height:9px;margin-bottom:8px;overflow:hidden;border-radius:999px;background:#2a3036;box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
    .hp-fill{height:100%;width:0;border-radius:inherit;background:var(--green);transition:width .25s ease,background-color .25s ease}
    .fighter.enemy .hp-fill{margin-left:auto}
    .hp-fill.warn{background:var(--amber)}.hp-fill.bad{background:var(--red)}.hp-fill.ok{background:var(--green)}
    section{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:10px;min-width:0}
    h2{font-size:11px;line-height:1.2;margin:0 0 8px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    h3{font-size:11px;line-height:1.2;margin:0 0 6px;color:var(--muted);font-weight:700;letter-spacing:0}
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
    input{font:inherit}
    pre.auth-url{display:none;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--muted);padding:8px;max-height:120px;overflow:auto}
    .auth-message{min-height:18px;overflow-wrap:anywhere}
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
    .high-drop-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);gap:10px;align-items:center;min-height:26px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .high-drop-row:last-child{border-bottom:0}
    .high-drop-head{color:var(--muted);font-size:11px;font-weight:700}
    .high-drop-cell{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .high-drop-values{color:var(--coin);font-variant-numeric:tabular-nums}
    .player-memory-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
    .player-memory-pane{min-width:0}
    .player-memory-pane+.player-memory-pane{border-left:1px solid var(--line);padding-left:10px}
    .player-memory-list{display:flex;flex-wrap:wrap;gap:7px;min-height:28px;align-items:flex-start}
    .player-memory-name{display:inline-flex;align-items:center;max-width:100%;min-height:28px;padding:4px 9px;border:1px solid var(--line);border-radius:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .player-memory-empty{color:var(--muted);background:var(--panel2)}
    .easy-kill-score-1{color:#86efac;background:rgba(34,197,94,.12);border-color:rgba(74,222,128,.38)}
    .easy-kill-score-2{color:#ecfdf5;background:rgba(22,163,74,.42);border-color:rgba(74,222,128,.78)}
    .easy-kill-score-3{color:#fff;background:#15803d;border-color:#4ade80;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
    .damage-player-name{color:#fecdd3;background:rgba(251,113,133,.14);border-color:rgba(251,113,133,.46)}
    .chat-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
    .chat-head h2{margin:0}.chat-title-meta{display:inline-flex;align-items:center;gap:7px;min-width:0}.chat-refresh-at{font-weight:500;letter-spacing:0;text-transform:none;white-space:nowrap}
    .chat-kill-toggle{min-height:24px;padding:2px 8px;font-size:11px;line-height:1.2}
    .chat-log{height:300px;overflow:auto;scrollbar-gutter:stable}
    .chat-row{display:grid;grid-template-columns:38px minmax(64px,.62fr) minmax(0,1.38fr);gap:6px;align-items:start;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06)}
    .chat-row:last-child{border-bottom:0}.chat-time{color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}.chat-author{min-width:0;color:var(--blue);font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chat-text{min-width:0;overflow-wrap:anywhere;white-space:pre-wrap}
    .chat-row.chat-kill .chat-author,.chat-row.chat-kill .chat-text{color:var(--red)}.chat-row.chat-system .chat-author,.chat-row.chat-system .chat-text{color:var(--blue)}.chat-row.mine .chat-author{color:var(--green)}
    .chat-row.chat-kill-summary .chat-text{font-weight:650}
    .chat-empty{display:flex;height:100%;align-items:center;justify-content:center;color:var(--muted)}
    .chat-compose{display:flex;gap:7px;margin-top:8px}.chat-compose[hidden]{display:none}.chat-compose input{flex:1;min-width:0;min-height:34px;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--text);padding:6px 9px}.chat-compose input:disabled{opacity:.6}.chat-compose button{flex:0 0 auto}
    .chat-hint{margin-top:6px;color:var(--muted);overflow-wrap:anywhere}.chat-hint:empty{display:none}
    .nearby-cell{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .distance-badge{font-variant-numeric:tabular-nums}
    .range-attack{color:var(--green)}
    .range-view{color:var(--blue)}
    .target-current,.target-route-next{position:relative;background:var(--target-bg);background-clip:padding-box;padding:3px 6px;margin:0}
    .target-current::before,.target-route-next::before{content:"";position:absolute;right:100%;top:0;bottom:0;width:3px;background:var(--target-color);pointer-events:none}
    .target-coin{--target-color:rgba(251,191,36,.82);--target-bg:rgba(251,191,36,.13)}
    .target-afk{--target-color:rgba(74,222,128,.8);--target-bg:rgba(74,222,128,.12)}
    .target-combat{--target-color:rgba(251,113,133,.82);--target-bg:rgba(251,113,133,.12)}
    .target-flee{--target-color:rgba(96,165,250,.82);--target-bg:rgba(96,165,250,.12)}
    .target-route-next.target-coin{--target-color:rgba(251,191,36,.45);--target-bg:rgba(251,191,36,.07)}
    .target-bait{--target-color:rgba(251,191,36,.95);--target-bg:rgba(251,191,36,.16)}
    .target-name{display:inline-flex;align-items:center;min-width:0;vertical-align:middle}
    .target-name-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .target-icon{display:inline-block;width:16px;height:16px;flex:0 0 16px;align-self:center;margin-right:5px;overflow:visible;vertical-align:middle;transform:translateY(1px);color:var(--target-color);fill:currentColor}
    .target-icon-coin{transform:translateY(0)}
    @media (max-width:760px){.layout{grid-template-columns:1fr}.stats-grid{grid-template-columns:1fr}}
    @media (max-width:600px){.nearby-combined,.player-memory-grid{grid-template-columns:1fr}.nearby-players-pane,.player-memory-pane+.player-memory-pane{border-left:0;border-top:1px solid var(--line);padding-left:0;padding-top:10px}}
    @media (max-width:520px){.player-row{grid-template-columns:minmax(112px,2fr) minmax(34px,.5fr) minmax(38px,.55fr) minmax(36px,.5fr) minmax(44px,.6fr);gap:4px}.battle-fighters{grid-template-columns:minmax(0,1fr) 32px minmax(0,1fr);gap:5px}.fighter{padding:7px}.fighter-head{display:block}.fighter.enemy .fighter-head{display:block;text-align:right}.battle-meta{gap:4px;padding:6px 4px}.battle-meta strong{font-size:12px}}
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
        <section id="chatPanel">
          <div class="chat-head">
            <h2 class="chat-title-meta"><span>游戏聊天</span><span id="chatRefreshAt" class="chat-refresh-at">--</span></h2>
            <button id="chatKillToggle" class="chat-kill-toggle" type="button" aria-expanded="false">展开</button>
          </div>
          <div id="chatLog" class="chat-log"><div class="chat-empty">等待聊天快照</div></div>
          <form id="chatForm" class="chat-compose" hidden>
            <input id="chatInput" maxlength="240" autocomplete="off" placeholder="输入游戏聊天消息">
            <button id="chatSendBtn" type="submit" disabled>发送</button>
          </form>
          <div id="chatHint" class="chat-hint muted" aria-live="polite"></div>
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
        <section id="battlePanel" class="battle-panel" hidden>
          <h2>战斗情况</h2>
          <div class="battle-meta">
            <span>双方距离<strong id="battleDistance">--</strong></span>
            <span>开始时间<strong id="battleStartedAt">--</strong></span>
            <span>持续时间<strong id="battleDuration">--</strong></span>
          </div>
          <div class="battle-fighters">
            <article class="fighter self">
              <div class="fighter-head"><span class="fighter-side">我方</span><span id="battleSelfName" class="fighter-name">--</span></div>
              <div class="hp-label"><span>血量</span><strong id="battleSelfHp">--</strong></div>
              <div class="hp-track"><div id="battleSelfHpFill" class="hp-fill"></div></div>
              <dl id="battleSelfStats"></dl>
            </article>
            <div class="fighter-vs">VS</div>
            <article class="fighter enemy">
              <div class="fighter-head"><span class="fighter-side" id="battleTargetSide">敌方</span><span id="battleTargetName" class="fighter-name">--</span></div>
              <div class="hp-label"><span>血量</span><strong id="battleTargetHp">--</strong></div>
              <div class="hp-track"><div id="battleTargetHpFill" class="hp-fill"></div></div>
              <dl id="battleTargetStats"></dl>
            </article>
          </div>
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
        <section>
          <h2>今日高收益玩家</h2>
          <div id="highDropPlayers" class="high-drop-list"></div>
        </section>
        <section>
          <h2>玩家记录</h2>
          <div class="player-memory-grid">
            <div class="player-memory-pane">
              <h3>近期击杀缓冲</h3>
              <div id="easyKillPlayers" class="player-memory-list"></div>
            </div>
            <div class="player-memory-pane">
              <h3>今日伤害玩家</h3>
              <div id="dailyDamagePlayers" class="player-memory-list"></div>
            </div>
          </div>
        </section>
        <section id="nearbyGrid" class="nearby-panel" hidden>
          <h2>附近信息</h2>
          <div class="nearby-combined">
            <div class="nearby-pane nearby-coins-pane">
              <h3>附近金币</h3>
              <div id="nearbyCoins" class="nearby-list"></div>
            </div>
            <div class="nearby-pane nearby-players-pane">
              <h3>附近玩家</h3>
              <div id="nearbyPlayers" class="nearby-list"></div>
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
    const WEB_PANEL_RELOAD_KEY = 'graspRatBrowserlessPanelReloadedVersion';
    const CHAT_KILL_COLLAPSE_KEY = 'graspRatBrowserlessChatKillCollapsed';
    const AUTO_REFRESH_MS = 3000;
    let autoRefreshTimer = 0;
    let countdownTimer = 0;
    let refreshInFlight = null;
    let chatSendInFlight = false;
    let latestChatStatus = null;
    let chatKillsCollapsed = readChatKillsCollapsed();

    const groupChatMessagesForDisplay = ${groupChatMessagesForDisplay.toString()};
    const panelSessionFlags = ${panelSessionFlagsCore.toString()};

    const value = v => v === null || v === undefined || v === '' ? '--' : String(v);
    const number = v => v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
    const unit = v => {
      const n = number(v);
      return n === null ? '--' : String(Math.floor(n / 1000));
    };
    const spentStaminaUnit = v => {
      const n = number(v);
      return n === null ? '--' : String(Math.ceil(n / 1000));
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
    function combatExitHpText(status) {
      const exit = status.recentExit || status.combat?.exit || {};
      const selfHp = number(exit.selfHp);
      const targetHp = number(exit.targetHp);
      if (selfHp === null && targetHp === null) return '--';
      const parts = [];
      if (selfHp !== null) parts.push('我方 ' + selfHp);
      if (targetHp !== null) parts.push('敌方 ' + targetHp);
      const hpGap = number(exit.hpGap);
      if (hpGap !== null) parts.push('血差 ' + hpGap);
      return parts.join(' / ');
    }
    function recentBattle(status) {
      return status.recentExit?.battle || null;
    }
    function recentBattleOutcomeText(status) {
      const battle = recentBattle(status);
      if (!battle) return '--';
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
        if (end !== null) return label + ' ' + end;
        return '';
      };
      return joinNonBlank([
        sideText('我方', battle.selfHpStart, battle.selfHpEnd),
        sideText(targetName, battle.targetHpStart, battle.targetHpEnd)
      ]);
    }
    function recentBattleDamageText(status) {
      const battle = recentBattle(status);
      if (!battle) return '--';
      const selfDamage = number(battle.selfDamage);
      const targetDamage = number(battle.targetDamage);
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
        targetHealing === null || targetHealing <= 0 ? '' : (battle.target?.name || '敌方') + '恢复 ' + targetHealing
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
        shotText,
        hits === null ? '' : hits + ' 中',
        hitRate === null ? '' : '确认命中率 ' + hitRate + '%'
      ]);
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
      'post-kill-drop-priority': '优先捡刚击杀目标的掉币',
      'post-kill-loot-safe-dodge': '安全闪避并接近大额掉币',
      'near-coin-priority': '优先捡近处金币',
      'foot-coin-priority': '先捡脚边金币',
      'single-coin-bait-hold': '当日时间充裕，动态收益门槛生效，守着 1 金币等待捡币脚本',
      'single-coin-bait-return': '返回 1 金币诱饵附近',
      'single-coin-bait-release': '发现新收益，先捡掉 1 金币诱饵',
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
      'combat-action-settlement-stalled': '战斗中移动指令失效，为避免原地承伤，主动退出',
      'injury-leave': '角色受伤后为避免继续掉血，主动退出',
      'pursuit-leave': '被危险玩家持续追击，主动退出',
      'profit-live-snapshot-active-threat': '附近玩家有活动威胁证据，退出',
      'recovery-low-hp-active-threat-leave': '恢复时活动玩家进入攻击射程外的血量安全预警区，主动退出',
      'stamina-budget-coin-leave': '体力不足，退出等待恢复',
      'stamina-exhausted-leave': '体力耗尽，退出等待恢复',
      'dynamic-profit-threshold-wait': '当日时间充裕，动态收益门槛生效，等待更高收益目标',
      'wait-for-full-stamina-and-hp': '等待血量和体力恢复',
      'move-to-target': '向目标移动',
      'no-opportunistic-shot': '没有顺手开火目标',
      'missing-target': '没有目标',
      'no-target': '没有目标',
      'manual-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'learned-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'imported-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'next-login-point-pending-snapshot-safety': '等待下一轮登录点安全检查',
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
      'confirmed-leave-snapshot-quarantine': '已确认退出，等待快照刷新',
      'stale-confirmed-leave-snapshot-tick': '已确认退出，等待更新后的快照',
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
    function dangerousPlayerExitReasonText(status, reason) {
      const raw = String(reason || '');
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
    function loginPointDisplay(status) {
      if (status.game?.inGame) return { state: 'none', text: '--' };
      const detail = status.loginPointSafety?.detail || {};
      const reason = String(status.loginPointSafety?.reason || '');
      const detailReason = String(detail.reason || '');
      const originalReason = String(detail.originalReason || '');
      const reasonText = [reason, detailReason, originalReason].join(' ');
      if (/confirmed-leave-snapshot-quarantine|stale-confirmed-leave-snapshot-tick/i.test(reasonText)) {
        return { state: 'pending', text: '等待退出后的快照刷新' };
      }
      if (/self-present-reentry/i.test(reasonText) || (detail.selfPresent === true && detail.bypassedPreLoginSafety)) {
        return { state: 'reentry', text: '检测到角色仍在线，正在恢复实时连接（不会新登录）' };
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
        return { state: 'safe', text: '安全 ' + loginPointProgressText(status, true) };
      }
      if (/pending-snapshot-safety/i.test(reasonText)) {
        return { state: 'pending', text: '待检查 ' + loginPointProgressText(status, false) };
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
      if (status.game?.inGame || loginPointDisplay(status).state !== 'unsafe') return '--';
      const detail = status.loginPointSafety?.detail || {};
      const raw = detail.unsafeReason || detail.reason || status.loginPointSafety?.reason;
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
    function renderNearbyCoins(status) {
      const node = document.getElementById('nearbyCoins');
      if (!node) return;
      const items = Array.isArray(status.nearby?.c) ? status.nearby.c : [];
      const hiddenLowCoinCount = Math.max(0, Number(status.nearby?.coinLowHiddenCount || 0) || 0);
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
          const rowClass = [
            selected ? 'target-current target-coin' : (routeNext ? 'target-route-next target-coin' : ''),
            baitCoin ? 'target-bait' : ''
          ].filter(Boolean).join(' ');
          const icon = baitCoin
            ? 'coinBait'
            : (selected
                ? (hasMultipleRouteTargets ? 'coin1' : 'coinSingle')
                : (routeNext ? 'coin' + Math.min(9, Math.max(2, Math.round(routeIndex))) : ''));
          fragment.appendChild(createNearbyRow('coin', [
            { text: id, icon },
            { text: integer(amount), className: 'coin' },
            { text: distance(distanceCm), className: 'distance-badge ' + nearbyDistanceClass(status, distanceCm) }
          ], false, rowClass));
        }
      }
      if (hiddenLowCoinCount > 0) {
        fragment.appendChild(createNearbySummaryRow('coin', '另有 ' + hiddenLowCoinCount + ' 个低额金币，详情略'));
      }
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
      const items = Array.isArray(status.nearby?.p) ? status.nearby.p : [];
      const hiddenLowAfkCount = Math.max(0, Number(status.nearby?.playerLowHiddenCount || 0) || 0);
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
        for (const item of items) {
          const [name, hp, staminaMs, drop, invMs, distanceCm, selected] = item;
          const hpCell = playerHpCell(hp, invMs);
          const afkTarget = isAfkNearbyPlayer(item);
          const staminaCell = playerStaminaCell(staminaMs, afkTarget, isGreenAfkNearbyPlayer(item));
          const targetType = fleeTarget ? 'flee' : (afkTarget ? 'afk' : 'combat');
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
      if (hiddenLowAfkCount > 0) {
        fragment.appendChild(createNearbySummaryRow('player', '另有 ' + hiddenLowAfkCount + ' 个低收益挂机玩家，详情略'));
      }
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
    function createHighDropRow(name, drops, head = false) {
      const row = document.createElement('div');
      row.className = 'high-drop-row' + (head ? ' high-drop-head' : '');
      const nameCell = document.createElement('div');
      nameCell.className = 'high-drop-cell';
      nameCell.textContent = value(name);
      const dropCell = document.createElement('div');
      dropCell.className = 'high-drop-cell' + (head ? '' : ' high-drop-values');
      dropCell.textContent = value(drops);
      row.append(nameCell, dropCell);
      return row;
    }
    function renderHighDropPlayers(status) {
      const node = document.getElementById('highDropPlayers');
      if (!node) return;
      const items = Array.isArray(status.highDropPlayers?.p) ? status.highDropPlayers.p : [];
      const fragment = document.createDocumentFragment();
      fragment.appendChild(createHighDropRow('玩家名称', 'Drop', true));
      if (!items.length) {
        fragment.appendChild(createHighDropRow('无', '--'));
      } else {
        for (const item of items) fragment.appendChild(createHighDropRow(item?.[0], highDropValueText(item)));
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
      const easyNode = document.getElementById('easyKillPlayers');
      const damageNode = document.getElementById('dailyDamagePlayers');
      if (easyNode) {
        const items = Array.isArray(status.easyKillPlayers?.p) ? status.easyKillPlayers.p : [];
        const fragment = document.createDocumentFragment();
        if (!items.length) {
          fragment.appendChild(createPlayerMemoryName('无', 'player-memory-empty'));
        } else {
          for (const item of items) {
            const score = Math.min(3, Math.max(1, Math.round(number(item?.[1]) || 1)));
            fragment.appendChild(createPlayerMemoryName(item?.[0], 'easy-kill-score-' + score));
          }
        }
        easyNode.replaceChildren(fragment);
      }
      if (damageNode) {
        const items = Array.isArray(status.dailyDamagePlayers?.p) ? status.dailyDamagePlayers.p : [];
        const fragment = document.createDocumentFragment();
        if (!items.length) {
          fragment.appendChild(createPlayerMemoryName('无', 'player-memory-empty'));
        } else {
          for (const item of items) fragment.appendChild(createPlayerMemoryName(Array.isArray(item) ? item?.[0] : item, 'damage-player-name'));
        }
        damageNode.replaceChildren(fragment);
      }
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
        return;
      }
      renderNearbyCoins(status);
      renderNearbyPlayers(status);
    }
    function fighterStateText(actor) {
      if (!actor) return '--';
      return joinNonBlank([
        actor.active === null || actor.active === undefined ? '--' : (actor.active ? '活动' : '静止'),
        actor.moving ? '移动中' : '--',
        actor.firing ? '开火中' : '--'
      ]);
    }
    function battleStaminaPair(remainingMs, limitMs, defaultSeconds) {
      const limit = number(limitMs);
      const seconds = limit === null ? defaultSeconds : Math.max(0, Math.round(limit / 1000));
      return staminaPair(remainingMs, seconds);
    }
    function syncHpMeter(prefix, actor) {
      const hp = number(actor?.hp);
      const maxHpValue = number(actor?.maxHp);
      const maxHp = maxHpValue !== null && maxHpValue > 0 ? maxHpValue : 100;
      const ratio = hp === null ? 0 : Math.max(0, Math.min(1, hp / maxHp));
      setText(prefix + 'Hp', hp === null ? '--' : integer(hp) + '/' + integer(maxHp));
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
        if (durationNode) {
          delete durationNode.dataset.battleStartedAt;
          delete durationNode.dataset.battleDurationMs;
        }
        return;
      }
      setText('battleDistance', distance(battle.distance));
      setText('battleStartedAt', stamp(battle.startedAt));
      setText('battleSelfName', battle.self.name || (battle.self.userId ? '#' + battle.self.userId : '我方'));
      setText('battleTargetName', battle.target.name || (battle.target.userId ? '#' + battle.target.userId : '敌方'));
      setText('battleTargetSide', battle.targetAfk ? '敌方 · AFK' : '敌方');
      syncHpMeter('battleSelf', battle.self);
      syncHpMeter('battleTarget', battle.target);
      rows('battleSelfStats', [
        ['体力5s', battleStaminaPair(battle.self.stamina5s, battle.self.stamina5sLimit, 10)],
        ['体力1h', staminaPair(battle.self.stamina1h, 3000)],
        ['体力1d', staminaPair(battle.self.stamina1d, 20000)],
        ['Drop', integer(battle.self.drop), classAttrs('coin')],
        ['状态', fighterStateText(battle.self)]
      ]);
      rows('battleTargetStats', [
        ['体力5s', battleStaminaPair(battle.target.stamina5s, battle.target.stamina5sLimit, 10)],
        ['体力1h', staminaPair(battle.target.stamina1h, 3000)],
        ['体力1d', staminaPair(battle.target.stamina1d, 20000)],
        ['Drop', integer(battle.target.drop), classAttrs('coin')],
        ['状态', fighterStateText(battle.target)]
      ]);
      if (durationNode) {
        durationNode.dataset.battleStartedAt = battle.startedAt || '';
        durationNode.dataset.battleDurationMs = String(Math.max(0, Number(battle.durationMs || 0)));
      }
      updateBattleDuration();
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
      const currentReason = action.reason || decision.reason || status.recentExit?.reason || '';
      const target = activeTarget(status);
      const currentSession = status.stats?.currentSession || {};
      const offlineStats = status.stats?.offline || {};
      const { online, realtimeOnline } = panelSessionFlags(status);
      const reason = online
        ? currentReason
        : (offlineStats.lastExitReason || status.recentExit?.reason || currentReason);
      const rowsOut = [];

      addRow(rowsOut, '状态', actionText(status), true);
      addRow(rowsOut, online ? '原因' : '上次退出原因', dangerousPlayerExitReasonText(status, reason), true);
      const battle = !online ? recentBattle(status) : null;
      if (battle) {
        addRow(rowsOut, '交战对手', targetLabel(battle.target), true);
        addRow(rowsOut, '战斗结果', recentBattleOutcomeText(status), true);
        addRow(rowsOut, '战斗时间', recentBattleTimeText(status));
        addRow(rowsOut, '血量变化', recentBattleHpText(status));
        addRow(rowsOut, '输出承伤', recentBattleDamageText(status));
        const healingText = recentBattleHealingText(status);
        if (healingText) addRow(rowsOut, '战斗恢复', healingText);
        addRow(rowsOut, '射击命中', recentBattleShootingText(status));
      }
      const decisionText = joinNonBlank([kindText(kind), actionReasonText(status)]);
      const statusText = actionText(status);
      const reasonDisplay = dangerousPlayerExitReasonText(status, reason);
      if (online
        && decisionText !== '--'
        && decisionText !== statusText
        && decisionText !== reasonDisplay
        && decisionText !== joinNonBlank([statusText, reasonDisplay])) {
        addRow(rowsOut, '判断', decisionText);
      }
      addRow(rowsOut, '目标', targetLabel(target));
      addRow(rowsOut, '来源', sourceText(target?.authority));
      addRow(rowsOut, '目标状态', targetStateText(target));
      const dataGapSummary = dataGapsText(decision);
      if (online && dataGapSummary !== '--') addRow(rowsOut, '数据缺口', dataGapSummary);

      if ((realtimeOnline || !online) && isCombatStatus(status, kind, reason)) {
        addRow(rowsOut, '战斗目标', targetLabel(status.combat?.target));
        addRow(rowsOut, '战斗退出', reasonText(status.combat?.exit?.reason));
        addRow(rowsOut, '退出触发血量', combatExitHpText(status));
      }

      if (!realtimeOnline && isSafetyStatus(status, kind, reason)) {
        const loginDisplay = loginPointDisplay(status);
        const reentry = loginDisplay.state === 'reentry';
        addRow(rowsOut, reentry ? '连接状态' : '登录点', loginPointText(status), false, loginPointAttrs(status));
        addRow(rowsOut, reentry ? '当前坐标' : '登录点坐标', pointCoordText(status.loginPointSafety?.point));
        if (loginDisplay.state === 'unsafe') {
          addRow(rowsOut, '不安全原因', unsafeReasonText(status));
          addRow(rowsOut, '附近危险', targetLabel(status.loginPointSafety?.detail?.nearestDangerous || status.loginPointSafety?.detail?.nearestDamageActor || status.loginPointSafety?.detail?.nearestActive));
        } else if (loginDisplay.state === 'pending') {
          addRow(rowsOut, '等待原因', loginPointPendingReasonText(status));
        }
        addRow(rowsOut, '保持离线', offlineBlockerText(status), false, status.stats?.offline?.blocker ? classAttrs('warn') : null);
        addRow(rowsOut, reentry ? '状态确认时间' : '检查时间', fullStamp(status.loginPointSafety?.checkedAt || status.loginPointSafety?.detail?.checkedAt));
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
    function setChatHint(text, className) {
      const node = document.getElementById('chatHint');
      if (!node) return;
      const nextText = value(text);
      const nextClass = 'chat-hint ' + (className || 'muted');
      if (node.textContent !== nextText) node.textContent = nextText;
      if (node.className !== nextClass) node.className = nextClass;
    }
    function readChatKillsCollapsed() {
      try {
        const stored = localStorage.getItem(CHAT_KILL_COLLAPSE_KEY);
        return stored === null ? true : stored !== 'false';
      } catch (_) {
        return true;
      }
    }
    function persistChatKillsCollapsed() {
      try {
        localStorage.setItem(CHAT_KILL_COLLAPSE_KEY, String(chatKillsCollapsed));
      } catch (_) {}
    }
    function syncChatKillToggle() {
      const button = document.getElementById('chatKillToggle');
      if (!button) return;
      button.textContent = chatKillsCollapsed ? '展开' : '折叠';
      button.setAttribute('aria-expanded', String(!chatKillsCollapsed));
      button.title = chatKillsCollapsed ? '展开别人的击杀记录' : '折叠别人的击杀记录';
    }
    function syncChatCompose(chat) {
      const current = chat || latestChatStatus || {};
      const online = Boolean(current.sendAvailable);
      const available = online && !chatSendInFlight;
      const form = document.getElementById('chatForm');
      const input = document.getElementById('chatInput');
      const button = document.getElementById('chatSendBtn');
      if (form) form.hidden = !online;
      if (input) {
        input.disabled = !available;
        input.placeholder = '输入游戏聊天消息';
      }
      if (button) {
        button.disabled = !available;
        button.textContent = chatSendInFlight ? '发送中' : '发送';
      }
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
            const group = item.type === 'other-kill-group' ? item.messages : null;
            const message = group ? group[group.length - 1] : item.message;
            const kind = ['kill', 'system', 'chat'].includes(String(message?.kind || ''))
              ? String(message.kind)
              : 'chat';
            const row = document.createElement('div');
            row.className = 'chat-row chat-' + kind
              + (message?.mine ? ' mine' : '')
              + (group ? ' chat-kill-summary' : '');
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
            textNode.textContent = group
              ? group.length + '条别人的击杀记录'
              : value(message?.text);
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
      syncChatKillToggle();
      setText('chatRefreshAt', stamp(current.snapshot?.lastAt));
      syncChatCompose(current);
      setChatHint('', 'muted');
    }
    async function fetchStatus() {
      const url = '/api/panel-status' + (token ? '?token=' + encodeURIComponent(token) : '');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
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
      const result = await Promise.all([fetchStatus(), fetchChat()]);
      const s = result[0];
      const chat = result[1];
      if (maybeReloadForWebVersion(s)) return;
      renderChat(chat);
      updateAuthPanel(s);
      const authNeeds = Boolean(s.auth?.needsReauth);
      const statusClass = authNeeds ? authClass(s) : (s.runner?.lastError ? 'bad' : (s.runner?.running ? 'ok' : 'info'));
      setText('stamp', fullStamp(s.updatedAt));
      setClass('stamp', statusClass);
      setText('sourceIpCount', sourceIpCountText(s.network));
      setText('sourceIp', s.network?.sourceIp);

      rows('actionDetails', actionDetailRows(s));
      updateBattlePanel(s);
      updateNearbyPanels(s);
      renderHighDropPlayers(s);
      renderPlayerMemory(s);
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
      const { online } = panelSessionFlags(s);
      setText('sessionPanelTitle', online ? '本次游戏' : '上次游戏');
      rows('currentSession', [
        ['进入时间', fullStamp(currentSession.enteredAt), true],
        ['持续时间', duration(currentSession.durationMs)],
        ['消耗体力', spentStaminaUnit(currentSession.staminaSpentMs)],
        ['拾取金币', integer(currentSession.coinsGained)],
        ['击杀敌人', integer(currentSession.kills)]
      ]);
      rows('todayStats', [
        ['日期', todayStats.day],
        ['游戏时长', duration(todayStats.inGameDurationMs)],
        ['消耗体力', spentStaminaUnit(todayStats.staminaSpentMs)],
        ['拾取金币', integer(todayStats.coinsGained)],
        ['击杀敌人', integer(todayStats.kills)]
      ]);
      updateCountdownNodes();
    }
    function updateCountdownNodes() {
      document.querySelectorAll('[data-countdown-at]').forEach(node => {
        setValueText(node, countdownUntil(node.dataset.countdownAt || ''));
      });
      updateBattleDuration();
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
      setChatHint('正在通过在线 WebSocket 发送', 'info');
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
    document.getElementById('chatKillToggle').addEventListener('click', () => {
      chatKillsCollapsed = !chatKillsCollapsed;
      persistChatKillsCollapsed();
      syncChatKillToggle();
      renderChat(latestChatStatus);
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
  groupChatMessagesForDisplay,
  panelSessionFlagsCore,
  renderBrowserlessWebPanel
};
