#!/usr/bin/env node
'use strict';

const http = require('http');

const cdpBase = process.env.CDP_URL || process.argv[2] || 'http://172.24.0.1:9224';
const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top/';

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url}: ${err.message}`));
        }
      });
    }).on('error', reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !this.pending.has(msg.id)) return;
      const pending = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? pending.reject(new Error(JSON.stringify(msg.error))) : pending.resolve(msg.result);
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  const pages = await getJson(`${cdpBase.replace(/\/$/, '')}/json/list`);
  const page = pages.find(item => item.type === 'page' && item.url.startsWith(GAME_ORIGIN));
  if (!page) throw new Error(`Game page not found at ${GAME_ORIGIN}`);
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  const result = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const bot = window.__graspRatBot;
        if (!bot) return { running: false, message: 'bot not found' };
        const before = bot.status ? bot.status() : { running: bot.running };
        if (bot.stop) bot.stop('stop script');
        const after = bot.status ? bot.status() : { running: bot.running };
        return { before, after };
      })()
    `,
    returnByValue: true,
  });
  console.log(JSON.stringify(result.result.value, null, 2));
  cdp.close();
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
