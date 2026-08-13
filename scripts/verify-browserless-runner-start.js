#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const out = {
    logDir: '/var/log/grasp-rat-browserless',
    after: '',
    revision: '',
    maxTailBytes: 64 * 1024 * 1024,
    json: true,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--log-dir') out.logDir = path.resolve(argv[++i] || out.logDir);
    else if (arg === '--after') out.after = argv[++i] || '';
    else if (arg === '--revision') out.revision = String(argv[++i] || '').trim().toLowerCase();
    else if (arg === '--max-tail-bytes') out.maxTailBytes = Number(argv[++i] || out.maxTailBytes);
    else if (arg === '--human') out.json = false;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    'Usage: node scripts/verify-browserless-runner-start.js --after <ISO-time> --revision <12-or-40-hex> [options]',
    '',
    'Options:',
    '  --log-dir <dir>          Browserless log root.',
    '  --max-tail-bytes <n>     Maximum tail read from each candidate runner log.',
    '  --human                  Print a compact human-readable result.'
  ].join('\n');
}

function runnerLogFiles(logDir) {
  const files = [];
  if (!fs.existsSync(logDir)) return files;
  for (const day of fs.readdirSync(logDir, { withFileTypes: true })) {
    if (!day.isDirectory()) continue;
    const file = path.join(logDir, day.name, 'runner.jsonl');
    try {
      if (fs.statSync(file).isFile()) files.push(file);
    } catch (_) {}
  }
  return files;
}

function readTail(file, maxTailBytes) {
  const stat = fs.statSync(file);
  const bytes = Math.max(1, Math.min(stat.size, maxTailBytes));
  const offset = Math.max(0, stat.size - bytes);
  const handle = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    fs.readSync(handle, buffer, 0, bytes, offset);
    let text = buffer.toString('utf8');
    if (offset > 0) {
      const firstNewline = text.indexOf('\n');
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : '';
    }
    return text;
  } finally {
    fs.closeSync(handle);
  }
}

function verifyRunnerStart(options) {
  const afterMs = Date.parse(options.after);
  if (!Number.isFinite(afterMs)) fail(`invalid --after timestamp: ${options.after || 'missing'}`);
  if (!/^[0-9a-f]{12}(?:[0-9a-f]{28})?$/.test(options.revision)) fail(`invalid --revision: ${options.revision || 'missing'}`);
  const expectedRuntimeRevision = options.revision.slice(0, 12);
  const maxTailBytes = Number(options.maxTailBytes);
  if (!Number.isSafeInteger(maxTailBytes) || maxTailBytes < 1024) fail(`invalid --max-tail-bytes: ${options.maxTailBytes}`);

  const candidates = [];
  for (const file of runnerLogFiles(options.logDir)) {
    const stat = fs.statSync(file);
    if (stat.mtimeMs < afterMs) continue;
    for (const line of readTail(file, maxTailBytes).split(/\r?\n/)) {
      if (!line || !line.includes('"runner-start"')) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch (_) {
        continue;
      }
      if (entry?.type !== 'runner-start') continue;
      const atMs = Date.parse(entry.at || '');
      if (!Number.isFinite(atMs) || atMs < afterMs) continue;
      candidates.push({
        file,
        at: entry.at,
        atMs,
        runtimeRevision: String(entry.detail?.runtimeRevision || entry.runtimeRevision || ''),
        revisionSource: String(entry.detail?.runtimeRevisionResolution?.source || ''),
        targetWhitelistFile: String(entry.detail?.config?.targetWhitelistFile || ''),
        targetWhitelistUrl: String(entry.detail?.config?.targetWhitelistUrl || '')
      });
    }
  }
  candidates.sort((a, b) => a.atMs - b.atMs);
  const newest = candidates[candidates.length - 1] || null;
  if (!newest) fail(`no runner-start found after ${options.after} in ${options.logDir}`);
  if (newest.runtimeRevision !== expectedRuntimeRevision) {
    fail(`runner-start runtime revision mismatch: ${newest.runtimeRevision || 'missing'} != ${expectedRuntimeRevision}`);
  }
  return {
    ok: true,
    expectedRuntimeRevision,
    runnerStart: newest,
    candidateCount: candidates.length
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = verifyRunnerStart(options);
  if (options.json) console.log(JSON.stringify(report));
  else console.log(`Browserless runner-start verified: ${report.runnerStart.runtimeRevision} at ${report.runnerStart.at}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  readTail,
  runnerLogFiles,
  verifyRunnerStart
};
