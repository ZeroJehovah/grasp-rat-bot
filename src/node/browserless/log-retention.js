'use strict';

const fs = require('fs');
const path = require('path');
const { DAY_MS, utc8DayKey, utc8DayStartMs } = require('./utc8-day');

const DAY_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RETENTION_INTERVAL_MS = 60 * 60 * 1000;

function retentionCutoffDay(options = {}) {
  const keepDays = Math.max(1, Number(options.keepDays || 2));
  const nowMs = Number(options.nowMs || Date.now());
  return utc8DayKey(utc8DayStartMs(nowMs) - (keepDays - 1) * DAY_MS);
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

function startLogRetentionScheduler(logDir, options = {}) {
  const keepDays = Math.max(1, Number(options.keepDays || 2));
  const intervalMs = Math.max(1000, Number(options.intervalMs || DEFAULT_RETENTION_INTERVAL_MS));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const schedule = typeof options.setInterval === 'function' ? options.setInterval : setInterval;
  const cancel = typeof options.clearInterval === 'function' ? options.clearInterval : clearInterval;
  let stopped = false;

  const run = () => {
    if (stopped) return null;
    try {
      const result = cleanupOldLogDays(logDir, { keepDays, nowMs: now() });
      if (typeof options.onResult === 'function') options.onResult(result);
      return result;
    } catch (err) {
      if (typeof options.onError === 'function') options.onError(err);
      return { ok: false, error: err?.message || String(err) };
    }
  };

  const timer = schedule(run, intervalMs);
  if (options.unref !== false && typeof timer?.unref === 'function') timer.unref();

  return {
    intervalMs,
    run,
    stop() {
      if (stopped) return;
      stopped = true;
      cancel(timer);
    }
  };
}

module.exports = {
  DEFAULT_RETENTION_INTERVAL_MS,
  cleanupOldLogDays,
  retentionCutoffDay,
  startLogRetentionScheduler
};
