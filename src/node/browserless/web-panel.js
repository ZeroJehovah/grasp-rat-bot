'use strict';

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
    .ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.info{color:var(--blue)}
    .hero{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:12px;margin-bottom:10px}
    .botline{font-size:18px;line-height:1.25;font-weight:720;margin-bottom:4px;overflow-wrap:anywhere}
    .reason{color:var(--muted);overflow-wrap:anywhere}
    .metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
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
    @media (max-width:780px){.grid{grid-template-columns:1fr 1fr}.metrics{grid-template-columns:1fr 1fr}section.wide{grid-column:auto}}
    @media (max-width:520px){main{padding:10px}header{align-items:flex-start;flex-direction:column}.toolbar{justify-content:flex-start}.grid,.metrics{grid-template-columns:1fr}.botline{font-size:16px}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>抓鼠助手</h1>
      <div class="toolbar">
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
        <div class="metric"><span class="label">身上金币</span><span id="drop" class="value">--</span></div>
        <div class="metric"><span class="label">运行方式</span><span id="mode" class="value">--</span></div>
      </div>
    </section>

    <div class="grid">
      <section class="wide">
        <h2>当前目标</h2>
        <dl id="target"></dl>
      </section>
      <section>
        <h2>账号状态</h2>
        <dl id="session"></dl>
      </section>
      <section>
        <h2>移动</h2>
        <dl id="motion"></dl>
      </section>
      <section>
        <h2>开火</h2>
        <dl id="shooting"></dl>
      </section>
      <section>
        <h2>金币</h2>
        <dl id="profit"></dl>
      </section>
      <section>
        <h2>打架</h2>
        <dl id="combat"></dl>
      </section>
      <section>
        <h2>安全</h2>
        <dl id="safety"></dl>
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
    const bool = v => v === null || v === undefined ? '--' : (v ? '是' : '否');
    const stamp = iso => {
      if (!iso) return '--';
      const date = new Date(iso);
      return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour12: false }) : iso;
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
      'wait-for-full-stamina-and-hp': '等待血量和体力恢复',
      'move-to-target': '向目标移动',
      'no-opportunistic-shot': '没有顺手开火目标',
      'missing-target': '没有目标',
      'no-target': '没有目标',
      'manual-login-point-pending-snapshot-safety': '正在检查登录点安全',
      'unsafe-login-point': '登录点不安全',
      'snapshot safety not confirmed: active-near-login-point': '登录点附近有危险玩家，暂不进入',
      'missing-manual-session': '等待登录信息',
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
    function setText(id, text) {
      document.getElementById(id).textContent = value(text);
    }
    async function fetchStatus() {
      const url = '/api/panel-status' + (token ? '?token=' + encodeURIComponent(token) : '');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }
    async function refresh() {
      const s = await fetchStatus();
      const statusClass = s.runner?.lastError ? 'bad' : (s.runner?.running ? 'ok' : 'info');
      const reason = reasonText(s.runner?.lastError || s.action?.reason || s.decision?.reason || s.recentExit?.reason);
      document.getElementById('stamp').textContent = stamp(s.updatedAt);
      document.getElementById('stamp').className = 'pill ' + statusClass;
      setText('botLine', '助手：' + actionText(s));
      setText('reason', reason);
      setText('hp', s.self?.hp);
      setText('stamina', '5秒 ' + unit(s.stamina?.remaining5s) + ' / 1小时 ' + unit(s.stamina?.remaining1h) + ' / 1天 ' + unit(s.stamina?.remaining1d));
      setText('drop', s.self?.drop);
      setText('mode', modeText(s.runner?.controlMode || s.runner?.mode, s.runner?.combatEnabled));

      const target = activeTarget(s);
      rows('target', [
        ['目标', targetLabel(target)],
        ['来源', sourceText(target?.authority)],
        ['状态', target ? ['危险 ' + bool(target.active), '移动 ' + bool(target.moving), '开火 ' + bool(target.firing)].join(' / ') : '--'],
        ['判断', [kindText(s.action?.kind || s.decision?.kind), reasonText(s.action?.reason || s.decision?.reason)].filter(item => item !== '--').join(' / ')]
      ]);
      rows('session', [
        ['账号', s.session?.userId],
        ['已登录', bool(s.session?.authenticated)],
        ['游戏内', bool(s.game?.inGame)],
        ['登录信息', s.session?.tokenPresent ? '已有' : '缺失'],
        ['出口数量', s.network?.sourceIpCount],
        ['当前出口', s.network?.sourceIp]
      ]);
      rows('motion', [
        ['动作', kindText(s.action?.kind)],
        ['原因', reasonText(s.action?.movement?.reason || s.action?.reason)],
        ['方向', [s.action?.movement?.command?.dx, s.action?.movement?.command?.dy].map(value).join(', ')],
        ['移动次数', s.action?.counts?.velocity],
        ['停止次数', s.action?.counts?.stop]
      ]);
      rows('shooting', [
        ['能开火', bool(s.action?.shoot?.ok)],
        ['已跳过', bool(s.action?.shoot?.skipped)],
        ['原因', reasonText(s.action?.shoot?.reason || s.combat?.shooting?.reason)],
        ['开火次数', s.action?.counts?.shoot],
        ['连发次数', s.action?.counts?.shootRepeat]
      ]);
      rows('profit', [
        ['最佳目标', targetLabel(s.profit?.best?.target)],
        ['原因', reasonText(s.profit?.best?.reason)],
        ['评分', s.profit?.best?.score],
        ['可选目标', s.profit?.candidateCount]
      ]);
      rows('combat', [
        ['目标', targetLabel(s.combat?.target)],
        ['移动', reasonText(s.combat?.movement?.reason)],
        ['开火', s.combat?.shooting ? (bool(s.combat.shooting.wouldShoot) + ' / ' + reasonText(s.combat.shooting.reason)) : '--'],
        ['退出', reasonText(s.combat?.exit?.reason)],
        ['可选目标', s.combat?.candidateCount]
      ]);
      rows('safety', [
        ['登录点', loginPointText(s)],
        ['原因', s.game?.inGame ? '当前已连入游戏' : reasonText(s.loginPointSafety?.reason)],
        ['检查时间', stamp(s.loginPointSafety?.checkedAt)],
        ['最近退出', reasonText(s.recentExit?.reason)]
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
    document.getElementById('refreshBtn').onclick = () => refresh().catch(showError);
    document.getElementById('stopBtn').onclick = () => (async () => {
      const res = await fetch('/api/stop' + (token ? '?token=' + encodeURIComponent(token) : ''), { method: 'POST' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await refresh();
    })().catch(showError);
    function showError(err) {
      const message = String(err?.message || '');
      const match = /HTTP\s+(\d+)/i.exec(message);
      document.getElementById('stamp').textContent = match ? '请求失败：' + match[1] : '请求失败';
      document.getElementById('stamp').className = 'pill bad';
    }
    refresh().catch(showError);
    setInterval(() => refresh().catch(showError), 10000);
  </script>
</body>
</html>`;
}

module.exports = {
  renderBrowserlessWebPanel
};
