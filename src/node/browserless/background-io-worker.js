'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { performance } = require('perf_hooks');
const { parentPort } = require('worker_threads');
const {
  redactStructuredSecrets,
  stringifyRedactedJson
} = require('./session-client');
const {
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus
} = require('./state-file');

let processed = 0;
let temporarySequence = 0;
const jsonStateCache = new Map();
const chatHistoryWriters = new Map();

// Linux schedules nice values per thread. Keep the realtime WebSocket main
// thread at its inherited priority and let background logging/status work use
// frame gaps when CPU is saturated. Failure to adjust priority is non-fatal on
// platforms or containers that do not permit it; all queue/flush semantics stay
// unchanged.
if (process.platform === 'linux') {
  try {
    if (os.getPriority(0) < 10) os.setPriority(0, 10);
  } catch (_) {}
}

function appendLog(message) {
  const file = path.resolve(String(message.file || ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entry = {
    at: new Date(Number(message.atMs || Date.now())).toISOString(),
    type: String(message.type || 'event'),
    detail: message.detail || {}
  };
  fs.appendFileSync(file, stringifyRedactedJson(entry) + '\n');
}

function writeJsonFileAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  temporarySequence += 1;
  const temporary = `${file}.${process.pid}.${temporarySequence}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function writeJsonAtomic(message) {
  const file = path.resolve(String(message.file || ''));
  jsonStateCache.set(file, message.value);
  writeJsonFileAtomic(file, message.value);
}

function cachedJsonState(file) {
  if (jsonStateCache.has(file)) return jsonStateCache.get(file);
  let value = {};
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  jsonStateCache.set(file, value);
  return value;
}

function mergeJsonPatch(target, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const current = target[key];
      if (!current || typeof current !== 'object' || Array.isArray(current)) target[key] = {};
      mergeJsonPatch(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function deleteJsonPath(target, pathParts) {
  if (!target || typeof target !== 'object' || !Array.isArray(pathParts) || !pathParts.length) return;
  let owner = target;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    owner = owner?.[pathParts[index]];
    if (!owner || typeof owner !== 'object') return;
  }
  delete owner[pathParts[pathParts.length - 1]];
}

function writeJsonPatchAtomic(message) {
  const file = path.resolve(String(message.file || ''));
  const value = cachedJsonState(file);
  for (const pathParts of message.deletePaths || []) deleteJsonPath(value, pathParts);
  mergeJsonPatch(value, message.patch || {});
  writeJsonFileAtomic(file, value);
}

// Compress a finished per-battle JSONL file to `<file>.gz` and remove the raw
// file. Runs on the background worker so gzip never blocks the combat loop.
function finalizeGz(message) {
  const file = path.resolve(String(message.file || ''));
  if (!fs.existsSync(file)) return;
  const gzFile = `${file}.gz`;
  temporarySequence += 1;
  const temporary = `${gzFile}.${process.pid}.${temporarySequence}.tmp`;
  fs.writeFileSync(temporary, zlib.gzipSync(fs.readFileSync(file)));
  fs.renameSync(temporary, gzFile);
  fs.rmSync(file, { force: true });
}

// Append one already-structured object as a JSON line (used for the battle
// index). Values are redacted like ordinary logs.
function appendRawLine(message) {
  const file = path.resolve(String(message.file || ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, stringifyRedactedJson(message.value || {}) + '\n');
}

function appendChatHistory(message) {
  const file = path.resolve(String(message.file || ''));
  let writer = chatHistoryWriters.get(file);
  if (!writer) {
    const { createChatHistoryWriter } = require('./chat-history-store');
    writer = createChatHistoryWriter(file);
    chatHistoryWriters.set(file, writer);
  }
  writer.writeBatch(message.batch || {});
}

function renderStatus(message) {
  if (message.compact) return buildCompactBrowserlessStatus(message.state || {}, message.config || {});
  const state = message.state || {};
  return redactStructuredSecrets({
    ...buildPublicBrowserlessStatus(state, message.config || {}),
    highDropPlayers: state.highDropPlayers || null,
    easyKillPlayers: state.easyKillPlayers || null,
    dailyDamagePlayers: state.dailyDamagePlayers || null,
    dynamicWhitelist: state.dynamicWhitelist || null,
    chat: state.chat || null
  });
}

parentPort.on('message', message => {
  if (!message || typeof message !== 'object') return;
  if (message.kind === 'barrier') {
    parentPort.postMessage({ kind: 'barrier', id: message.id, processed });
    return;
  }
  try {
    if (message.kind === 'log') appendLog(message);
    else if (message.kind === 'json-atomic') writeJsonAtomic(message);
    else if (message.kind === 'json-patch-atomic') writeJsonPatchAtomic(message);
    else if (message.kind === 'finalize-gz') finalizeGz(message);
    else if (message.kind === 'append-raw-line') appendRawLine(message);
    else if (message.kind === 'chat-history') appendChatHistory(message);
    else if (message.kind === 'status-render') {
      const started = performance.now();
      const status = renderStatus(message);
      const text = JSON.stringify(status, null, 2);
      processed += 1;
      parentPort.postMessage({
        kind: 'status-render',
        id: message.id,
        text,
        bytes: Buffer.byteLength(text),
        computeMs: performance.now() - started,
        processed
      });
      return;
    }
    else throw new Error(`unsupported background IO operation: ${message.kind}`);
    processed += 1;
  } catch (error) {
    processed += 1;
    parentPort.postMessage({
      kind: 'error',
      id: message.id || 0,
      operation: String(message.kind || ''),
      file: String(message.file || ''),
      error: error?.message || String(error)
    });
  }
});
