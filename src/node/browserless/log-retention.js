'use strict';

const fs = require('fs');
const path = require('path');

const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;

function utcDayStartMs(ms) {
  const date = new Date(Number(ms));
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dayStringFromMs(ms) {
  return new Date(Number(ms)).toISOString().slice(0, 10);
}

function retentionCutoffDay(options = {}) {
  const keepDays = Math.max(1, Number(options.keepDays || 3));
  const nowMs = Number(options.nowMs || Date.now());
  return dayStringFromMs(utcDayStartMs(nowMs) - (keepDays - 1) * 86400000);
}

function cleanupOldLogDays(logDir, options = {}) {
  const root = path.resolve(String(logDir || ''));
  const cutoffDay = retentionCutoffDay(options);
  const removed = [];
  const kept = [];
  if (!fs.existsSync(root)) return { logDir: root, cutoffDay, removed, kept };
  for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory() || !DAY_DIR_RE.test(dirent.name)) continue;
    const fullPath = path.join(root, dirent.name);
    if (dirent.name < cutoffDay) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removed.push(dirent.name);
    } else {
      kept.push(dirent.name);
    }
  }
  removed.sort();
  kept.sort();
  return { logDir: root, cutoffDay, removed, kept };
}

module.exports = {
  cleanupOldLogDays,
  dayStringFromMs,
  retentionCutoffDay,
  utcDayStartMs
};
