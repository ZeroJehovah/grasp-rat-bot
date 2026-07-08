#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  browserlessPatchFromLegacyState,
  readBrowserlessStateFile,
  updateBrowserlessStateFile
} = require('../src/node/browserless/state-file');

function parseArgs(argv) {
  const out = {
    from: path.join(process.cwd(), 'headless-demo', 'data', 'state.json'),
    to: path.join(process.cwd(), 'data', 'browserless-runner', 'state.json'),
    source: 'headless-demo',
    json: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') out.from = argv[++i] || out.from;
    else if (arg === '--to') out.to = argv[++i] || out.to;
    else if (arg === '--source') out.source = argv[++i] || out.source;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function importBrowserlessState(options = {}) {
  const from = path.resolve(String(options.from || ''));
  const to = path.resolve(String(options.to || ''));
  const legacy = JSON.parse(fs.readFileSync(from, 'utf8'));
  const patch = browserlessPatchFromLegacyState(legacy, {
    source: options.source || 'import'
  });
  if (!patch.session?.userId || !patch.session?.sessionToken) {
    throw new Error('source state does not contain userId/sessionToken');
  }
  if (!patch.loginPointSafety?.point) {
    throw new Error('source state does not contain a login point/self summary');
  }
  const before = readBrowserlessStateFile(to);
  const updated = updateBrowserlessStateFile(to, patch);
  return {
    ok: true,
    from,
    to,
    userId: updated.session.userId,
    tokenPresent: Boolean(updated.session.sessionToken),
    previousTokenPresent: Boolean(before.session.sessionToken),
    loginPoint: updated.loginPointSafety.point,
    loginPointReason: updated.loginPointSafety.reason
  };
}

function usage() {
  return [
    'Usage: node scripts/browserless-import-state.js [--from <legacy-state.json>] [--to <browserless-state.json>] [--source <name>] [--json]',
    '',
    'Imports a previously authorized headless-demo/browserless state into the production browserless state file without printing secrets.'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = importBrowserlessState(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Browserless state import: ${result.ok ? 'ok' : 'failed'}`);
  console.log(`From: ${result.from}`);
  console.log(`To: ${result.to}`);
  console.log(`User: ${result.userId}`);
  console.log(`Token: ${result.tokenPresent ? 'present' : 'missing'}`);
  console.log(`Login point: x=${result.loginPoint.x}, y=${result.loginPoint.y}, hp=${result.loginPoint.hp ?? 'unknown'}, source=${result.loginPoint.source || 'unknown'}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  importBrowserlessState,
  parseArgs
};
