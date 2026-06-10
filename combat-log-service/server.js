#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const DEFAULTS = {
  host: '127.0.0.1',
  port: 18765,
  dir: path.join(__dirname, 'logs'),
  maxBodyBytes: 8 * 1024 * 1024
};

function parseArgs(args) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--host') out.host = String(args[++i] || out.host);
    else if (arg === '--port') out.port = Math.max(1, Number(args[++i] || out.port) || out.port);
    else if (arg === '--dir') out.dir = path.resolve(args[++i] || out.dir);
    else if (arg === '--max-body-bytes') out.maxBodyBytes = Math.max(1024, Number(args[++i] || out.maxBodyBytes) || out.maxBodyBytes);
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
  console.log(`Usage: node server.js [options]

Options:
  --host <host>             Listen host. Default: ${DEFAULTS.host}
  --port <port>             Listen port. Default: ${DEFAULTS.port}
  --dir <dir>               Log output directory. Default: ./logs
  --max-body-bytes <bytes>  Maximum POST body. Default: ${DEFAULTS.maxBodyBytes}
`);
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2) + '\n';
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-private-network': 'true'
  });
  res.end(text);
}

function sanitizePart(value, fallback = 'unknown') {
  const text = String(value || fallback)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return text || fallback;
}

function datePart(value = Date.now()) {
  const d = new Date(Number(value) || Date.now());
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function entryTime(entry, fallback = Date.now()) {
  return Number(entry?.at || entry?.receivedAt || fallback) || fallback;
}

function combatFilePath(rootDir, payload, entry) {
  const combatId = sanitizePart(payload.combatId || entry?.combatId || 'combat');
  const day = datePart(payload.startedAt || entryTime(entry));
  return path.join(rootDir, day, `${combatId}.jsonl`);
}

function normalizeEntries(payload) {
  if (Array.isArray(payload.entries)) return payload.entries;
  if (payload.entry && typeof payload.entry === 'object') return [payload.entry];
  return [payload];
}

function readBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error(`request body exceeds ${maxBodyBytes} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function appendCombatLog(options, payload, req) {
  if (!payload || typeof payload !== 'object') throw new Error('payload must be an object');
  const entries = normalizeEntries(payload);
  if (!entries.length) return { entries: 0, files: [] };
  const files = new Map();
  const receivedAt = Date.now();
  for (const raw of entries) {
    const entry = raw && typeof raw === 'object' ? raw : { value: raw };
    const filePath = combatFilePath(options.dir, payload, entry);
    const record = {
      ...entry,
      combatId: entry.combatId || payload.combatId || '',
      receivedAt,
      collector: {
        remoteAddress: req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      }
    };
    const line = JSON.stringify(record) + '\n';
    files.set(filePath, (files.get(filePath) || '') + line);
  }
  for (const [filePath, text] of files) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.appendFile(filePath, text);
  }
  return { entries: entries.length, files: Array.from(files.keys()).map(file => path.relative(options.dir, file)) };
}

function createServer(options) {
  return http.createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-private-network', 'true');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, service: 'grasp-rat-combat-log-service', dir: options.dir });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/combat-log') {
      sendJson(res, 404, { ok: false, error: 'not found' });
      return;
    }
    try {
      const body = await readBody(req, options.maxBodyBytes);
      const payload = body ? JSON.parse(body) : null;
      const result = await appendCombatLog(options, payload, req);
      sendJson(res, 200, { ok: true, ...result });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err?.message || String(err) });
    }
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.dir, { recursive: true });
  const server = createServer(options);
  server.listen(options.port, options.host, () => {
    console.log(JSON.stringify({
      ok: true,
      service: 'grasp-rat-combat-log-service',
      endpoint: `http://${options.host}:${options.port}/combat-log`,
      health: `http://${options.host}:${options.port}/health`,
      dir: options.dir
    }, null, 2));
  });
}

if (require.main === module) main();

module.exports = { createServer, appendCombatLog, parseArgs };
