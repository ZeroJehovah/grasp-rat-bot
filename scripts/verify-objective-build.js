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
  }

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
