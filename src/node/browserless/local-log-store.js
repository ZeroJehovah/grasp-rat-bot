'use strict';

const fs = require('fs');
const path = require('path');
const { redactStructuredSecrets } = require('./session-client');

const DEFAULT_STREAMS = new Set(['runner', 'decisions', 'combat', 'exits']);

function utcDay(ms) {
  return new Date(Number(ms)).toISOString().slice(0, 10);
}

function sanitizeStreamName(stream) {
  const value = String(stream || '').trim();
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`invalid log stream: ${stream}`);
  return value;
}

function createLocalLogStore(options = {}) {
  const logDir = path.resolve(String(options.logDir || path.join(process.cwd(), 'data', 'logs')));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const allowedStreams = options.allowedStreams
    ? new Set(Array.from(options.allowedStreams).map(sanitizeStreamName))
    : DEFAULT_STREAMS;

  function dayDirFor(ms = now()) {
    return path.join(logDir, utcDay(ms));
  }

  function fileFor(stream, ms = now()) {
    const safeStream = sanitizeStreamName(stream);
    if (allowedStreams && !allowedStreams.has(safeStream)) throw new Error(`unsupported log stream: ${safeStream}`);
    return path.join(dayDirFor(ms), `${safeStream}.jsonl`);
  }

  function append(stream, type, detail = {}, optionsForEntry = {}) {
    const atMs = Number(optionsForEntry.atMs || now());
    const file = fileFor(stream, atMs);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const entry = {
      at: new Date(atMs).toISOString(),
      type: String(type || 'event'),
      detail: redactStructuredSecrets(detail || {})
    };
    fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    return { file, entry };
  }

  function readEntries(stream, day = utcDay(now())) {
    const file = path.join(logDir, String(day), `${sanitizeStreamName(stream)}.jsonl`);
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }

  return {
    append,
    dayDirFor,
    fileFor,
    logDir,
    readEntries
  };
}

module.exports = {
  createLocalLogStore,
  sanitizeStreamName,
  utcDay
};
