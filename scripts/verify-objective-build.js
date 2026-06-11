#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const RUNTIME_FILES = [
  'grasp-rat-bot.js',
  'dist/grasp-rat-remote-bot.js',
  'userscript/grasp-rat-bootstrap.user.js',
  'extension/page-bootstrap.js'
];

const REMOTE_BOT_FILES = [
  'grasp-rat-bot.js',
  'dist/grasp-rat-remote-bot.js'
];

const BOOTSTRAP_FILES = [
  'userscript/grasp-rat-bootstrap.user.js',
  'extension/page-bootstrap.js'
];

const NUMERIC_INVARIANTS = [
  { key: 'postLoginZoomOutClicks', value: 6 },
  { key: 'postLoginZoomOutIntervalMs', value: 80 },
  { key: 'postLoginZoomArmMissingMs', value: 1000 },
  { key: 'unsafeExitReloginMinDelayMs', value: 60000 },
  { key: 'staminaBudgetReloginDelayMs', value: 300000 },
  { key: 'combatAttackRange', value: 14500 }
];

const results = [];

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function check(name, fn) {
  try {
    const detail = fn();
    results.push({ ok: true, name, detail: detail || '' });
  } catch (err) {
    results.push({ ok: false, name, detail: err && err.message ? err.message : String(err) });
  }
}

function expectObjectNumber(text, key, value) {
  const re = new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*${escapeRegExp(String(value))}(?![0-9.])`);
  return re.test(text);
}

function stringFromCodes(codes) {
  return String.fromCharCode(...codes);
}

function functionBody(text, name) {
  const marker = `function ${name}`;
  const start = text.indexOf(marker);
  assert(start >= 0, `${name} function not found`);
  const paren = text.indexOf('(', start + marker.length);
  assert(paren >= 0, `${name} parameter list not found`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let i = paren; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        bodyStart = i + 1;
        break;
      }
    }
  }
  assert(bodyStart >= 0, `${name} parameter list not closed`);
  const open = text.indexOf('{', bodyStart);
  assert(open >= 0, `${name} function body not found`);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`${name} function body not closed`);
}

function countMatches(text, re) {
  const matches = String(text || '').match(re);
  return matches ? matches.length : 0;
}

function generateRemoteSource(manifest) {
  return execFileSync(process.execPath, [
    path.join(ROOT, 'grasp-rat-bot.js'),
    '--print-source',
    '--bot-version', String(manifest.version || ''),
    '--status-every', String(manifest.statusEvery || 1000)
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
}

function extractSingle(text, re, label) {
  const match = String(text || '').match(re);
  assert(match && match[1], `${label} missing`);
  return String(match[1]);
}

function main() {
  const manifest = readJson('dist/manifest.json');
  const distSource = readText('dist/grasp-rat-remote-bot.js');
  const sourceBot = readText('grasp-rat-bot.js');
  const generatedSource = generateRemoteSource(manifest);
  const distHash = sha256Hex(distSource);
  const generatedHash = sha256Hex(generatedSource);

  check('manifest version is a bootstrap release', () => {
    assert(/^bootstrap-\d+\.\d+\.\d+$/.test(String(manifest.version || '')), `unexpected version ${manifest.version || '(empty)'}`);
    return manifest.version;
  });

  check('manifest sha256 is valid hex', () => {
    assert(/^[0-9a-f]{64}$/.test(String(manifest.sha256 || '')), `unexpected sha256 ${manifest.sha256 || '(empty)'}`);
    return manifest.sha256;
  });

  check('manifest sha256 matches dist remote bot', () => {
    assert(String(manifest.sha256 || '') === distHash, `manifest=${manifest.sha256 || '(empty)'} dist=${distHash}`);
    return distHash;
  });

  check('dist remote bot is generated from current source', () => {
    assert(generatedSource === distSource, `generated hash ${generatedHash} differs from dist hash ${distHash}`);
    return `${manifest.version} ${generatedHash}`;
  });

  check('generated remote bot hash matches manifest', () => {
    assert(String(manifest.sha256 || '') === generatedHash, `manifest=${manifest.sha256 || '(empty)'} generated=${generatedHash}`);
    return generatedHash;
  });

  for (const file of REMOTE_BOT_FILES) {
    const text = file === 'grasp-rat-bot.js' ? sourceBot : distSource;
    for (const invariant of NUMERIC_INVARIANTS) {
      check(`${file} has ${invariant.key}=${invariant.value}`, () => {
        assert(expectObjectNumber(text, invariant.key, invariant.value), `${invariant.key}: ${invariant.value} not found`);
      });
    }
    check(`${file} accepts injected sourceHash`, () => {
      assert(text.includes('sourceHash: String(config.sourceHash || \'\')'), 'sourceHash config field not found');
    });
    check(`${file} keeps post-login zoom-out scheduling flow`, () => {
      const keyBody = functionBody(text, 'postLoginZoomSessionKey');
      assert(keyBody.includes("return String(userId) + ':token:' + String(token).slice(0, 24)"), 'token-based zoom session key not found');
      assert(keyBody.includes("return String(userId) + ':generation:' + Number(bot.postLoginZoom?.generation || 0)"), 'generation-based zoom session key not found');

      const unavailableBody = functionBody(text, 'noteSelfUnavailableForPostLoginZoom');
      assert(unavailableBody.includes('cfg.postLoginZoomArmMissingMs'), 'missing-self arm delay config not used');
      assert(unavailableBody.includes('state.generation = Number(state.generation || 0) + 1'), 'zoom generation increment not found');
      assert(unavailableBody.includes('state.armed = true'), 'zoom re-arm state not found');
      assert(unavailableBody.includes("state.scheduledKey = ''"), 'scheduled key reset not found');

      const scheduleBody = functionBody(text, 'schedulePostLoginZoomOut');
      assert(scheduleBody.includes('state.lastSeenSelfAt = t'), 'last seen self timestamp not updated');
      assert(scheduleBody.includes('state.missingSince = 0'), 'missing-self timer not cleared on self detection');
      assert(scheduleBody.includes('cfg.postLoginZoomOutClicks'), 'zoom click count config not used');
      assert(scheduleBody.includes('if (!clicks || !state.armed) return null'), 'zoom armed/click guard not found');
      assert(scheduleBody.includes('state.appliedKey === key || state.scheduledKey === key'), 'duplicate session zoom guard not found');
      assert(scheduleBody.includes('state.armed = false'), 'zoom not disarmed after scheduling');
      assert(scheduleBody.includes('requestedClicks: clicks'), 'requested click count not recorded');
      assert(scheduleBody.includes('cfg.postLoginZoomOutIntervalMs'), 'zoom click interval config not used');
      assert(scheduleBody.includes('for (let index = 0; index < clicks; index += 1)'), 'per-click scheduling loop not found');
      assert(scheduleBody.includes('clickZoomOutControl()'), 'scheduled callback does not click zoom-out control');
      assert(scheduleBody.includes('index * intervalMs'), 'scheduled clicks are not interval-spaced');
      assert(scheduleBody.includes('latest.completedClicks') && scheduleBody.includes('latest.failedClicks'), 'zoom result counters not updated');

      const findBody = functionBody(text, 'findZoomOutControl');
      assert(findBody.includes('#zoomOutBtn') && findBody.includes('[data-testid="zoom-out"]'), 'native zoom-out selectors not found');
      assert(findBody.includes('缩小'), 'localized zoom-out text fallback not found');
      const clickBody = functionBody(text, 'clickZoomOutControl');
      assert(clickBody.includes('control.click()'), 'zoom-out control click not found');
      assert(text.includes('postLoginZoom: this.postLoginZoom'), 'status does not expose postLoginZoom state');
    });
    check(`${file} treats join-mode Active as non-AFK combat`, () => {
      const expectedMin = file === 'grasp-rat-bot.js' ? 2 : 1;
      assert(
        countMatches(text, /const isJoinModeActive = e => e\?\.current_join_mode === 'Active' \|\| e\?\.mode === 'Active';/g) >= expectedMin,
        'join-mode Active helper not found'
      );
      assert(
        countMatches(text, /const isAfkTarget = e => !isJoinModeActive\(e\) && !is(?:Currently)?Active\(e\) && !isMovingThreat\(e\);/g) >= expectedMin,
        'AFK target filter does not exclude join-mode Active'
      );
      assert(
        countMatches(text, /if \(isJoinModeActive\(target\)\) return true;/g) >= expectedMin,
        'defensive combat target does not accept join-mode Active'
      );
      assert(
        countMatches(text, /\+ \(isJoinModeActive\(target\) \? [0-9]+ : 0\)/g) >= expectedMin,
        'combat target priority does not include join-mode Active'
      );
    });
    check(`${file} ends combat logs on relogin wait/manual states`, () => {
      const body = functionBody(text, 'combatLogSuspendReason');
      assert(body.includes('login-suppressed'), 'login-suppressed suspend reason not found');
      assert(body.includes('manual-login'), 'manual-login suspend reason not found');
    });
    check(`${file} keeps longest exit suppress delay`, () => {
      const confirmedBody = functionBody(text, 'setExitReloginSuppress');
      assert(
        confirmedBody.includes('const reloginDelayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'),
        'confirmed exit suppress does not take max(delay, minimum)'
      );
      const pendingBody = functionBody(text, 'primePendingUnsafeExitLoginSuppress');
      assert(
        pendingBody.includes('const delayMs = Math.max(Number(delay.delayMs || 0), minimumDelayMs);'),
        'pending unsafe exit suppress does not take max(delay, minimum)'
      );
    });
  }

  check('grasp-rat-bot.js covers stationary full-stamina Active combat self-test', () => {
    assert(
      /name: 'stationary full-stamina active in range beats coin pickup'[\s\S]*current_join_mode: 'Active'[\s\S]*stamina_5s_remaining_milli: 10000[\s\S]*coins: \[\{ drop_id: 2, x: 5000, y: 0, amount: 1 \}\][\s\S]*want: 'attack'/.test(sourceBot),
      'stationary full-stamina Active coin override self-test not found'
    );
  });

  const obsoleteReason = ['wait', 'for', 'clear', 'opportunity'].join('-');
  const obsoleteDisplayText = String.fromCharCode(0x6536, 0x76ca, 0x63a5, 0x8fd1);
  const obsoletePatterns = [
    { label: 'obsolete ambiguous wait reason', text: obsoleteReason },
    { label: 'obsolete ambiguous wait display text', text: obsoleteDisplayText }
  ];

  for (const pattern of obsoletePatterns) {
    check(`${pattern.label} is absent from runtime files`, () => {
      const offenders = RUNTIME_FILES.filter(file => readText(file).includes(pattern.text));
      assert(offenders.length === 0, `found in ${offenders.join(', ')}`);
    });
  }

  for (const file of BOOTSTRAP_FILES) {
    const text = readText(file);
    check(`${file} passes manifest sha256 as sourceHash`, () => {
      assert(text.includes('sourceHash: String(manifest.sha256 || \'\')'), 'manifest sha256 sourceHash injection not found');
    });
    check(`${file} resets embedded workspace layout`, () => {
      assert(/\.workspace\{[^'"\r\n]*inset:auto!important[^'"\r\n]*transform:none!important[^'"\r\n]*flex:1 1 0!important/.test(text), 'workspace inset/transform/flex reset not found');
      assert(/\.workspace>\.map-shell\{[^'"\r\n]*width:100%!important[^'"\r\n]*height:100%!important/.test(text), 'map-shell fill rule not found');
      assert(/\.workspace #world\{[^'"\r\n]*width:100%!important[^'"\r\n]*height:100%!important[^'"\r\n]*display:block!important/.test(text), 'world fill rule not found');
    });
    check(`${file} uses compact dot panel controls`, () => {
      assert(text.includes('const statusDot = createDot(statusTitle, statusColor, statusHalo, statusGlow'), 'BOT status dot not found');
      assert(text.includes("onClick: () => setPaused(!isPaused(), 'panel bot dot')"), 'BOT status dot pause toggle not found');
      assert(text.includes("statusDot.setAttribute('aria-pressed', String(paused))"), 'BOT status dot aria-pressed not found');
      assert(text.includes('actions.appendChild(createDot(wsTitle, wsColor'), 'WS state dot not found');
      assert(text.includes('const logDot = createDot(remoteLogTitle, remoteLogColor, remoteLogHalo, remoteLogGlow'), 'remote-log dot not found');
      assert(text.includes('pending: remoteLogPending > 0 && remoteLogFailed <= 0'), 'remote-log pending blink state not found');
      assert(text.includes('onClick: () => configureCombatLogging({ enabled: !remoteLogEnabled })'), 'remote-log dot toggle not found');
      assert(text.includes("logDot.setAttribute('aria-pressed', String(remoteLogEnabled))"), 'remote-log dot aria-pressed not found');
    });
    check(`${file} keeps panel section titles removed`, () => {
      const removedText = [
        stringFromCodes([0x72b6, 0x6001, 0xff1a]),
        stringFromCodes([0x811a, 0x672c, 0x4fe1, 0x606f]),
        stringFromCodes([0x7edf, 0x8ba1, 0x4fe1, 0x606f]),
        'BOT' + stringFromCodes([0x884c, 0x4e3a])
      ];
      const offenders = removedText.filter(value => text.includes(value));
      assert(offenders.length === 0, `removed visible text found: ${offenders.join(', ')}`);
      assert(!/appendLine\(['"]\s*remote log/i.test(text), 'visible remote log append line found');
    });
    check(`${file} uses tooltip-only metric labels`, () => {
      assert(text.includes("item.title = String(metric.label ?? '')"), 'metric item title not found');
      assert(text.includes("item.setAttribute('aria-label', String(metric.label ?? ''))"), 'metric item aria-label not found');
      assert(text.includes("value.textContent = String(metric.value ?? '-')"), 'metric value-only text not found');
      assert(!/textContent\s*=\s*String\(metric\.label/.test(text), 'metric label appears as visible textContent');
      assert(!/appendChild\(label\)/.test(text), 'metric label element append found');
    });
    check(`${file} formats stamina as raw remaining/limit values`, () => {
      const body = functionBody(text, 'formatStamina');
      assert(countMatches(body, /\bpairText\(/g) === 3, 'formatStamina should use exactly three pairText calls');
      assert(body.includes("Math.max(0, Math.round(r)) + '/' + Math.round(l)"), 'remaining/limit pair formatting not found');
      assert(!body.includes('%'), 'percent stamina formatting found');
      assert(text.includes("staminaPill.textContent = '") && text.includes("' + formatStamina(self)"), 'stamina line does not render formatStamina output');
    });
  }

  const userscriptText = readText('userscript/grasp-rat-bootstrap.user.js');
  check('userscript metadata version matches runtime constant', () => {
    const metaVersion = extractSingle(userscriptText, /^\s*\/\/\s*@version\s+([^\s]+)/m, 'userscript @version');
    const constantVersion = extractSingle(userscriptText, /const BOOTSTRAP_VERSION = '([^']+)'/, 'userscript BOOTSTRAP_VERSION');
    assert(metaVersion === constantVersion, `metadata=${metaVersion} constant=${constantVersion}`);
    return metaVersion;
  });

  const extensionManifest = readJson('extension/manifest.json');
  const extensionBootstrapText = readText('extension/page-bootstrap.js');
  check('extension manifest version matches page bootstrap constant', () => {
    const constantVersion = extractSingle(extensionBootstrapText, /const BOOTSTRAP_VERSION = '([^']+)'/, 'extension BOOTSTRAP_VERSION');
    assert(String(extensionManifest.version || '') === constantVersion, `manifest=${extensionManifest.version || '(empty)'} constant=${constantVersion}`);
    return constantVersion;
  });

  for (const result of results) {
    const prefix = result.ok ? 'ok' : 'FAIL';
    const detail = result.detail ? ` - ${result.detail}` : '';
    console.log(`${prefix} ${result.name}${detail}`);
  }

  const failures = results.filter(result => !result.ok);
  if (failures.length) {
    console.error(`verify-objective-build failed: ${failures.length} issue(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`objective build verification ok (${results.length} checks)`);
}

main();
