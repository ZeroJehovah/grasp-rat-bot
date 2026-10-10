'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const zlib = require('node:zlib');
const { WebSocketServer } = require('ws');
const { openBrowserlessWs } = require('./ws-transport');
const { inspectCanaryFrame } = require('./canary');
const { createFrameStats, updateFrameStats } = require('./frame-stats');

function binaryFrame(payload) {
  return Buffer.concat([
    Buffer.from('GRZ1'),
    Buffer.from([1]),
    zlib.gzipSync(Buffer.from(JSON.stringify(payload)))
  ]);
}

async function exchange(options = {}) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const frames = [];
  const commands = [];
  const stats = createFrameStats();
  let requestEvidence;
  let handle;
  let timer;
  let finish;
  const received = new Promise((resolve, reject) => {
    finish = () => { if (frames.length === 3 && commands.length === 2) resolve(); };
    timer = setTimeout(() => reject(new Error('local WebSocket exchange timed out')), 5000);
  });
  server.on('connection', (socket, request) => {
    requestEvidence = {
      sourceIp: request.socket.remoteAddress,
      origin: request.headers.origin,
      extensions: request.headers['sec-websocket-extensions'] || ''
    };
    socket.on('message', data => { commands.push(data.toString()); finish(); });
    socket.send(binaryFrame({
      type: 'snapshot', tick: 100,
      entities: [{ user_id: 7, entity_id: 1, hp: 100, x: 100, y: 200 }], bullets: []
    }));
    socket.send(binaryFrame({
      type: 'pos', tick: 101,
      entities: [{ user_id: 7, entity_id: 1, hp: 99, x: 150, y: 200 }], bullets: []
    }));
    socket.send(JSON.stringify({ type: 'shoot_ok', bullet_id: 2, owner_user_id: 7 }));
  });
  try {
    handle = await openBrowserlessWs({
      wsUrl: `ws://127.0.0.1:${server.address().port}`,
      gameOrigin: 'https://transport-self-test.invalid',
      localAddress: '127.0.0.2',
      connectTimeoutMs: 2000,
      ...options,
      onMessage(event) {
        const frame = inspectCanaryFrame(event, { userId: 7 });
        frames.push(frame);
        updateFrameStats(stats, frame, Date.now());
        finish();
      }
    });
    handle.sendVelocity(1, 0);
    handle.sendShoot(100, 200, 0, 0);
    await received;
    return {
      runtime: handle.runtime.name,
      supportsOptions: handle.runtime.supportsOptions,
      binaryType: handle.ws.binaryType,
      frames, stats, commands, requestEvidence
    };
  } finally {
    clearTimeout(timer);
    handle?.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise(resolve => server.close(resolve));
  }
}

async function runWsTransportSelfTest() {
  const results = [];
  const check = (name, condition) => {
    assert.ok(condition, name);
    results.push({ name, ok: true });
  };
  const verifyFrames = (label, result) => {
    check(`${label}: binary snapshots, positions and text ACKs decode in wire order`,
      result.frames.map(frame => frame.decodedType).join(',') === 'snapshot,pos,shoot_ok');
    check(`${label}: compressed native frames establish and update realtime self`,
      result.frames[0].decodedSummary?.selfPresent === true
        && result.frames[1].decodedSummary?.self?.hp === 99
        && result.frames[1].decodedTick === 101);
    check(`${label}: all received frames decode with correct binary/text counts`,
      result.stats.frameCount === 3 && result.stats.decodedFrameCount === 3
        && result.stats.binaryFrameCount === 2 && result.stats.textFrameCount === 1
        && result.stats.decodeErrors === 0);
    check(`${label}: movement and shooting commands reach the server`,
      result.commands.join('|') === 'vel 1 0|shoot 100 200 0 0');
  };

  // Exercise the real default runtime and real MessageEvents; mocked Buffer
  // delivery cannot detect Node's global WebSocket/Blob compatibility regression.
  const production = await exchange();
  verifyFrames('production runtime', production);
  check('production runtime keeps the option-capable ws dependency on every Node version',
    production.runtime === 'ws-package' && production.supportsOptions === true);
  check('selected source IP is actually bound on the wire',
    production.requestEvidence.sourceIp === '127.0.0.2');
  check('game Origin reaches the handshake and per-message compression stays disabled',
    production.requestEvidence.origin === 'https://transport-self-test.invalid'
      && production.requestEvidence.extensions === '');

  if (typeof globalThis.WebSocket === 'function') {
    const native = await exchange({
      WebSocketImpl: globalThis.WebSocket, runtimeName: 'explicit-native', localAddress: ''
    });
    verifyFrames('explicit native runtime', native);
    check('explicit native runtime normalizes binary input before the first frame',
      native.binaryType === 'arraybuffer');
  }
  return { ok: true, cases: results.length, results };
}

if (require.main === module) {
  runWsTransportSelfTest().then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { runWsTransportSelfTest };
