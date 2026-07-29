'use strict';

const { parentPort } = require('worker_threads');
const { leaveWithVerification } = require('./leave-client');
const { prewarmGameConnection } = require('./session-client');

let activeLeaveId = null;

function errorMessage(error) {
  return error?.stack || error?.message || String(error || 'leave supervisor worker failure');
}

function post(message) {
  parentPort.postMessage(message);
}

async function runPrewarm(message) {
  try {
    const result = await prewarmGameConnection(message.options || {});
    post({ kind: 'prewarm-result', id: message.id, result });
  } catch (error) {
    post({ kind: 'request-error', id: message.id, operation: 'prewarm', error: errorMessage(error) });
  }
}

async function runLeave(message) {
  if (activeLeaveId !== null) {
    post({
      kind: 'request-error',
      id: message.id,
      operation: 'leave',
      error: `leave supervisor already has active request ${activeLeaveId}`
    });
    return;
  }
  activeLeaveId = message.id;
  try {
    const result = await leaveWithVerification({
      ...(message.options || {}),
      onRequest: request => post({ kind: 'leave-request', id: message.id, request }),
      onResult: attempt => post({ kind: 'leave-attempt', id: message.id, attempt })
    });
    post({ kind: 'leave-result', id: message.id, result });
  } catch (error) {
    post({ kind: 'request-error', id: message.id, operation: 'leave', error: errorMessage(error) });
  } finally {
    activeLeaveId = null;
  }
}

parentPort.on('message', message => {
  if (!message || typeof message !== 'object') return;
  if (message.kind === 'prewarm') {
    runPrewarm(message);
    return;
  }
  if (message.kind === 'leave') {
    runLeave(message);
    return;
  }
  if (message.kind === 'status') {
    post({ kind: 'status', id: message.id, activeLeaveId });
    return;
  }
  post({
    kind: 'request-error',
    id: message.id || 0,
    operation: String(message.kind || ''),
    error: `unsupported leave supervisor operation: ${message.kind || ''}`
  });
});

post({ kind: 'ready' });
