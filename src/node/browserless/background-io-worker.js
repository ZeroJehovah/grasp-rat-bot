'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { parentPort } = require('worker_threads');
const { redactStructuredSecrets } = require('./session-client');
const {
  buildCompactBrowserlessStatus,
  buildPublicBrowserlessStatus
} = require('./state-file');

let processed = 0;
let temporarySequence = 0;

function appendLog(message) {
  const file = path.resolve(String(message.file || ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const entry = {
    at: new Date(Number(message.atMs || Date.now())).toISOString(),
    type: String(message.type || 'event'),
    detail: redactStructuredSecrets(message.detail || {})
  };
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

function writeJsonAtomic(message) {
  const file = path.resolve(String(message.file || ''));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  temporarySequence += 1;
  const temporary = `${file}.${process.pid}.${temporarySequence}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(message.value, null, 2) + '\n');
  fs.renameSync(temporary, file);
}

function renderStatus(message) {
  if (message.compact) return buildCompactBrowserlessStatus(message.state || {}, message.config || {});
  const state = message.state || {};
  return redactStructuredSecrets({
    ...buildPublicBrowserlessStatus(state, message.config || {}),
    highDropPlayers: state.highDropPlayers || null,
    easyKillPlayers: state.easyKillPlayers || null,
    dailyDamagePlayers: state.dailyDamagePlayers || null,
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
