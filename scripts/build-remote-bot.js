#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  buildVersion,
  writeRemoteBotBundle
} = require('./remote-bot-bundle');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(args) {
  const out = {
    outDir: path.join(ROOT, 'dist'),
    fileName: 'grasp-rat-remote-bot.js',
    version: process.env.GRASP_RAT_BOT_VERSION || buildVersion(),
    scriptUrl: process.env.GRASP_RAT_SCRIPT_URL || 'https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/main/dist/grasp-rat-remote-bot.js',
    statusEvery: 30000,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out-dir') out.outDir = path.resolve(args[++i] || out.outDir);
    else if (arg === '--file-name') out.fileName = args[++i] || out.fileName;
    else if (arg === '--version') out.version = args[++i] || out.version;
    else if (arg === '--script-url') out.scriptUrl = args[++i] || out.scriptUrl;
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

function printHelp() {
  console.log(`Usage: node scripts/build-remote-bot.js [options]

Generates bundled dist/grasp-rat-remote-bot.js and dist/manifest.json.

Options:
  --out-dir <dir>          Output directory. Default: dist
  --file-name <name>       Remote bot file name. Default: grasp-rat-remote-bot.js
  --version <value>        Version label. Default: UTC timestamp
  --script-url <url>       Public URL for the generated bot file
  --status-every <ms>      Browser console status interval. Use 0 to disable. Default: 30000
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scriptPath = path.join(options.outDir, options.fileName);
  const manifestPath = path.join(options.outDir, 'manifest.json');
  const result = await writeRemoteBotBundle({
    outFile: scriptPath,
    manifestFile: manifestPath,
    version: options.version,
    scriptUrl: options.scriptUrl,
    statusEvery: options.statusEvery
  }, {
    production: true,
    mode: 'production-runtime-entry-source'
  });
  console.log(JSON.stringify({
    scriptPath,
    manifestPath,
    version: result.version,
    sha256: result.sha256,
    directSha256: result.directSha256,
    bundler: 'esbuild'
  }, null, 2));
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
