#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { browserBotSource } = require('../src/browser/bot-source');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT_FILE = path.join(ROOT, 'dist', 'spikes', 'grasp-rat-remote-bot.bundled-candidate.js');

function parseArgs(args) {
  const out = {
    outFile: DEFAULT_OUT_FILE,
    manifestFile: '',
    version: process.env.GRASP_RAT_BOT_VERSION || buildVersion(),
    scriptUrl: process.env.GRASP_RAT_SCRIPT_URL || 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/spikes/grasp-rat-remote-bot.bundled-candidate.js',
    statusEvery: 30000,
    selfTest: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out-file') out.outFile = path.resolve(args[++i] || out.outFile);
    else if (arg === '--manifest-file') out.manifestFile = path.resolve(args[++i] || out.manifestFile);
    else if (arg === '--version') out.version = args[++i] || out.version;
    else if (arg === '--script-url') out.scriptUrl = args[++i] || out.scriptUrl;
    else if (arg === '--status-every') out.statusEvery = Number(args[++i] || out.statusEvery);
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.manifestFile) {
    out.manifestFile = out.outFile.replace(/\.js$/i, '.manifest.json');
  }
  return out;
}

function buildVersion() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds())
  ].join('');
}

function printHelp() {
  console.log(`Usage: node scripts/build-remote-bot-bundled.js [options]

Builds a non-production esbuild candidate for the full generated remote bot.

Options:
  --out-file <file>       Output JS file. Default: dist/spikes/grasp-rat-remote-bot.bundled-candidate.js
  --manifest-file <file>  Output candidate manifest. Default: out-file with .manifest.json
  --version <value>       Version label. Default: UTC timestamp
  --script-url <url>      Public URL recorded in the candidate manifest
  --status-every <ms>     Browser console status interval. Use 0 to disable. Default: 30000
  --self-test             Build into a temp directory and verify the bundled candidate shape
`);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function remoteSourceFor(options) {
  return browserBotSource({
    dryRun: false,
    once: false,
    statusEvery: options.statusEvery,
    version: options.version
  });
}

async function bundleRemoteBot(options) {
  const directSource = remoteSourceFor(options);
  fs.mkdirSync(path.dirname(options.outFile), { recursive: true });
  fs.mkdirSync(path.dirname(options.manifestFile), { recursive: true });
  await esbuild.build({
    stdin: {
      contents: directSource,
      sourcefile: 'grasp-rat-remote-bot.generated.js',
      resolveDir: ROOT,
      loader: 'js'
    },
    outfile: options.outFile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent'
  });
  const bundledSource = fs.readFileSync(options.outFile, 'utf8');
  const directSha256 = sha256Hex(directSource);
  const bundledSha256 = sha256Hex(bundledSource);
  const manifest = {
    version: options.version,
    builtAt: new Date().toISOString(),
    scriptUrl: options.scriptUrl,
    sha256: bundledSha256,
    statusEvery: options.statusEvery,
    production: false,
    bundler: {
      name: 'esbuild',
      mode: 'full-generated-remote-candidate',
      directSha256,
      format: 'iife',
      platform: 'browser',
      target: 'es2020'
    },
    config: {}
  };
  fs.writeFileSync(options.manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return {
    outFile: options.outFile,
    manifestFile: options.manifestFile,
    version: options.version,
    directBytes: Buffer.byteLength(directSource),
    directSha256,
    bytes: Buffer.byteLength(bundledSource),
    sha256: bundledSha256
  };
}

function verifyBundledCandidate(source, manifest, expected = {}) {
  assert(source.includes('__graspRatBot'), 'bundled candidate does not contain the bot global key');
  assert(source.includes('window[BOT_KEY] = bot'), 'bundled candidate does not install the bot on window');
  assert(source.includes('function buildRuntimeDefaults'), 'runtime defaults helper was not preserved in the candidate');
  assert(source.includes('function buildBrowserPreservedState'), 'preserved-state helper was not preserved in the candidate');
  assert(source.includes('function updateBotPanel'), 'status panel runtime was not preserved in the candidate');
  assert(source.includes('function getNativeState'), 'native-state runtime was not preserved in the candidate');
  assert(source.includes('function safeStringify'), 'runtime utility helper was not preserved in the candidate');
  assert(source.includes('function formatDistance'), 'display helper was not preserved in the candidate');
  assert(!/require\(['"]\.\.?\//.test(source), 'bundled candidate still contains unresolved relative require()');
  assert(!/\bfrom\s+['"]\.\.?\//.test(source), 'bundled candidate still contains unresolved relative import');
  assert(!source.includes('module.exports'), 'bundled candidate still contains CommonJS exports');
  assert(manifest && manifest.production === false, 'candidate manifest must not mark itself as production');
  assert(manifest.bundler?.name === 'esbuild', 'candidate manifest does not record esbuild');
  assert(manifest.bundler?.mode === 'full-generated-remote-candidate', 'candidate manifest does not record the candidate mode');
  assert(manifest.bundler?.directSha256 === expected.directSha256, 'candidate manifest direct hash mismatch');
  assert(manifest.sha256 === expected.sha256, 'candidate manifest bundled hash mismatch');
  new vm.Script(source, { filename: expected.outFile || 'grasp-rat-remote-bot.bundled-candidate.js' });
}

async function selfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-remote-bundled-'));
  const outFile = path.join(tempRoot, 'grasp-rat-remote-bot.bundled-candidate.js');
  const manifestFile = path.join(tempRoot, 'grasp-rat-remote-bot.bundled-candidate.manifest.json');
  const result = await bundleRemoteBot({
    outFile,
    manifestFile,
    version: 'bundled-candidate-self-test',
    scriptUrl: 'https://example.invalid/grasp-rat-remote-bot.bundled-candidate.js',
    statusEvery: 0
  });
  const source = fs.readFileSync(outFile, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  verifyBundledCandidate(source, manifest, result);
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = options.selfTest
    ? await selfTest()
    : await bundleRemoteBot(options);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
