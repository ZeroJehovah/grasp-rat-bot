#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = __dirname;

function parseArgs(args) {
  const out = {
    host: process.env.GRASP_RAT_DEBUG_HOST || '0.0.0.0',
    port: Number(process.env.GRASP_RAT_DEBUG_PORT || 18777),
    logFile: process.env.GRASP_RAT_DEBUG_LOG || path.join(ROOT, 'grasp-rat-debug-events.log'),
    distDir: process.env.GRASP_RAT_DIST_DIR || path.join(ROOT, 'dist'),
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--host') out.host = args[++i] || out.host;
    else if (arg === '--port') out.port = Number(args[++i] || out.port);
    else if (arg === '--log-file') out.logFile = path.resolve(args[++i] || out.logFile);
    else if (arg === '--dist-dir') out.distDir = path.resolve(args[++i] || out.distDir);
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
  console.log(`Usage: node grasp-rat-debug-api.js [options]

Receives browser debug events and optionally serves generated bot files.

Options:
  --host <host>       Listen host. Default: 0.0.0.0
  --port <port>       Listen port. Default: 18777
  --log-file <path>   JSONL event log. Default: grasp-rat-debug-events.log
  --dist-dir <dir>    Directory served under /bot/. Default: dist
`);
}

const options = parseArgs(process.argv.slice(2));
const recent = [];

function send(res, status, body, headers = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(text);
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > maxBytes) reject(new Error('request body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function recordEvent(rawBody) {
  let event;
  try {
    event = JSON.parse(rawBody || '{}');
  } catch (_) {
    event = { raw: rawBody };
  }
  const wrapped = {
    receivedAt: new Date().toISOString(),
    ...event,
  };
  recent.push(wrapped);
  while (recent.length > 200) recent.shift();
  fs.appendFile(options.logFile, JSON.stringify(wrapped) + '\n', err => {
    if (err) process.stderr.write(`debug log write failed: ${err.message || String(err)}\n`);
  });
  return wrapped;
}

function serveBotFile(req, res) {
  const url = new URL(req.url, 'http://debug.local');
  const rel = decodeURIComponent(url.pathname.replace(/^\/bot\/?/, '')) || 'manifest.json';
  if (rel.includes('..') || path.isAbsolute(rel)) {
    send(res, 400, { error: 'invalid path' });
    return;
  }
  const file = path.join(options.distDir, rel);
  fs.readFile(file, (err, data) => {
    if (err) {
      send(res, 404, { error: 'not found', path: rel });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = ext === '.json' ? 'application/json' : 'application/javascript';
    send(res, 200, data.toString('utf8'), { 'Content-Type': `${type}; charset=utf-8` });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      send(res, 204, '');
      return;
    }
    const url = new URL(req.url, 'http://debug.local');
    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, { ok: true, recentEvents: recent.length, logFile: options.logFile, distDir: options.distDir });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      send(res, 200, recent.slice(-50));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/events') {
      const body = await readBody(req);
      const event = recordEvent(body);
      const compact = event.status?.lastDecision || event.detail?.decision || event.detail || {};
      console.log(JSON.stringify({ at: event.receivedAt, type: event.type || '', version: event.version || event.status?.version || '', action: compact.kind || null, reason: compact.reason || null }));
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === 'GET' && (url.pathname === '/bot' || url.pathname.startsWith('/bot/'))) {
      serveBotFile(req, res);
      return;
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: err.message || String(err) });
  }
});

server.listen(options.port, options.host, () => {
  console.log(JSON.stringify({ listening: true, host: options.host, port: options.port, logFile: options.logFile, distDir: options.distDir }, null, 2));
});
