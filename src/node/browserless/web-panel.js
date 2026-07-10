'use strict';

function renderBrowserlessWebPanel() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Grasp Rat Browserless Runner</title>
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
      <h1>Grasp Rat Browserless Runner</h1>
      <div class="toolbar">
        <span id="stamp" class="pill">--</span>
        <button id="refreshBtn" type="button" title="Refresh status">Refresh</button>
        <button id="stopBtn" type="button" title="Request explicit stop">Stop</button>
      </div>
    </header>

    <section class="hero">
      <div id="botLine" class="botline">BOT --</div>
      <div id="reason" class="reason">--</div>
      <div class="metrics">
        <div class="metric"><span class="label">HP</span><span id="hp" class="value">--</span></div>
        <div class="metric"><span class="label">Stamina</span><span id="stamina" class="value">--</span></div>
        <div class="metric"><span class="label">Drop</span><span id="drop" class="value">--</span></div>
        <div class="metric"><span class="label">Mode</span><span id="mode" class="value">--</span></div>
      </div>
    </section>

    <div class="grid">
      <section class="wide">
        <h2>Target</h2>
        <dl id="target"></dl>
      </section>
      <section>
        <h2>Session</h2>
        <dl id="session"></dl>
      </section>
      <section>
        <h2>Motion</h2>
        <dl id="motion"></dl>
      </section>
      <section>
        <h2>Shooting</h2>
        <dl id="shooting"></dl>
      </section>
      <section>
        <h2>Profit</h2>
        <dl id="profit"></dl>
      </section>
      <section>
        <h2>Combat</h2>
        <dl id="combat"></dl>
      </section>
      <section>
        <h2>Safety</h2>
        <dl id="safety"></dl>
      </section>
      <section class="wide">
        <h2>Last Run</h2>
        <dl id="lastRun"></dl>
      </section>
    </div>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const token = params.get('token') || localStorage.graspRatBrowserlessToken || '';
    if (token) localStorage.graspRatBrowserlessToken = token;

    const value = v => v === null || v === undefined || v === '' ? '--' : String(v);
    const number = v => Number.isFinite(Number(v)) ? Number(v) : null;
    const unit = v => {
      const n = number(v);
      return n === null ? '--' : String(Math.floor(n / 1000));
    };
    const distance = v => {
      const n = number(v);
      if (n === null) return '--';
      return Math.round(n / 100) + 'm';
    };
    const bool = v => v === null || v === undefined ? '--' : (v ? 'yes' : 'no');
    const stamp = iso => {
      if (!iso) return '--';
      const date = new Date(iso);
      return Number.isFinite(date.getTime()) ? date.toLocaleTimeString() : iso;
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
      const name = target.name || (target.userId ? '#' + target.userId : (target.id ? '#' + target.id : target.type || 'target'));
      const parts = [name];
      if (target.distance !== null && target.distance !== undefined) parts.push(distance(target.distance));
      if (target.hp !== null && target.hp !== undefined) parts.push('HP ' + target.hp);
      if (target.drop !== null && target.drop !== undefined) parts.push('Drop ' + target.drop);
      if (target.amount !== null && target.amount !== undefined) parts.push('Coin ' + target.amount);
      return parts.join(' / ');
    }
    function actionText(status) {
      const decision = status.decision || {};
      const action = status.action || {};
      const kind = decision.kind || action.kind || 'wait';
      const target = decision.target || action.target || status.combat?.target || status.profit?.best?.target || null;
      if (kind === 'coin') return 'pick coin ' + targetLabel(target);
      if (kind === 'seek-coin') return 'seek coin ' + targetLabel(target);
      if (kind === 'attack' || kind === 'combat-live') return 'combat ' + targetLabel(target);
      if (kind === 'flee') return 'avoid threat';
      if (kind === 'leave' || kind === 'safety-exit') return 'leave game';
      if (kind === 'recover') return 'recover';
      if (kind === 'patrol') return 'patrol';
      if (kind === 'loop-wait') return 'wait for next run';
      if (kind === 'stop' || kind === 'stopped') return 'stopped';
      return kind || 'wait';
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
      const reason = s.runner?.lastError || s.decision?.reason || s.action?.reason || s.recentExit?.reason || '--';
      document.getElementById('stamp').textContent = stamp(s.updatedAt);
      document.getElementById('stamp').className = 'pill ' + statusClass;
      setText('botLine', 'BOT ' + actionText(s));
      setText('reason', reason);
      setText('hp', s.self?.hp);
      setText('stamina', '5s ' + unit(s.stamina?.remaining5s) + ' / 1h ' + unit(s.stamina?.remaining1h) + ' / 1d ' + unit(s.stamina?.remaining1d));
      setText('drop', s.self?.drop);
      setText('mode', (s.runner?.controlMode || s.runner?.mode || '--') + (s.runner?.combatEnabled ? ' / combat' : ''));

      const target = s.decision?.target || s.action?.target || s.combat?.target || s.profit?.best?.target || null;
      rows('target', [
        ['target', targetLabel(target)],
        ['authority', target?.authority],
        ['state', target ? ['active ' + bool(target.active), 'moving ' + bool(target.moving), 'firing ' + bool(target.firing)].join(' / ') : '--'],
        ['decision', [s.decision?.kind, s.decision?.reason].filter(Boolean).join(' / ')]
      ]);
      rows('session', [
        ['user', s.session?.userId],
        ['auth', bool(s.session?.authenticated)],
        ['token', s.session?.tokenPresent ? 'present' : 'missing'],
        ['source IPs', s.network?.sourceIpCount],
        ['source IP', s.network?.sourceIp]
      ]);
      rows('motion', [
        ['kind', s.action?.kind],
        ['reason', s.action?.movement?.reason || s.action?.reason],
        ['vector', [s.action?.movement?.command?.dx, s.action?.movement?.command?.dy].map(value).join(', ')],
        ['sent', s.action?.counts?.velocity],
        ['stops', s.action?.counts?.stop]
      ]);
      rows('shooting', [
        ['ok', bool(s.action?.shoot?.ok)],
        ['skipped', bool(s.action?.shoot?.skipped)],
        ['reason', s.action?.shoot?.reason || s.combat?.shooting?.reason],
        ['sent', s.action?.counts?.shoot],
        ['repeat', s.action?.counts?.shootRepeat]
      ]);
      rows('profit', [
        ['best', targetLabel(s.profit?.best?.target)],
        ['reason', s.profit?.best?.reason],
        ['score', s.profit?.best?.score],
        ['candidates', s.profit?.candidateCount]
      ]);
      rows('combat', [
        ['target', targetLabel(s.combat?.target)],
        ['move', s.combat?.movement?.reason],
        ['shoot', s.combat?.shooting ? (bool(s.combat.shooting.wouldShoot) + ' / ' + s.combat.shooting.reason) : '--'],
        ['exit', s.combat?.exit?.reason],
        ['candidates', s.combat?.candidateCount]
      ]);
      rows('safety', [
        ['login point', s.loginPointSafety?.ok ? 'ok' : 'blocked'],
        ['reason', s.loginPointSafety?.reason],
        ['checked', stamp(s.loginPointSafety?.checkedAt)],
        ['last exit', s.recentExit?.reason]
      ]);
      rows('lastRun', [
        ['run id', s.runner?.lastRun?.runId],
        ['ok', bool(s.runner?.lastRun?.ok)],
        ['reason', s.runner?.lastRun?.reason || s.runner?.lastRun?.error],
        ['frames', s.runner?.lastRun?.frames],
        ['decisions', s.runner?.lastRun?.decisions],
        ['actions', s.runner?.lastRun?.actions],
        ['completed', stamp(s.runner?.lastRun?.completedAt)]
      ]);
    }
    document.getElementById('refreshBtn').onclick = () => refresh().catch(showError);
    document.getElementById('stopBtn').onclick = () => (async () => {
      const res = await fetch('/api/stop' + (token ? '?token=' + encodeURIComponent(token) : ''), { method: 'POST' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      await refresh();
    })().catch(showError);
    function showError(err) {
      document.getElementById('stamp').textContent = err.message;
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
