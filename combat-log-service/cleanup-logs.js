#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULTS = {
  dir: path.join(__dirname, 'logs'),
  retentionDays: 3,
  dryRun: false,
  json: false,
  selfTest: false
};
const SPLIT_DETAIL_DIRS = new Set(['combat', 'misc']);

function parseArgs(args) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dir') out.dir = path.resolve(args[++i] || out.dir);
    else if (arg === '--retention-days') out.retentionDays = normalizeRetentionDays(args[++i], out.retentionDays);
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--json') out.json = true;
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
  console.log(`Usage: node cleanup-logs.js [options]

Options:
  --dir <dir>              Log root directory. Default: ./logs
  --retention-days <days>  Keep detailed logs for this many local date directories. Default: ${DEFAULTS.retentionDays}
  --dry-run                Show what would be removed without deleting files.
  --json                   Print machine-readable JSON.
  --self-test              Run cleanup regression checks.
`);
}

function normalizeRetentionDays(value, fallback = DEFAULTS.retentionDays) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(1, Math.floor(Number(fallback) || DEFAULTS.retentionDays));
  return Math.max(1, Math.floor(n));
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function localDayName(ms = Date.now()) {
  const d = new Date(Number(ms) || Date.now());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localDayStartMs(ms = Date.now()) {
  const d = new Date(Number(ms) || Date.now());
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayStartMsFromName(name) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(name || ''));
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return 0;
  return date.getTime();
}

function retentionCutoffStartMs(nowMs = Date.now(), retentionDays = DEFAULTS.retentionDays) {
  const days = normalizeRetentionDays(retentionDays);
  return localDayStartMs(nowMs) - ((days - 1) * DAY_MS);
}

function isLegacyFlatDetailedLog(entry) {
  if (!entry.isFile() || !entry.name.endsWith('.jsonl')) return false;
  return !/^(?:important|audit)(?:[-_.]|$)/i.test(entry.name);
}

async function safeReaddir(dir) {
  try {
    return await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

async function pathStats(targetPath) {
  let stat;
  try {
    stat = await fs.promises.lstat(targetPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') return { files: 0, dirs: 0, bytes: 0 };
    throw err;
  }
  if (stat.isFile()) return { files: 1, dirs: 0, bytes: stat.size };
  if (!stat.isDirectory()) return { files: 0, dirs: 0, bytes: 0 };
  const entries = await safeReaddir(targetPath);
  const total = { files: 0, dirs: 1, bytes: 0 };
  for (const entry of entries) {
    const nested = await pathStats(path.join(targetPath, entry.name));
    total.files += nested.files;
    total.dirs += nested.dirs;
    total.bytes += nested.bytes;
  }
  return total;
}

async function collectCleanupTargets(options = {}) {
  const dir = path.resolve(options.dir || DEFAULTS.dir);
  const retentionDays = normalizeRetentionDays(options.retentionDays);
  const nowMs = Number(options.nowMs) || Date.now();
  const cutoffStartMs = retentionCutoffStartMs(nowMs, retentionDays);
  const entries = await safeReaddir(dir);
  const targets = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dayStartMs = dayStartMsFromName(entry.name);
    if (!dayStartMs || dayStartMs >= cutoffStartMs) continue;

    const dayDir = path.join(dir, entry.name);
    const dayEntries = await safeReaddir(dayDir);
    for (const item of dayEntries) {
      const fullPath = path.join(dayDir, item.name);
      if (item.isDirectory() && SPLIT_DETAIL_DIRS.has(item.name)) {
        targets.push({ path: fullPath, type: 'split-detail-dir', day: entry.name });
      } else if (isLegacyFlatDetailedLog(item)) {
        targets.push({ path: fullPath, type: 'legacy-flat-jsonl', day: entry.name });
      }
    }
  }

  return {
    dir,
    retentionDays,
    nowMs,
    retainedSinceDay: localDayName(cutoffStartMs),
    targets: targets.sort((a, b) => a.path.localeCompare(b.path))
  };
}

async function removeIfEmpty(dir, stopDir) {
  const resolved = path.resolve(dir);
  if (resolved === path.resolve(stopDir)) return 0;
  const entries = await safeReaddir(resolved);
  if (entries.length) return 0;
  try {
    await fs.promises.rmdir(resolved);
    return 1;
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTEMPTY')) return 0;
    throw err;
  }
}

async function cleanupDetailedLogs(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const collected = await collectCleanupTargets(options);
  const result = {
    ok: true,
    dir: collected.dir,
    dryRun,
    retentionDays: collected.retentionDays,
    retainedSinceDay: collected.retainedSinceDay,
    candidates: [],
    deletedFiles: 0,
    deletedDirs: 0,
    deletedBytes: 0,
    removedEmptyDirs: 0
  };
  const touchedDayDirs = new Set();

  for (const target of collected.targets) {
    const stats = await pathStats(target.path);
    if (!stats.files && !stats.dirs) continue;
    const relativePath = path.relative(collected.dir, target.path);
    result.candidates.push({
      path: relativePath,
      type: target.type,
      day: target.day,
      files: stats.files,
      dirs: stats.dirs,
      bytes: stats.bytes
    });
    result.deletedFiles += stats.files;
    result.deletedDirs += stats.dirs;
    result.deletedBytes += stats.bytes;
    touchedDayDirs.add(path.join(collected.dir, target.day));
    if (!dryRun) {
      await fs.promises.rm(target.path, { recursive: true, force: true });
    }
  }

  if (!dryRun) {
    const dayDirs = Array.from(touchedDayDirs).sort((a, b) => b.length - a.length);
    for (const dayDir of dayDirs) {
      result.removedEmptyDirs += await removeIfEmpty(dayDir, collected.dir);
    }
  }

  return result;
}

function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = n / 1024;
  for (let i = 0; i < units.length; i += 1) {
    if (value < 1024 || i === units.length - 1) return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[i]}`;
    value /= 1024;
  }
  return `${n} B`;
}

function printReport(result) {
  const verb = result.dryRun ? 'Would remove' : 'Removed';
  console.log(`${verb} ${result.deletedFiles} detailed log files (${formatBytes(result.deletedBytes)}) older than ${result.retainedSinceDay}; retention=${result.retentionDays} days`);
  if (result.removedEmptyDirs) console.log(`Removed empty day directories: ${result.removedEmptyDirs}`);
  if (!result.candidates.length) {
    console.log('No detailed logs matched the cleanup policy.');
    return;
  }
  for (const item of result.candidates) {
    console.log(`- ${item.path} (${item.type}, files=${item.files}, size=${formatBytes(item.bytes)})`);
  }
}

function writeFixture(filePath, text = 'x\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(message);
}

async function runSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-log-cleanup-'));
  const nowMs = new Date(2026, 5, 26, 12, 0, 0, 0).getTime();
  try {
    writeFixture(path.join(root, '2026-06-22', 'combat', 'old-combat.jsonl'), 'combat-old\n');
    writeFixture(path.join(root, '2026-06-22', 'misc', 'old-misc.jsonl'), 'misc-old\n');
    writeFixture(path.join(root, '2026-06-22', 'legacy-flat.jsonl'), 'legacy-old\n');
    writeFixture(path.join(root, '2026-06-22', 'important-flat.jsonl'), 'important-flat-old\n');
    writeFixture(path.join(root, '2026-06-22', 'audit-flat.jsonl'), 'audit-flat-old\n');
    writeFixture(path.join(root, '2026-06-22', 'important', 'keep-important.jsonl'), 'important-old\n');
    writeFixture(path.join(root, '2026-06-22', 'audit', 'keep-audit.jsonl'), 'audit-old\n');
    writeFixture(path.join(root, '2026-06-22', 'daily-2026-06-22.md'), '# old daily\n');
    writeFixture(path.join(root, '2026-06-24', 'combat', 'keep-combat.jsonl'), 'combat-keep\n');
    writeFixture(path.join(root, '2026-06-27', 'combat', 'future-combat.jsonl'), 'future-keep\n');
    writeFixture(path.join(root, 'misc-root', 'combat', 'not-a-day.jsonl'), 'not-day\n');

    const dryRun = await cleanupDetailedLogs({ dir: root, nowMs, retentionDays: 3, dryRun: true });
    assertSelfTest(dryRun.deletedFiles === 3, `expected dry-run to count 3 files, got ${dryRun.deletedFiles}`);
    assertSelfTest(fs.existsSync(path.join(root, '2026-06-22', 'combat', 'old-combat.jsonl')), 'dry-run removed a file');

    const result = await cleanupDetailedLogs({ dir: root, nowMs, retentionDays: 3 });
    assertSelfTest(result.retainedSinceDay === '2026-06-24', `unexpected retained-since day ${result.retainedSinceDay}`);
    assertSelfTest(result.deletedFiles === 3, `expected 3 deleted files, got ${result.deletedFiles}`);
    assertSelfTest(!fs.existsSync(path.join(root, '2026-06-22', 'combat')), 'old split combat directory was not removed');
    assertSelfTest(!fs.existsSync(path.join(root, '2026-06-22', 'misc')), 'old split misc directory was not removed');
    assertSelfTest(!fs.existsSync(path.join(root, '2026-06-22', 'legacy-flat.jsonl')), 'old legacy flat JSONL was not removed');
    assertSelfTest(fs.existsSync(path.join(root, '2026-06-22', 'important-flat.jsonl')), 'legacy flat important logs should be retained');
    assertSelfTest(fs.existsSync(path.join(root, '2026-06-22', 'audit-flat.jsonl')), 'legacy flat audit logs should be retained');
    assertSelfTest(fs.existsSync(path.join(root, '2026-06-22', 'important', 'keep-important.jsonl')), 'important logs should be retained');
    assertSelfTest(fs.existsSync(path.join(root, '2026-06-22', 'audit', 'keep-audit.jsonl')), 'audit logs should be retained');
    assertSelfTest(fs.existsSync(path.join(root, '2026-06-22', 'daily-2026-06-22.md')), 'daily Markdown reports should be retained');
    assertSelfTest(fs.existsSync(path.join(root, '2026-06-24', 'combat', 'keep-combat.jsonl')), 'recent detailed logs should be retained');
    assertSelfTest(fs.existsSync(path.join(root, '2026-06-27', 'combat', 'future-combat.jsonl')), 'future dated logs should be retained');
    assertSelfTest(fs.existsSync(path.join(root, 'misc-root', 'combat', 'not-a-day.jsonl')), 'non-date directories should be retained');

    console.log(JSON.stringify({ ok: true, cases: 13 }, null, 2));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    await runSelfTest();
    return;
  }
  const result = await cleanupDetailedLogs(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printReport(result);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}

module.exports = {
  cleanupDetailedLogs,
  collectCleanupTargets,
  normalizeRetentionDays,
  retentionCutoffStartMs,
  localDayName,
  runSelfTest
};
