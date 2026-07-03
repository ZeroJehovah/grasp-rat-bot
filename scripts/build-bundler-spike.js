#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'src', 'bundler-spike', 'runtime-entry.mjs');

function parseArgs(args) {
  const out = {
    outFile: path.join(ROOT, 'dist', 'spikes', 'bundler-spike.js'),
    selfTest: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out-file') out.outFile = path.resolve(args[++i] || out.outFile);
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Usage: node scripts/build-bundler-spike.js [options]

Builds a non-production esbuild IIFE spike for browser-module migration.

Options:
  --out-file <file>       Output file. Default: dist/spikes/bundler-spike.js
  --self-test             Build into a temp directory and verify the output shape
`);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function buildSpike(outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await esbuild.build({
    entryPoints: [ENTRY],
    outfile: outFile,
    bundle: true,
    format: 'iife',
    globalName: '__graspRatBundlerSpikeBundle',
    platform: 'browser',
    target: ['es2020'],
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent'
  });
  const source = fs.readFileSync(outFile, 'utf8');
  return {
    outFile,
    bytes: Buffer.byteLength(source),
    sha256: sha256Hex(source)
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSpikeOutput(source, globals = {}, rootSelector = context => context) {
  const context = {
    console,
    Date,
    BigInt,
    ...globals
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { timeout: 1000 });
  const root = rootSelector(context);
  return root?.__graspRatBundlerSpike?.status?.();
}

async function selfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-bundler-spike-'));
  const outFile = path.join(tempRoot, 'bundler-spike.js');
  const result = await buildSpike(outFile);
  const source = fs.readFileSync(outFile, 'utf8');
  assert(source.includes('__graspRatBundlerSpike'), 'spike global key is not present');
  assert(source.includes('__graspRatBundlerSpikeBundle'), 'IIFE globalName wrapper is not present');
  assert(source.includes('function resolvePageGlobal'), 'page-global adapter was not bundled');
  assert(source.includes('function installPageGlobal'), 'page-global installer was not bundled');
  assert(source.includes('function readPageGlobal'), 'page-global reader was not bundled');
  assert(source.includes('function readPageLocalStorageJson'), 'localStorage JSON adapter was not bundled');
  assert(!/require\(['"]\.\.?\//.test(source), 'bundled browser output still contains unresolved relative require()');
  assert(!/\bfrom\s+['"]\.\.?\//.test(source), 'bundled browser output still contains unresolved relative import');
  assert(source.includes('function safeStringify'), 'shared runtime helper was not bundled');
  assert(source.includes('function formatDistance'), 'display helper was not bundled');
  assert(source.includes('function offlineLeaveSummaryText'), 'exit-summary helper was not bundled');
  assert(source.includes('function buildBrowserPreservedState'), 'preserved-state helper was not bundled');
  assert(source.includes('function buildRuntimeDefaults'), 'runtime-defaults helper was not bundled');
  assert(source.includes('function actionFocusSummary'), 'strategy helper was not bundled');
  assert(source.includes('function recordActionSwitchDiagnosticsCore'), 'action-switch diagnostics helper was not bundled');
  assert(source.includes('function arrayCount'), 'browser runtime helper was not bundled');
  new vm.Script(source, { filename: outFile });
  const status = runSpikeOutput(source, {
    __GRASP_RAT_BUNDLER_SPIKE_CONFIG__: { version: 'self-test' },
    localStorage: {
      getItem(key) {
        return key === 'graspRatBundlerSpikeProbe' ? '{"ok":true,"scope":"globalThis"}' : null;
      }
    }
  });
  assert(status?.version === 'self-test', 'spike status did not read runtime config');
  assert(status.distance === '123米', 'spike did not execute bundled display helper');
  assert(Array.isArray(status.names) && status.names.length === 2, 'spike did not execute target whitelist helper');
  assert(status.nameCount === 2, 'spike did not execute browser runtime helper');
  assert(status.actionFocus?.type === 'coin', 'spike did not execute action focus helper');
  assert(status.actionSwitch?.type === 'target-switch', 'spike did not execute action-switch diagnostics helper');
  assert(String(status.offlineSummary || '').includes('网络采样超时'), 'spike did not execute exit-summary helper');
  assert(status.preservedKills === 3, 'spike did not execute preserved-state helper');
  assert(status.defaultStatusEvery === 0, 'spike did not execute runtime-defaults helper');
  assert(status.storageProbe?.scope === 'globalThis', 'spike did not read globalThis localStorage through adapter');
  assert(String(status.json || '').includes('"bigint":"7"'), 'spike did not execute safeStringify helper');
  const windowRoot = {
    __GRASP_RAT_BUNDLER_SPIKE_CONFIG__: { version: 'window-self-test' },
    localStorage: {
      getItem(key) {
        return key === 'graspRatBundlerSpikeProbe' ? '{"ok":true,"scope":"window"}' : null;
      }
    }
  };
  const windowStatus = runSpikeOutput(source, { window: windowRoot }, context => context.window);
  assert(windowStatus?.version === 'window-self-test', 'spike status did not read window runtime config');
  assert(windowStatus.storageProbe?.scope === 'window', 'spike did not read window localStorage through adapter');
  assert(windowRoot.__graspRatBundlerSpike, 'spike did not install on window root');
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = options.selfTest
    ? await selfTest()
    : await buildSpike(options.outFile);
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
