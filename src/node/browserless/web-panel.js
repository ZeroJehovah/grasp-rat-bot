'use strict';

function renderBrowserlessWebPanel() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Grasp Rat Browserless Runner</title>
  <style>
    :root{color-scheme:dark;--bg:#111315;--panel:#171b1f;--line:#2d343b;--text:#edf2f7;--muted:#94a3b8;--blue:#60a5fa;--green:#4ade80;--amber:#fbbf24;--red:#f87171}
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
    main{max-width:1180px;margin:0 auto;padding:20px}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
    h1{font-size:20px;line-height:1.2;margin:0;font-weight:650;letter-spacing:0}
    button{font:inherit;border:1px solid var(--line);background:#20262c;color:var(--text);border-radius:6px;padding:7px 10px;cursor:pointer}
    button:hover{border-color:#4b5563}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    section{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:12px;min-width:0}
    section.wide{grid-column:span 2}
    h2{font-size:12px;line-height:1.2;margin:0 0 10px;color:var(--muted);font-weight:650;text-transform:uppercase;letter-spacing:.04em}
    dl{display:grid;grid-template-columns:minmax(82px,auto) 1fr;gap:6px 10px;margin:0}
    dt{color:var(--muted);min-width:0}
    dd{margin:0;min-width:0;overflow-wrap:anywhere}
    .pill{display:inline-flex;align-items:center;min-height:24px;border:1px solid var(--line);border-radius:999px;padding:2px 9px;background:#0f1419;color:var(--muted)}
    .ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.info{color:var(--blue)}
    pre{margin:0;white-space:pre-wrap;overflow:auto;max-height:280px;background:#0d1114;border:1px solid var(--line);border-radius:6px;padding:10px}
    .bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    @media (max-width:900px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:560px){main{padding:12px}.grid{grid-template-columns:1fr}section.wide{grid-column:auto}header{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Grasp Rat Browserless Runner</h1>
      <div class="bar"><span id="stamp" class="pill">--</span><button id="refreshBtn" type="button">Refresh</button></div>
    </header>
    <div class="grid">
      <section>
        <h2>Runner</h2>
        <dl id="runner"></dl>
      </section>
      <section>
        <h2>Session</h2>
        <dl id="session"></dl>
      </section>
      <section>
        <h2>Safety</h2>
        <dl id="safety"></dl>
      </section>
      <section>
        <h2>Self</h2>
        <dl id="self"></dl>
      </section>
      <section class="wide">
        <h2>Profit / Combat</h2>
        <dl id="work"></dl>
      </section>
      <section class="wide">
        <h2>Logs</h2>
        <dl id="logs"></dl>
      </section>
      <section class="wide">
        <h2>Recent Exits</h2>
        <pre id="exits">[]</pre>
      </section>
      <section class="wide">
        <h2>Raw</h2>
        <pre id="raw">{}</pre>
      </section>
    </div>
  </main>
  <script>
    const params = new URLSearchParams(location.search);
    const token = params.get('token') || localStorage.graspRatBrowserlessToken || '';
    if (token) localStorage.graspRatBrowserlessToken = token;
    const value = v => v === null || v === undefined || v === '' ? '--' : String(v);
    function rows(id, pairs) {
      document.getElementById(id).innerHTML = pairs.map(([k,v]) => '<dt>' + k + '</dt><dd>' + value(v) + '</dd>').join('');
    }
    async function refresh() {
      const res = await fetch('/api/status' + (token ? '?token=' + encodeURIComponent(token) : ''), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const s = await res.json();
      document.getElementById('stamp').textContent = s.updatedAt || new Date().toISOString();
      document.getElementById('stamp').className = 'pill ' + (s.runner?.lastError ? 'bad' : s.runner?.running ? 'ok' : 'info');
      rows('runner', [['mode', s.runner?.mode], ['running', s.runner?.running], ['readOnly', s.runner?.readOnly], ['dryRun', s.runner?.dryRun], ['action', s.runner?.currentAction?.kind || s.runner?.currentAction], ['error', s.runner?.lastError]]);
      rows('session', [['userId', s.session?.userId], ['authenticated', s.session?.authenticated], ['token', s.session?.tokenPresent ? 'present' : 'missing'], ['tokenAt', s.session?.tokenUpdatedAt]]);
      rows('safety', [['ok', s.loginPointSafety?.ok], ['reason', s.loginPointSafety?.reason], ['checkedAt', s.loginPointSafety?.checkedAt], ['point', s.loginPointSafety?.point ? JSON.stringify(s.loginPointSafety.point) : '']]);
      rows('self', [['name', s.current?.self?.name], ['hp', s.current?.self?.hp], ['x', s.current?.self?.x], ['y', s.current?.self?.y], ['stamina', s.current?.stamina ? JSON.stringify(s.current.stamina) : '']]);
      rows('work', [['profit', s.current?.profit ? JSON.stringify(s.current.profit) : ''], ['combat', s.current?.combatSummary ? JSON.stringify(s.current.combatSummary) : ''], ['lastRun', s.runner?.lastRun ? JSON.stringify(s.runner.lastRun) : ''], ['probe', s.probes?.lastReadOnlyProbe ? JSON.stringify(s.probes.lastReadOnlyProbe) : '']]);
      rows('logs', [['dataDir', s.logs?.dataDir], ['logDir', s.logs?.logDir], ['stateFile', s.logs?.stateFile], ['dayDir', s.logs?.currentDayDir]]);
      document.getElementById('exits').textContent = JSON.stringify(s.recentExits || [], null, 2);
      document.getElementById('raw').textContent = JSON.stringify(s, null, 2);
    }
    document.getElementById('refreshBtn').onclick = () => refresh().catch(err => {
      document.getElementById('stamp').textContent = err.message;
      document.getElementById('stamp').className = 'pill bad';
    });
    refresh().catch(err => {
      document.getElementById('stamp').textContent = err.message;
      document.getElementById('stamp').className = 'pill bad';
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderBrowserlessWebPanel
};
