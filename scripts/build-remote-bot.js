#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BOT_SCRIPT = path.join(ROOT, 'grasp-rat-bot.js');

function parseArgs(args) {
  const out = {
    outDir: path.join(ROOT, 'dist'),
    fileName: 'grasp-rat-remote-bot.js',
    version: process.env.GRASP_RAT_BOT_VERSION || buildVersion(),
    scriptUrl: process.env.GRASP_RAT_SCRIPT_URL || 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/grasp-rat-remote-bot.js',
    debugEndpoint: process.env.GRASP_RAT_DEBUG_ENDPOINT || 'http://127.0.0.1:18777/events',
    debugEveryMs: 1000,
    statusEvery: 1000,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out-dir') out.outDir = path.resolve(args[++i] || out.outDir);
    else if (arg === '--file-name') out.fileName = args[++i] || out.fileName;
    else if (arg === '--version') out.version = args[++i] || out.version;
    else if (arg === '--script-url') out.scriptUrl = args[++i] || out.scriptUrl;
    else if (arg === '--debug-endpoint') out.debugEndpoint = args[++i] || out.debugEndpoint;
    else if (arg === '--debug-every-ms') out.debugEveryMs = Number(args[++i] || out.debugEveryMs);
    else if (arg === '--status-every') out.statusEvery = Number(args[++i] || out.statusEvery);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
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
  console.log(`Usage: node scripts/build-remote-bot.js [options]

Generates dist/grasp-rat-remote-bot.js and dist/manifest.json.

Options:
  --out-dir <dir>          Output directory. Default: dist
  --file-name <name>       Remote bot file name. Default: grasp-rat-remote-bot.js
  --version <value>        Version label. Default: UTC timestamp
  --script-url <url>       Public URL for the generated bot file
  --debug-endpoint <url>   Debug event endpoint injected into manifest
  --debug-every-ms <ms>    Browser bot debug tick interval. Default: 1000
  --status-every <ms>      Browser console status interval. Default: 1000
`);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });

  const source = execFileSync(process.execPath, [
    BOT_SCRIPT,
    '--print-source',
    '--bot-version', options.version,
    '--debug',
    '--debug-endpoint', options.debugEndpoint,
    '--debug-every-ms', String(options.debugEveryMs),
    '--status-every', String(options.statusEvery),
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });

  const scriptPath = path.join(options.outDir, options.fileName);
  const manifestPath = path.join(options.outDir, 'manifest.json');
  const hash = sha256Hex(source);
  const manifest = {
    version: options.version,
    builtAt: new Date().toISOString(),
    scriptUrl: options.scriptUrl,
    sha256: hash,
    debug: true,
    debugEndpoint: options.debugEndpoint,
    debugEveryMs: options.debugEveryMs,
    statusEvery: options.statusEvery,
    config: {}
  };

  fs.writeFileSync(scriptPath, source);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ scriptPath, manifestPath, version: options.version, sha256: hash }, null, 2));
}

main();
