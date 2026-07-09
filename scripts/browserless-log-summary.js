#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {
    logDir: path.join(process.cwd(), 'data', 'logs'),
    day: new Date().toISOString().slice(0, 10),
    output: '',
    write: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--log-dir') out.logDir = argv[++i] || out.logDir;
    else if (arg === '--day') out.day = argv[++i] || out.day;
    else if (arg === '--output') out.output = argv[++i] || '';
    else if (arg === '--write') out.write = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function readJsonlEntries(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        return {
          at: '',
          type: 'parse-error',
          detail: {
            line: index + 1,
            message: err?.message || String(err)
          }
        };
      }
    });
}

function increment(map, key) {
  const normalized = String(key || 'unknown');
  map[normalized] = Number(map[normalized] || 0) + 1;
}

function coinLikeFieldsFromKeys(keys) {
  return (Array.isArray(keys) ? keys : [])
    .filter(key => /coin|drop|loot/i.test(String(key)))
    .sort();
}

function summarizeWsDiagnostics(entries) {
  const diagnostics = {
    messageEntries: 0,
    decodedEntries: 0,
    keySetCounts: {},
    frameTypeKeySetCounts: {},
    coinLikeFieldCounts: {},
    realtimeCoinLikeFieldCounts: {},
    snapshotCoinLikeFieldCounts: {},
    realtimeCoinDropFrames: 0,
    snapshotCoinDropFrames: 0,
    lastRealtimeCoinLikeFields: [],
    lastSnapshotCoinLikeFields: []
  };
  for (const entry of entries || []) {
    if (entry?.type !== 'message') continue;
    diagnostics.messageEntries += 1;
    const detail = entry.detail || {};
    const decodedType = String(detail.decodedType || detail.decodedSummary?.type || '');
    const keys = Array.isArray(detail.decodedJsonKeys) ? detail.decodedJsonKeys.slice().sort() : [];
    if (!decodedType && !keys.length) continue;
    diagnostics.decodedEntries += 1;
    const keySet = keys.join(',');
    if (keySet) {
      increment(diagnostics.keySetCounts, keySet);
      increment(diagnostics.frameTypeKeySetCounts, `${decodedType || 'unknown'}|${keySet}`);
    }
    const coinLikeFields = coinLikeFieldsFromKeys(keys);
    for (const field of coinLikeFields) increment(diagnostics.coinLikeFieldCounts, field);
    const coinDropCount = Number(detail.decodedSummary?.coinDropCount || 0);
    if (decodedType === 'pos') {
      for (const field of coinLikeFields) increment(diagnostics.realtimeCoinLikeFieldCounts, field);
      diagnostics.lastRealtimeCoinLikeFields = coinLikeFields;
      if (coinDropCount > 0) diagnostics.realtimeCoinDropFrames += 1;
    } else if (decodedType === 'snapshot') {
      for (const field of coinLikeFields) increment(diagnostics.snapshotCoinLikeFieldCounts, field);
      diagnostics.lastSnapshotCoinLikeFields = coinLikeFields;
      if (coinDropCount > 0) diagnostics.snapshotCoinDropFrames += 1;
    }
  }
  return diagnostics;
}

function summarizeEntries(entries) {
  const summary = {
    entries: entries.length,
    firstAt: '',
    lastAt: '',
    typeCounts: {}
  };
  for (const entry of entries) {
    if (entry?.at && (!summary.firstAt || entry.at < summary.firstAt)) summary.firstAt = entry.at;
    if (entry?.at && (!summary.lastAt || entry.at > summary.lastAt)) summary.lastAt = entry.at;
    increment(summary.typeCounts, entry?.type || 'unknown');
  }
  return summary;
}

function summarizeBrowserlessLogDay(options = {}) {
  const logDir = path.resolve(String(options.logDir || path.join(process.cwd(), 'data', 'logs')));
  const day = String(options.day || new Date().toISOString().slice(0, 10));
  const dayDir = path.join(logDir, day);
  const streams = {};
  const totals = {
    entries: 0,
    typeCounts: {}
  };
  if (fs.existsSync(dayDir)) {
    for (const dirent of fs.readdirSync(dayDir, { withFileTypes: true })) {
      if (!dirent.isFile() || !dirent.name.endsWith('.jsonl')) continue;
      const stream = dirent.name.replace(/\.jsonl$/, '');
      const entries = readJsonlEntries(path.join(dayDir, dirent.name));
      const streamSummary = summarizeEntries(entries);
      if (stream === 'ws') streamSummary.wsDiagnostics = summarizeWsDiagnostics(entries);
      streams[stream] = streamSummary;
      totals.entries += streamSummary.entries;
      for (const [type, count] of Object.entries(streamSummary.typeCounts)) {
        totals.typeCounts[type] = Number(totals.typeCounts[type] || 0) + Number(count || 0);
      }
    }
  }
  return {
    day,
    logDir,
    dayDir,
    generatedAt: new Date().toISOString(),
    totals,
    streams
  };
}

function writeBrowserlessLogSummary(summary, output = '') {
  const target = output || path.join(summary.dayDir, 'summary.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(summary, null, 2) + '\n');
  return target;
}

function usage() {
  return [
    'Usage: node scripts/browserless-log-summary.js [--log-dir <dir>] [--day YYYY-MM-DD] [--write] [--output <file>]',
    '',
    'Without --write, the summary JSON is printed to stdout.',
    'With --write, it is written to <log-dir>/<day>/summary.json unless --output is provided.'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const summary = summarizeBrowserlessLogDay(args);
  if (args.write || args.output) {
    const output = writeBrowserlessLogSummary(summary, args.output);
    console.log(JSON.stringify({ ok: true, output, totals: summary.totals }, null, 2));
    return;
  }
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  readJsonlEntries,
  summarizeBrowserlessLogDay,
  summarizeEntries,
  summarizeWsDiagnostics,
  writeBrowserlessLogSummary
};
