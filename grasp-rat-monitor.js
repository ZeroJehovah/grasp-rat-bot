#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile, spawn } = require('child_process');

const DEFAULT_CDP = process.env.GRASP_RAT_MONITOR_CDP || process.env.CDP_URL || 'http://172.24.0.1:9224';
const BOT_CDP = process.env.GRASP_RAT_BOT_CDP || process.env.CDP_URL || DEFAULT_CDP;
const GAME_ORIGIN = 'https://grasp-rat-game.h-e.top/';
const GAME_AUTH_CALLBACK_PREFIX = `${GAME_ORIGIN}auth/linuxdo/callback`;
const AUTH_ORIGIN = 'https://connect.linux.do/oauth2/authorize';
const TOOL_DIR = __dirname;
const BOT_SCRIPT = path.join(TOOL_DIR, 'grasp-rat-bot.js');
const PID_FILE = path.join(TOOL_DIR, 'grasp-rat-monitor.pid');
const LOG_FILE = path.join(TOOL_DIR, 'grasp-rat-monitor.log');
const STATE_FILE = path.join(TOOL_DIR, 'grasp-rat-monitor-state.json');
const CDP_HTTP_TIMEOUT_MS = 1000;
const CDP_FAST_COMMAND_TIMEOUT_MS = 1000;
const CDP_CONNECT_TIMEOUT_MS = 5500;
const CDP_ENABLE_TIMEOUT_MS = 2500;
const MAX_SAFE_OFFLINE_MS = 3000;
const OAUTH_CALLBACK_GRACE_MS = 1400;
const GAME_ENTRY_BLANK_GRACE_MS = 2500;
const GAME_ENTRY_RELOAD_COOLDOWN_MS = 5000;
const POST_LOGIN_INSTALL_STABILITY_MS = 120;
const POST_LOGIN_SYNC_GRACE_MS = 1000;
const POST_LOGIN_SELF_CONFIRM_MS = 2200;
const AUTHORIZE_READY_WAIT_MS = 180;
const RATE_LIMIT_COOLDOWN_MS = 30000;

const options = parseArgs(process.argv.slice(2));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs(args) {
  const out = {
    cdp: DEFAULT_CDP,
    intervalMs: 10000,
    once: false,
    daemon: false,
    supervisor: false,
    stop: false,
    pidFile: PID_FILE,
    logFile: LOG_FILE,
    stateFile: STATE_FILE,
    maxTickAgeMs: 15000,
    reinstallCooldownMs: 20000,
    leaveOfflineMs: 0,
    safeLeaveOfflineMs: 3000,
    directReconnectCooldownMs: 1000,
    reloginCooldownMs: 30000,
    reloadOfflineMs: 45000,
    reloadStuckMs: 45000,
    postLoginInstallWaitMs: 10000,
    authPollMs: 50,
    authorizeClickCooldownMs: 25,
    recoveryFastFollowMs: 50,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--cdp') out.cdp = args[++i];
    else if (arg === '--interval-ms') out.intervalMs = Number(args[++i] || out.intervalMs);
    else if (arg === '--once') out.once = true;
    else if (arg === '--daemon') out.daemon = true;
    else if (arg === '--supervisor') out.supervisor = true;
    else if (arg === '--stop') out.stop = true;
    else if (arg === '--pid-file') out.pidFile = args[++i];
    else if (arg === '--log-file') out.logFile = args[++i];
    else if (arg === '--state-file') out.stateFile = args[++i];
    else if (arg === '--max-tick-age-ms') out.maxTickAgeMs = Number(args[++i] || out.maxTickAgeMs);
    else if (arg === '--leave-offline-ms') out.leaveOfflineMs = Number(args[++i] || out.leaveOfflineMs);
    else if (arg === '--safe-leave-offline-ms') out.safeLeaveOfflineMs = Number(args[++i] || out.safeLeaveOfflineMs);
    else if (arg === '--direct-reconnect-cooldown-ms') out.directReconnectCooldownMs = Number(args[++i] || out.directReconnectCooldownMs);
    else if (arg === '--relogin-cooldown-ms') out.reloginCooldownMs = Number(args[++i] || out.reloginCooldownMs);
    else if (arg === '--post-login-install-wait-ms') out.postLoginInstallWaitMs = Number(args[++i] || out.postLoginInstallWaitMs);
    else if (arg === '--auth-poll-ms') out.authPollMs = Number(args[++i] || out.authPollMs);
    else if (arg === '--authorize-click-cooldown-ms') out.authorizeClickCooldownMs = Number(args[++i] || out.authorizeClickCooldownMs);
    else if (arg === '--recovery-fast-follow-ms') out.recoveryFastFollowMs = Number(args[++i] || out.recoveryFastFollowMs);
    else if (arg === '--max-relogin-attempts') i += 1;
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
  console.log(`Usage: node grasp-rat-monitor.js [options]

Keeps the already-injected grasp-rat bot active through CDP.

Options:
  --cdp <url>             CDP HTTP base URL. Default: ${DEFAULT_CDP}
  --interval-ms <ms>      Delay after each monitor cycle. Default: 10000
  --once                  Run one monitor cycle and exit
  --daemon                Start detached in the background
  --supervisor            Internal: run one-shot monitor children repeatedly
  --stop                  Stop the daemon pid in ${PID_FILE}
  --pid-file <path>       PID file path
  --log-file <path>       Daemon log path
  --state-file <path>     Persist monitor state between supervisor child runs
  --max-tick-age-ms <ms>  Reinstall if the bot tick is stale after a step
  --leave-offline-ms <ms> Leave immediately when offline in an unsafe area. Default: 0
  --safe-leave-offline-ms <ms>
                          Leave when offline in a safe area. Default: 3000
  --direct-reconnect-cooldown-ms <ms>
                          Minimum time between direct page reconnect nudges. Default: 1000
  --relogin-cooldown-ms <ms>
                          Minimum time between OAuth login attempts. Default: 30000
  --post-login-install-wait-ms <ms>
                          Poll for game return and inject after login. Default: 10000
  --auth-poll-ms <ms>     Fast poll interval after login/authorize. Default: 50
  --authorize-click-cooldown-ms <ms>
                          Minimum time between authorize clicks. Default: 25
  --recovery-fast-follow-ms <ms>
                          Supervisor delay after login/authorize/recovery events. Default: 50
`);
}

function getJson(url, timeoutMs = CDP_HTTP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`Invalid JSON from ${url}: ${err.message}\n${body.slice(0, 500)}`));
        }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout fetching ${url}`)));
    req.on('error', reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.ws = null;
  }

  async connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('This script requires Node.js with global WebSocket support.');
    }
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { this.ws.close(); } catch (_) {}
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error(`CDP connect timeout: ${this.wsUrl}`)), CDP_CONNECT_TIMEOUT_MS);
      this.ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      this.ws.onerror = (event) => {
        fail(new Error(`CDP connect failed: ${event?.message || this.wsUrl}`));
      };
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !this.pending.has(msg.id)) return;
      const pending = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      msg.error ? pending.reject(new Error(JSON.stringify(msg.error))) : pending.resolve(msg.result);
    };
  }

  send(method, params = {}, timeoutMs = 5000, sessionId = '') {
    const id = ++this.id;
    const message = sessionId ? { id, method, params, sessionId } : { id, method, params };
    this.ws.send(JSON.stringify(message));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close() {
    for (const pending of this.pending.values()) clearTimeout(pending.timer);
    this.pending.clear();
    if (this.ws) this.ws.close();
  }
}

async function listPages(cdpBase) {
  return getJson(`${cdpBase.replace(/\/$/, '')}/json/list`);
}

function isGameHostPage(page) {
  return page?.type === 'page' && String(page.url || '').startsWith(GAME_ORIGIN);
}

function isGameRecoveryPage(page) {
  const url = String(page?.url || '');
  return isGameHostPage(page) && url.startsWith(GAME_AUTH_CALLBACK_PREFIX);
}

function isGamePage(page) {
  return isGameHostPage(page) && !isGameRecoveryPage(page);
}

function isAuthorizePage(page) {
  return page?.type === 'page' && String(page.url || '').startsWith(AUTH_ORIGIN);
}

function pageCanInstallBot(pageInfo) {
  return isGamePage(pageInfo)
    && Boolean(pageInfo?.hasToken || pageInfo?.hasSelf || pageInfo?.inGame);
}

async function findGamePage(cdpBase) {
  const pages = await listPages(cdpBase);
  const page = pages.find(isGamePage);
  if (!page) throw new Error(`Game page not found at ${GAME_ORIGIN}`);
  return page;
}

function shouldPreferRecoveryPage(state) {
  return Boolean(state?.leftForOffline || state?.offlineSince);
}

async function findRelevantPage(cdpBase, state = null) {
  const pages = await listPages(cdpBase);
  if (shouldPreferRecoveryPage(state)) {
    const recovery = pages.find(isGameRecoveryPage);
    if (recovery) return { kind: 'game-recovery', page: recovery };
    const authorize = pages.find(isAuthorizePage);
    if (authorize) return { kind: 'authorize', page: authorize };
  }
  const game = pages.find(isGamePage);
  if (game) return { kind: 'game', page: game };
  const authorize = pages.find(isAuthorizePage);
  if (authorize) return { kind: 'authorize', page: authorize };
  const recovery = pages.find(isGameRecoveryPage);
  if (recovery) return { kind: 'game-recovery', page: recovery };
  const summary = pages
    .filter(item => item.type === 'page')
    .map(item => `${item.title || '(untitled)'} ${item.url}`)
    .slice(0, 8)
    .join(' | ');
  throw new Error(`Game or LinuxDO authorize page not found. Current pages: ${summary}`);
}

async function currentPageInfo(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (() => {
        const status = window.__graspRatBot?.status?.() || null;
        const nativeState = (() => {
          try { return typeof state === 'object' && state ? state : null; } catch (_) { return null; }
        })();
        const nativeWs = nativeState?.ws || null;
        const nativeWsOpen = Boolean(nativeState?.wsOpen && nativeWs && nativeWs.readyState === WebSocket.OPEN);
        const own = typeof getOwnEntity === 'function' ? getOwnEntity() : null;
        return {
          type: 'page',
          title: document.title || '',
          url: location.href || '',
          readyState: document.readyState || '',
          currentUserId: Number(localStorage.getItem('tmpGameUserId') || document.getElementById('userId')?.value || status?.control?.currentUserId || 0),
          hasToken: Boolean(localStorage.getItem('tmpGameSessionToken') || status?.control?.hasToken),
          hasLoginControl: Boolean(typeof startLinuxDoLogin === 'function' || document.querySelector('#joinBtn')),
          hasBot: Boolean(window.__graspRatBot),
          hasSelf: Boolean(own),
          inGame: Boolean(own && own.life !== 'Dead' && own.life !== 'WaitingRevive'),
          wsOpen: Boolean(status?.control?.wsOpen || nativeWsOpen),
          statusText: document.getElementById('status')?.textContent || ''
        };
      })()
    `,
  }, CDP_FAST_COMMAND_TIMEOUT_MS);
  if (result.exceptionDetails) {
    throw new Error(`current page probe failed: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result.value;
}

function startDaemon() {
  const args = process.argv.slice(2).filter(arg => arg !== '--daemon');
  const logFd = fs.openSync(options.logFile, 'a');
  const child = spawn(process.execPath, [__filename, '--supervisor', ...args], {
    cwd: path.dirname(TOOL_DIR),
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  });
  child.unref();
  fs.writeFileSync(options.pidFile, String(child.pid));
  console.log(JSON.stringify({ started: true, pid: child.pid, pidFile: options.pidFile, logFile: options.logFile }, null, 2));
}

function runOnceChild() {
  const args = process.argv
    .slice(2)
    .filter(arg => arg !== '--supervisor' && arg !== '--daemon' && arg !== '--once');
  return new Promise((resolve) => {
    const timeoutMs = Math.max(
      15000,
      Math.min(
        90000,
        options.intervalMs
          + options.safeLeaveOfflineMs
          + options.postLoginInstallWaitMs
          + 15000
      )
    );
    execFile(process.execPath, [__filename, '--once', ...args], {
      cwd: path.dirname(TOOL_DIR),
      timeout: timeoutMs,
      env: process.env,
    }, (err, stdout, stderr) => {
      if (stdout.trim()) process.stdout.write(stdout.trim() + '\n');
      if (stderr.trim()) process.stderr.write(stderr.trim() + '\n');
      if (err) {
        log('error', null, [{ severity: 'critical', reason: err.message || String(err) }], (stderr || err.stack || '').slice(0, 500));
      }
      resolve(parseMonitorEvents(stdout, stderr, err));
    });
  });
}

function parseMonitorEvents(stdout, stderr, err) {
  const events = String(stdout || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
  return {
    events,
    stderr: String(stderr || ''),
    errored: Boolean(err)
  };
}

function shouldFastFollowRun(run) {
  if (!run) return false;
  const fastEvents = new Set([
    'authorize',
    'authorize-wait',
    'callback-wait',
	    'game-entry',
	    'game-entry-wait',
	    'login',
	    'leave-offline',
	    'leave-failed',
	    'post-login-install',
    'post-login-sync-wait',
    'post-login-wait-timeout',
    'reload',
    'reinstall'
  ]);
  return run.events.some(event => {
    if ((event.event === 'login-wait' || event.event === 'leave-wait') && /cooldown/i.test(String(event.detail || ''))) return false;
    if (fastEvents.has(event.event)) return true;
    const issues = Array.isArray(event.issues) ? event.issues.join(' | ') : '';
    if (isCdpConnectivityOnly(issues)) return false;
    return /websocket offline|bot missing|bot stopped|stale tick|linuxdo authorize/i.test(issues);
  }) || (run.errored && !run.events.some(event => isCdpConnectivityOnly(Array.isArray(event.issues) ? event.issues.join(' | ') : '')));
}

function isCdpConnectivityOnly(text) {
  return /CDP connect timeout|CDP connect failed|browser target fallback failed/i.test(String(text || ''));
}

function stopDaemon() {
  if (!fs.existsSync(options.pidFile)) {
    console.log(JSON.stringify({ stopped: false, reason: 'pid file not found', pidFile: options.pidFile }, null, 2));
    return;
  }
  const pid = Number(fs.readFileSync(options.pidFile, 'utf8').trim());
  if (!pid) throw new Error(`Invalid pid file: ${options.pidFile}`);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    if (err.code !== 'ESRCH') throw err;
  }
  fs.rmSync(options.pidFile, { force: true });
  console.log(JSON.stringify({ stopped: true, pid }, null, 2));
}

function installBot(pageWs = '') {
  const args = pageWs ? [BOT_SCRIPT, '--page-ws', pageWs] : [BOT_SCRIPT];
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, {
      cwd: path.dirname(TOOL_DIR),
      timeout: 30000,
      env: { ...process.env, CDP_URL: BOT_CDP },
    }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

function getBotSource() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [BOT_SCRIPT, '--print-source'], {
      cwd: path.dirname(TOOL_DIR),
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CDP_URL: BOT_CDP },
    }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

async function installBotInPage(cdp) {
  const source = await getBotSource();
  const result = await cdp.send('Runtime.evaluate', {
    expression: source,
    awaitPromise: true,
    returnByValue: true,
  }, 30000);
  if (result.exceptionDetails) {
    throw new Error(`inline bot install failed: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  const confirmed = await confirmBotInPage(cdp);
  return {
    stdout: [
      'Injected bot through active CDP page:',
      JSON.stringify(confirmed || result.result.value, null, 2),
      'Bot is running inside the browser page. Stop with: node grasp-rat-stop.js'
    ].join('\n'),
    stderr: ''
  };
}

async function installBotInPageAfterLogin(cdp) {
  const install = await installBotInPage(cdp);
  await sleep(POST_LOGIN_INSTALL_STABILITY_MS);
  const current = await currentPageInfo(cdp);
  if (!pageCanInstallBot(current)) {
    throw new Error(`post-login install lost usable game page: url=${current.url || ''} token=${Boolean(current.hasToken)} self=${Boolean(current.hasSelf)} inGame=${Boolean(current.inGame)}`);
  }
  await confirmBotInPage(cdp, { requireSelf: true, timeoutMs: POST_LOGIN_SELF_CONFIRM_MS });
  return install;
}

function installSummary(install) {
  return install.stdout.split('\n').slice(-3).join('\n');
}

async function confirmBotInPage(cdp, options = {}) {
  const requireLive = Boolean(options.requireLive);
  const requireSelf = Boolean(options.requireSelf || requireLive);
  const deadline = Date.now() + Math.max(500, Number(options.timeoutMs || 2000));
  let lastError = '';
  while (Date.now() <= deadline) {
    const result = await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `
        (async () => {
          const bot = window.__graspRatBot || null;
          if (!bot?.status) return { running: false, message: 'bot not found' };
          if (bot.step) {
            const stepped = bot.step('post-install-confirm');
            if (stepped && typeof stepped.then === 'function') await stepped;
          }
          const status = bot.status();
          return {
            running: Boolean(status?.running),
            tickCount: Number(status?.tickCount || 0),
            lastTickAgeMs: status?.lastTickAgeMs ?? null,
            action: status?.lastDecision?.kind || null,
            reason: status?.lastDecision?.reason || null,
            wsOpen: Boolean(status?.control?.wsOpen),
            self: status?.self || status?.lastDecision?.self || null,
            errors: Array.isArray(status?.errors) ? status.errors.slice(-2) : []
          };
        })()
      `,
    }, 2500);
    if (result.exceptionDetails) {
      lastError = result.exceptionDetails.text || JSON.stringify(result.exceptionDetails);
    } else {
      const status = result.result.value;
      const hasSelf = Boolean(status?.self);
      const live = Boolean(status?.wsOpen && hasSelf);
      if (status?.running && Number(status.tickCount || 0) > 0
        && (!requireSelf || hasSelf)
        && (!requireLive || live)) return status;
      if (status?.running && requireLive && !live) {
        lastError = `waiting for live ws/self: wsOpen=${Boolean(status.wsOpen)} self=${Boolean(status.self)} action=${status.action || ''} reason=${status.reason || ''}`;
      } else if (status?.running && requireSelf && !hasSelf) {
        lastError = `waiting for self: wsOpen=${Boolean(status.wsOpen)} action=${status.action || ''} reason=${status.reason || ''}`;
      } else {
        lastError = status?.message || JSON.stringify(status || null);
      }
    }
    await sleep(100);
  }
  throw new Error(`inline bot install confirmation failed: ${lastError || 'timeout'}`);
}

async function injectWhenGameReturns(state, baseSample, issues, reason, currentCdp = null) {
  const deadline = Date.now() + Math.max(0, options.postLoginInstallWaitMs);
  let lastDetail = '';
  let lastListAt = 0;
  let lastInlineLoginAt = 0;
  while (Date.now() <= deadline) {
    try {
      if (currentCdp) {
        const current = await currentPageInfo(currentCdp);
        if (isGameRecoveryPage(current)) {
          await waitOrRecoverOAuthCallback(
            currentCdp,
            state,
            current,
            makePageSample(current, { statusText: reason, readyState: current.readyState }),
            issues,
            reason
          );
          lastDetail = `${current.url} callback`;
          continue;
        }

        clearOAuthCallbackState(state);
        if (isBlankGameEntry(current)) {
          await handleBlankGameEntry(
            currentCdp,
            state,
            current,
            makePageSample(current, { statusText: reason, readyState: current.readyState }),
            issues,
            reason
          );
          lastDetail = `${current.url} blank game entry`;
          continue;
        }

        if (isGamePage(current) && pageCanInstallBot(current)) {
          clearGameEntryBlankState(state);
          state.lastInstallAt = Date.now();
          state.lastPageWs = currentCdp.wsUrl;
          state.lastGamePageWs = currentCdp.wsUrl;
          const install = await installBotInPageAfterLogin(currentCdp);
          log('post-login-install', makePageSample(current, { statusText: reason, readyState: current.readyState }), issues, installSummary(install));
          return true;
        }

        if (isGamePage(current) && current.hasLoginControl && Date.now() - lastInlineLoginAt >= 250) {
          lastInlineLoginAt = Date.now();
          const loginSample = makePageSample(current, { statusText: reason, readyState: current.readyState });
          const started = await maybeStartRelogin(currentCdp, loginSample, issues, state, { reason: 'game entry login' });
          lastDetail = `${current.url} login=${started ? 'started' : 'blocked'}`;
          await sleep(started ? Math.max(25, Math.min(100, options.authPollMs)) : Math.max(250, options.authPollMs));
          continue;
        }

        if (isAuthorizePage(current) && Date.now() - Number(state.lastAuthorizeAt || 0) >= options.authorizeClickCooldownMs) {
          state.lastAuthorizeAt = Date.now();
          const clicked = await clickAuthorizeAllow(currentCdp);
          log('authorize', makePageSample(current, { statusText: reason, readyState: current.readyState }), issues, compactDetail(clicked));
          lastDetail = `${current.url} clicked`;
          await sleep(Math.max(25, Math.min(100, options.authPollMs)));
          continue;
        }
        lastDetail = `${current.url} ready=${current.readyState || ''}`;
        if (Date.now() - lastListAt < 150) {
          await sleep(Math.max(25, Math.min(100, options.authPollMs)));
          continue;
        }
      }

      lastListAt = Date.now();
      const pages = await listPages(options.cdp);
      const recovery = pages.find(isGameRecoveryPage);
      if (recovery) {
        let cdp = null;
        try {
          cdp = await connectToPage(recovery);
          const current = await currentPageInfo(cdp);
          await waitOrRecoverOAuthCallback(
            cdp,
            state,
            current,
            makePageSample(current, { statusText: reason, readyState: current.readyState }),
            issues,
            reason
          );
          lastDetail = `${current.url} callback`;
        } finally {
          if (cdp) cdp.close();
        }
        continue;
      }

      const authorize = pages.find(isAuthorizePage);
      if (authorize && Date.now() - Number(state.lastAuthorizeAt || 0) >= options.authorizeClickCooldownMs) {
        let cdp = null;
        try {
          cdp = await connectToPage(authorize);
          state.lastAuthorizeAt = Date.now();
          const clicked = await clickAuthorizeAllow(cdp);
          log('authorize', makePageSample(authorize, { statusText: reason }), issues, compactDetail(clicked));
        } finally {
          if (cdp) cdp.close();
        }
        await sleep(Math.max(25, Math.min(100, options.authPollMs)));
        continue;
      }

      const game = pages.find(isGamePage);
      if (game) {
        let cdp = null;
        try {
          cdp = await connectToPage(game);
          const current = await currentPageInfo(cdp);
          clearOAuthCallbackState(state);
          if (isBlankGameEntry(current)) {
            await handleBlankGameEntry(
              cdp,
              state,
              current,
              makePageSample(current, { statusText: reason, readyState: current.readyState }),
              issues,
              reason
            );
            lastDetail = `${current.url} blank game entry`;
            continue;
          }
          if (pageCanInstallBot(current)) {
            clearGameEntryBlankState(state);
            state.lastInstallAt = Date.now();
            state.lastPageWs = game.webSocketDebuggerUrl || state.lastPageWs;
            state.lastGamePageWs = game.webSocketDebuggerUrl || state.lastGamePageWs;
            const install = await installBotInPageAfterLogin(cdp);
            log('post-login-install', makePageSample(current, { statusText: reason, readyState: current.readyState }), issues, installSummary(install));
            return true;
          }
          if (current.hasLoginControl && Date.now() - lastInlineLoginAt >= 250) {
            lastInlineLoginAt = Date.now();
            const loginSample = makePageSample(current, { statusText: reason, readyState: current.readyState });
            const started = await maybeStartRelogin(cdp, loginSample, issues, state, { reason: 'game entry login' });
            lastDetail = `${current.url} login=${started ? 'started' : 'blocked'}`;
          } else {
            lastDetail = `${current.url} ready=${current.readyState || ''} token=${Boolean(current.hasToken)} control=${Boolean(current.hasLoginControl)}`;
          }
        } finally {
          if (cdp) cdp.close();
        }
        await sleep(Math.max(25, Math.min(100, options.authPollMs)));
        continue;
      }
      lastDetail = pages
        .filter(item => item.type === 'page')
        .map(item => item.url)
        .slice(0, 4)
        .join(' | ');
    } catch (err) {
      lastDetail = err.message || String(err);
    }
    await sleep(Math.max(25, options.authPollMs));
  }
  log('post-login-wait-timeout', baseSample, issues, compactDetail({ reason, lastDetail }));
  return false;
}

async function reloadPage(cdp, reason) {
  try {
    await cdp.send('Runtime.evaluate', {
      expression: `console.warn('[grasp-rat-monitor] reload: ${String(reason).replace(/'/g, '')}');`,
      returnByValue: true,
    });
  } catch (_) {}
  await cdp.send('Page.reload', { ignoreCache: true });
}

async function navigateGameHome(cdp, reason) {
  try {
    await cdp.send('Runtime.evaluate', {
      expression: `console.warn('[grasp-rat-monitor] navigate game home: ${String(reason).replace(/'/g, '')}');`,
      returnByValue: true,
    }, CDP_FAST_COMMAND_TIMEOUT_MS);
  } catch (_) {}
  return cdp.send('Page.navigate', { url: GAME_ORIGIN }, CDP_FAST_COMMAND_TIMEOUT_MS);
}

function clearOAuthCallbackState(state) {
  state.oauthCallbackUrl = '';
  state.oauthCallbackSeenAt = 0;
}

function markOAuthCallback(state, pageInfo) {
  const url = String(pageInfo?.url || '');
  const t = Date.now();
  if (state.oauthCallbackUrl !== url || !state.oauthCallbackSeenAt) {
    state.oauthCallbackUrl = url;
    state.oauthCallbackSeenAt = t;
  }
  const ageMs = Math.max(0, t - Number(state.oauthCallbackSeenAt || t));
  return {
    url,
    ageMs,
    remainingMs: Math.max(0, OAUTH_CALLBACK_GRACE_MS - ageMs),
    wait: ageMs < OAUTH_CALLBACK_GRACE_MS
  };
}

function clearGameEntryBlankState(state) {
  state.gameEntryBlankUrl = '';
  state.gameEntryBlankSeenAt = 0;
}

function markGameEntryBlank(state, pageInfo) {
  const url = String(pageInfo?.url || '');
  const t = Date.now();
  if (state.gameEntryBlankUrl !== url || !state.gameEntryBlankSeenAt) {
    state.gameEntryBlankUrl = url;
    state.gameEntryBlankSeenAt = t;
  }
  const ageMs = Math.max(0, t - Number(state.gameEntryBlankSeenAt || t));
  return {
    url,
    ageMs,
    remainingMs: Math.max(0, GAME_ENTRY_BLANK_GRACE_MS - ageMs),
    wait: ageMs < GAME_ENTRY_BLANK_GRACE_MS
  };
}

function isBlankGameEntry(pageInfo) {
  return isGamePage(pageInfo)
    && !pageCanInstallBot(pageInfo)
    && !pageInfo?.hasLoginControl;
}

async function waitOrRecoverOAuthCallback(cdp, state, pageInfo, sample, issues, reason) {
  if (pageInfo?.hasToken || pageInfo?.hasSelf || pageInfo?.inGame) {
    clearOAuthCallbackState(state);
    const nav = await navigateGameHome(cdp, 'oauth callback has usable session');
    log('game-entry', sample || makePageSample(pageInfo, { statusText: reason, readyState: pageInfo.readyState }), issues, compactDetail({
      reason: 'oauth callback has usable session',
      nav
    }));
    await sleep(Math.max(25, Math.min(100, options.authPollMs)));
    return true;
  }
  const marker = markOAuthCallback(state, pageInfo);
  if (marker.wait) {
    log('callback-wait', makePageSample(pageInfo, { statusText: reason, readyState: pageInfo.readyState }), issues, compactDetail({
      reason: 'waiting for oauth callback',
      ageMs: marker.ageMs,
      remainingMs: marker.remainingMs
    }));
    await sleep(Math.max(40, Math.min(150, marker.remainingMs || options.authPollMs)));
    return true;
  }
  clearOAuthCallbackState(state);
  const nav = await navigateGameHome(cdp, 'stale oauth callback');
  log('game-entry', sample || makePageSample(pageInfo, { statusText: reason, readyState: pageInfo.readyState }), issues, compactDetail({
    reason: 'stale oauth callback',
    ageMs: marker.ageMs,
    nav
  }));
  await sleep(Math.max(100, options.authPollMs));
  return true;
}

async function handleBlankGameEntry(cdp, state, pageInfo, sample, issues, reason) {
  const marker = markGameEntryBlank(state, pageInfo);
  if (marker.wait) {
    log('game-entry-wait', sample || makePageSample(pageInfo, { statusText: reason, readyState: pageInfo.readyState }), issues, compactDetail({
      reason: 'blank game entry',
      ageMs: marker.ageMs,
      remainingMs: marker.remainingMs
    }));
    await sleep(Math.max(100, Math.min(500, marker.remainingMs || options.authPollMs)));
    return true;
  }
  if (Date.now() - Number(state.lastGameEntryReloadAt || 0) >= GAME_ENTRY_RELOAD_COOLDOWN_MS) {
    state.lastGameEntryReloadAt = Date.now();
    await reloadPage(cdp, 'blank game entry');
    log('reload', sample || makePageSample(pageInfo, { statusText: reason, readyState: pageInfo.readyState }), issues, compactDetail({
      reason: 'blank game entry',
      ageMs: marker.ageMs
    }));
    await sleep(Math.max(250, options.authPollMs));
    return true;
  }
  log('game-entry-wait', sample || makePageSample(pageInfo, { statusText: reason, readyState: pageInfo.readyState }), issues, compactDetail({
    reason: 'blank game entry reload cooldown',
    ageMs: marker.ageMs,
    cooldownRemainingMs: Math.max(0, GAME_ENTRY_RELOAD_COOLDOWN_MS - (Date.now() - Number(state.lastGameEntryReloadAt || 0)))
  }));
  await sleep(Math.max(100, options.authPollMs));
  return true;
}

async function connectToPage(page) {
  if (!page?.webSocketDebuggerUrl) throw new Error(`page WebSocketDebuggerUrl missing for ${page?.url || 'unknown page'}`);
  const cdp = new CDP(page.webSocketDebuggerUrl);
  try {
    await cdp.connect();
    await cdp.send('Runtime.enable', {}, CDP_ENABLE_TIMEOUT_MS);
    await cdp.send('Page.enable', {}, CDP_ENABLE_TIMEOUT_MS);
    return cdp;
  } catch (err) {
    cdp.close();
    throw err;
  }
}

async function connectPage() {
  const page = await findGamePage(options.cdp);
  return connectToPage(page);
}

async function connectListedRelevantPage(state, cacheErrors = []) {
  const relevant = await findRelevantPage(options.cdp, state);
  if (relevant.page?.webSocketDebuggerUrl) {
    state.lastPageWs = relevant.page.webSocketDebuggerUrl;
    if (relevant.kind === 'game') state.lastGamePageWs = relevant.page.webSocketDebuggerUrl;
  }
  try {
    const cdp = await connectToPage(relevant.page);
    if (cacheErrors.length) relevant.cacheError = cacheErrors.slice(-2).join(' | ');
    return { relevant, cdp };
  } catch (err) {
    if (cacheErrors.length) {
      err.message = `${err.message || err}; cached page probes failed: ${cacheErrors.slice(-2).join(' | ')}`;
    }
    throw err;
  }
}

async function connectRelevantPage(state) {
  if (shouldPreferRecoveryPage(state)) {
    return connectListedRelevantPage(state);
  }

  const cached = Array.from(new Set([state.lastPageWs, state.lastGamePageWs].filter(Boolean)));
  const cacheErrors = [];
  for (const wsUrl of cached) {
    const cdp = new CDP(wsUrl);
    try {
      await cdp.connect();
      await cdp.send('Runtime.enable', {}, CDP_ENABLE_TIMEOUT_MS);
      await cdp.send('Page.enable', {}, CDP_ENABLE_TIMEOUT_MS);
      const current = await currentPageInfo(cdp);
      const page = { ...current, webSocketDebuggerUrl: wsUrl };
      if (isGamePage(page)) {
        state.lastPageWs = wsUrl;
        state.lastGamePageWs = wsUrl;
        return { relevant: { kind: 'game', page, fromCache: true }, cdp };
      }
      if (isAuthorizePage(page)) {
        state.lastPageWs = wsUrl;
        return { relevant: { kind: 'authorize', page, fromCache: true }, cdp };
      }
      if (isGameRecoveryPage(page)) {
        state.lastPageWs = wsUrl;
        return { relevant: { kind: 'game-recovery', page, fromCache: true }, cdp };
      }
      cacheErrors.push(`${wsUrl}: unexpected url ${current.url || '(blank)'}`);
    } catch (err) {
      cacheErrors.push(`${wsUrl}: ${err.message || String(err)}`);
    }
    cdp.close();
  }

  return connectListedRelevantPage(state, cacheErrors);
}

async function samplePage(cdp, commandTimeoutMs = 5000) {
  const result = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      (async () => {
        const bot = window.__graspRatBot || null;
        const before = bot?.status ? bot.status() : null;
        const nativeState = (() => {
          try { return typeof state === 'object' && state ? state : null; } catch (_) { return null; }
        })();
        const nativeWs = nativeState?.ws || null;
        const nativeWsOpen = Boolean(nativeState?.wsOpen && nativeWs && nativeWs.readyState === WebSocket.OPEN);
        let stepError = '';
        if (bot?.running && bot.step) {
          try {
            const maybePromise = bot.step('monitor');
            if (maybePromise && typeof maybePromise.then === 'function') await maybePromise;
          } catch (err) {
            stepError = err?.message || String(err);
          }
        }
        const after = bot?.status ? bot.status() : null;
        const currentUserId = Number(localStorage.getItem('tmpGameUserId') || after?.control?.currentUserId || before?.control?.currentUserId || document.getElementById('userId')?.value || 0);
        const entities = Array.isArray(nativeState?.entities) ? nativeState.entities : [];
        const own = typeof getOwnEntity === 'function'
          ? getOwnEntity()
          : entities.find(entity => Number(entity.user_id) === currentUserId);
        const isAlive = entity => entity && entity.life !== 'Dead' && entity.life !== 'WaitingRevive' && !entity.waiting_revive;
        const dist = (a, b) => Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y));
        const speed = entity => Math.hypot(Number(entity.vx) || 0, Number(entity.vy) || 0);
        const stamina5 = entity => Number(entity.stamina_5s_remaining_milli ?? 0);
        const staminaLimit = entity => Number(entity.stamina_5s_limit_milli || 10000);
        const dropValue = entity => Number(entity?.death_reward_preview ?? entity?.death_drop_coins ?? entity?.drop ?? 0) || 0;
        const others = own ? entities
          .filter(entity => Number(entity.user_id) !== currentUserId && isAlive(entity))
          .map(entity => {
            const d = dist(own, entity);
            const moving = speed(entity) >= 5;
            const limit = staminaLimit(entity);
            const sta = stamina5(entity);
            const staminaNotFull = limit > 0 && sta > 0 && sta < limit * 0.98;
            const staminaFull = limit > 0 && sta >= limit * 0.98;
            const active = moving || (entity.current_join_mode === 'Active' && !staminaFull);
            const threatRadius = moving ? 28000 : 18000;
            const cautionRadius = moving ? 38000 : 22000;
            return {
              id: entity.user_id,
              name: entity.name || '',
              distance: Math.round(d),
              hp: Number(entity.hp ?? 0),
              stamina5s: sta,
              stamina5sLimit: limit,
              staminaNotFull,
              staminaFull,
              mode: entity.current_join_mode || '',
              active,
              moving,
              speed: Math.round(speed(entity)),
              drop: dropValue(entity),
              threatRadius,
              cautionRadius
            };
          })
          .sort((a, b) => a.distance - b.distance)
          : [];
        const activeCautionExitMargin = 6000;
        const activeThreats = others
          .filter(entity => entity.active)
          .sort((a, b) => a.distance - b.distance);
        const lowStaminaThreats = others
          .filter(entity => entity.staminaNotFull && entity.distance <= 60000)
          .sort((a, b) => a.distance - b.distance);
        const closeAny = others.find(entity => entity.distance <= 12000) || null;
        const activeUnsafe = activeThreats.find(entity => entity.distance <= entity.cautionRadius + activeCautionExitMargin) || null;
        const lowStaminaUnsafe = lowStaminaThreats[0] || null;
        const safetyUnsafe = Boolean(!own || activeUnsafe || lowStaminaUnsafe || closeAny);
        const safetyReason = !own ? 'no-self'
          : (activeUnsafe ? 'active threat in caution range'
            : (lowStaminaUnsafe ? 'near non-full-stamina player'
              : (closeAny ? 'near player' : 'clear')));
	        return {
	          title: document.title,
	          url: location.href,
	          page: {
	            readyState: document.readyState,
	            currentUserId,
	            hasToken: Boolean(localStorage.getItem('tmpGameSessionToken') || after?.control?.hasToken || before?.control?.hasToken),
	            wsOpen: Boolean(after?.control?.wsOpen || before?.control?.wsOpen || nativeWsOpen),
	            wsReadyState: after?.control?.wsReadyState ?? before?.control?.wsReadyState ?? (nativeWs ? nativeWs.readyState : null),
	            statusText: document.getElementById('status')?.textContent || '',
	            inGame: Boolean(own && isAlive(own) && (own.joined === 'InGame' || own.current_join_mode || own.life === 'Alive')),
	            own: own ? {
	              id: own.user_id,
	              name: own.name,
	              x: Math.round(Number(own.x) || 0),
	              y: Math.round(Number(own.y) || 0),
	              hp: Number(own.hp ?? 0),
	              stamina5s: stamina5(own),
	              stamina5sLimit: staminaLimit(own),
	              drop: dropValue(own),
	              life: own.life,
	              mode: own.current_join_mode,
	              joined: own.joined
	            } : null,
            safety: {
              unsafe: safetyUnsafe,
              reason: safetyReason,
              activeCautionExitMargin,
              nearestActive: activeThreats[0] || null,
	              nearestLowStamina: lowStaminaThreats[0] || null,
	              nearestHuman: others[0] || null
	            },
	            control: after?.control || before?.control || null
	          },
          before,
          after,
          stepError
        };
      })()
    `,
  }, commandTimeoutMs);
  if (result.exceptionDetails) {
    throw new Error(`Runtime.evaluate failed: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result.value;
}

async function requestDirectReconnect(cdp, timeoutMs = CDP_FAST_COMMAND_TIMEOUT_MS) {
  const result = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      (async () => {
        const id = Number(localStorage.getItem('tmpGameUserId') || document.getElementById('userId')?.value || window.__graspRatBot?.status?.()?.control?.currentUserId || 0);
        const out = { id, attempted: false, method: '', error: '' };
        try {
          if (window.__graspRatBot?.step) {
            try {
              const step = window.__graspRatBot.step('direct-reconnect');
              if (step && typeof step.then === 'function') await step;
            } catch (_) {}
          }
          if (typeof connectWs === 'function' && id) {
            connectWs(id);
            out.attempted = true;
            out.method = 'connectWs';
          } else if (typeof scheduleReconnect === 'function') {
            scheduleReconnect();
            out.attempted = true;
            out.method = 'scheduleReconnect';
          } else {
            out.error = 'no reconnect function';
          }
        } catch (err) {
          out.error = err?.message || String(err);
        }
        return out;
      })()
    `,
  }, Math.max(100, timeoutMs));
  if (result.exceptionDetails) {
    throw new Error(`direct reconnect failed: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result.value;
}

async function leaveGame(cdp, reason) {
  const result = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      (async () => {
        const out = { attempted: false, method: '', error: '' };
        try {
          const stopBotAfterLeave = () => {
            try {
              if (window.__graspRatBot?.stop) window.__graspRatBot.stop('monitor leave: ${String(reason).replace(/['\\]/g, '')}');
            } catch (_) {}
            try {
              if (typeof sendVelocity === 'function') sendVelocity(true);
            } catch (_) {}
          };
          if (typeof leave === 'function') {
            const status = window.__graspRatBot?.status?.();
            const own = typeof getOwnEntity === 'function' ? getOwnEntity() : null;
            const userId = Number(
              localStorage.getItem('tmpGameUserId')
              || status?.control?.currentUserId
              || status?.self?.id
              || own?.user_id
              || document.getElementById('userId')?.value
              || 0
            );
            const res = userId ? leave(userId) : leave();
            if (res && typeof res.then === 'function') await res;
            out.attempted = true;
            out.method = userId ? 'leave(userId)' : 'leave';
            out.userId = userId || null;
            stopBotAfterLeave();
          } else {
            const btn = document.querySelector('#leaveBtn');
            if (btn) {
              btn.click();
              out.attempted = true;
              out.method = '#leaveBtn';
              stopBotAfterLeave();
            } else {
              out.error = 'leave control not found';
            }
          }
        } catch (err) {
          out.error = err?.message || String(err);
        }
        return out;
      })()
    `,
  });
  if (result.exceptionDetails) {
    throw new Error(`leave failed: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result.value;
}

function leaveWasIssued(leave) {
  return Boolean(leave?.attempted && !leave?.error);
}

async function startLinuxDoLogin(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      (async () => {
        const out = { attempted: false, method: '', error: '' };
        try {
          if (typeof startLinuxDoLogin === 'function') {
            const res = startLinuxDoLogin();
            if (res && typeof res.then === 'function') await res;
            out.attempted = true;
            out.method = 'startLinuxDoLogin';
          } else {
            const btn = document.querySelector('#joinBtn');
            if (btn) {
              btn.click();
              out.attempted = true;
              out.method = '#joinBtn';
            } else {
              out.error = 'login control not found';
            }
          }
        } catch (err) {
          out.error = err?.message || String(err);
        }
        return out;
      })()
    `,
  });
  if (result.exceptionDetails) {
    throw new Error(`start login failed: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result.value;
}

async function clickAuthorizeAllow(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      (async () => {
        const out = { attempted: false, method: '', error: '', url: location.href, title: document.title };
        const visible = el => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const findAllow = () => {
          const candidates = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]'))
            .filter(visible);
          const allow = candidates.find(el => {
            const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
            return /^(允许|同意|确认|Allow|Authorize|授权|Approve|Continue|继续)$/i.test(text)
              || /允许|同意|确认授权|Authorize|Approve|Continue|授权/i.test(text);
          }) || candidates.find(el => el.matches?.('a.btn-pill.btn-pill-primary, button.btn-pill-primary, .btn-primary, .btn-success, input[type="submit"]'));
          return { allow, candidates };
        };
        const deadline = Date.now() + ${AUTHORIZE_READY_WAIT_MS};
        let allow = null;
        let candidates = [];
        do {
          ({ allow, candidates } = findAllow());
          if (allow) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        } while (Date.now() < deadline);
        if (!allow) {
          const form = document.querySelector('form');
          if (form) {
            form.requestSubmit ? form.requestSubmit() : form.submit();
            out.attempted = true;
            out.method = 'form.submit';
            return out;
          }
          out.error = 'allow button not found';
          out.candidates = candidates.slice(0, 8).map(el => (el.innerText || el.value || el.getAttribute('aria-label') || el.tagName || '').trim()).filter(Boolean);
          return out;
        }
        allow.click();
        out.attempted = true;
        out.method = allow.tagName.toLowerCase() + (allow.className ? '.' + String(allow.className).trim().replace(/\\s+/g, '.') : '');
        return out;
      })()
    `,
  });
  if (result.exceptionDetails) {
    throw new Error(`authorize click failed: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result.value;
}

function isBadAction(status) {
  const decision = status?.lastDecision || {};
  const self = status?.self || decision.self || {};
  const safety = status?.safety || {};
  const kind = decision.kind;
  const aggressive = kind === 'attack' || kind === 'seek-enemy' || kind === 'seek-drop';
  const hp = Number(self.hp || 0);
  const recovering = hp > 0 && hp < 95;
  const activeDistance = Number(safety.nearestActive?.distance ?? Infinity);
  const activeThreatRadius = Number(safety.nearestActive?.threatRadius ?? 45000);
  const activeCautionRadius = Number(safety.nearestActive?.cautionRadius ?? 60000);
  const humanDistance = Number(safety.nearestHuman?.distance ?? Infinity);
  const targetDrop = Number(decision.target?.drop ?? decision.target?.death_reward_preview ?? decision.target?.death_drop_coins ?? 0);
  const ownDrop = Number(self.drop ?? decision.self?.drop ?? 0);

  if (recovering && aggressive) return 'aggressive while recovering';
  if (aggressive && targetDrop < 8) return `aggressive target drop too low: ${targetDrop || 'unknown'}`;
  if (aggressive && ownDrop > 0 && targetDrop < ownDrop * 0.5) return `aggressive target drop below reward ratio: target=${targetDrop || 'unknown'} own=${ownDrop}`;
  if (aggressive && activeDistance <= activeThreatRadius) return 'aggressive action with active unit too close';
  if (activeDistance <= activeThreatRadius && kind !== 'flee') return 'not fleeing active unit near active-view edge';
  if (!recovering && kind === 'idle' && activeDistance <= activeCautionRadius) return 'idle with active unit in caution ring';
  if (!recovering && kind === 'idle') return 'idle while healthy';
  if (!recovering && humanDistance <= 120 && kind !== 'flee') return 'not avoiding touching human at panic distance';
  return '';
}

function createState() {
  return {
    lastInstallAt: 0,
    offlineSince: 0,
    stuckSince: 0,
    lastPosition: null,
    lastMoveIntent: '',
    lastTickCount: null,
    lastDrop: null,
    lastDropChangeAt: 0,
    coinPursuitSince: 0,
    coinPursuitLastProgressAt: 0,
    coinPursuitBestDistance: null,
    lastCoinTarget: '',
    movementWindow: [],
    lastBotErrorKey: '',
    lastDirectReconnectAt: 0,
    lastReloginAt: 0,
    lastLeaveAt: 0,
    lastRateLimitAt: 0,
    lastLeaveRateLimitAt: 0,
    lastAuthorizeAt: 0,
    leftForOffline: false,
    oauthCallbackUrl: '',
    oauthCallbackSeenAt: 0,
    gameEntryBlankUrl: '',
    gameEntryBlankSeenAt: 0,
    lastGameEntryReloadAt: 0,
    lastPageWs: '',
    lastGamePageWs: '',
  };
}

function loadState() {
  try {
    const raw = fs.readFileSync(options.stateFile, 'utf8');
    return { ...createState(), ...JSON.parse(raw) };
  } catch (_) {
    return createState();
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(options.stateFile, JSON.stringify(state, null, 2));
  } catch (err) {
    process.stderr.write(`monitor state write failed: ${err.message || String(err)}\n`);
  }
}

function makePageSample(page, pageInfo = {}) {
  return {
    title: page?.title || pageInfo.title || '',
    url: page?.url || pageInfo.url || '',
    page: {
      readyState: pageInfo.readyState || null,
      statusText: pageInfo.statusText || '',
      wsOpen: pageInfo.wsOpen ?? null,
      inGame: pageInfo.inGame ?? null,
      safety: pageInfo.safety || null
    },
    before: null,
    after: null,
    stepError: ''
  };
}

function compactDetail(value) {
  return JSON.stringify(value, (key, item) => {
    if (typeof item === 'number' && Number.isFinite(item)) return Math.round(item);
    return item;
  });
}

function issueText(issues) {
  return Array.isArray(issues) ? issues.map(issue => issue.reason || '').join(' | ') : '';
}

function isRateLimitError(value) {
  return /rate limit exceeded|too many requests/i.test(String(value || ''));
}

function rateLimitRemainingMs(state) {
  const elapsed = Date.now() - Number(state.lastRateLimitAt || 0);
  return Math.max(0, RATE_LIMIT_COOLDOWN_MS - elapsed);
}

function leaveRateLimitRemainingMs(state) {
  const elapsed = Date.now() - Number(state.lastLeaveRateLimitAt || 0);
  return Math.max(0, RATE_LIMIT_COOLDOWN_MS - elapsed);
}

function reloginBlockedDetail(state, context = {}) {
  const rateLimitMs = rateLimitRemainingMs(state);
  if (rateLimitMs > 0) {
    return {
      reason: 'rate limit cooldown',
      rateLimitCooldownRemainingMs: rateLimitMs
    };
  }
  if (!context.forceRelogin) {
    const reloginMs = Math.max(0, options.reloginCooldownMs - (Date.now() - Number(state.lastReloginAt || 0)));
    if (reloginMs > 0) {
      return {
        reason: 'relogin cooldown',
        reloginCooldownRemainingMs: reloginMs
      };
    }
  }
  return null;
}

function isLoginRecoveryState(sample, issues) {
  const page = sample?.page || {};
  if (page.wsOpen) return false;
  const text = `${page.statusText || ''} ${page.safety?.reason || ''} ${issueText(issues)}`;
  return !page.inGame && /bot missing|bot has no current self entity|no-self|login required|syncing|not-alive/i.test(text);
}

function isPostLoginSyncState(sample, state) {
  const page = sample?.page || {};
  const status = sample?.after || {};
  const control = page.control || status.control || {};
  const own = page.own || status.self || status.lastDecision?.self || null;
  const ageSinceInstall = Date.now() - Number(state.lastInstallAt || 0);
  if (!state.leftForOffline) return false;
  if (!Number.isFinite(ageSinceInstall) || ageSinceInstall < 0 || ageSinceInstall > POST_LOGIN_SYNC_GRACE_MS) return false;
  if (!page.inGame || page.wsOpen) return false;
  if (!own) return false;
  if (page.safety?.unsafe) return false;
  if (!control.hasToken) return false;
  if (!control.connecting && control.wsReadyState !== 0 && control.nativeWsReadyState !== 0) return false;
  return true;
}

function isMissingBotCritical(issue) {
  return /bot missing|bot has no current self entity/i.test(String(issue?.reason || ''));
}

function bypassReinstallCooldown(issue) {
  return isMissingBotCritical(issue) || /bot stopped|stale tick/i.test(String(issue?.reason || ''));
}

async function maybeStartRelogin(cdp, sample, issues, state, context) {
  const t = Date.now();
  const blocked = reloginBlockedDetail(state, context || {});
  if (blocked) {
    if (context?.logBlocked !== false) log('login-wait', sample, issues, compactDetail({ ...context, ...blocked }));
    return false;
  }
  state.lastReloginAt = t;
  const login = await startLinuxDoLogin(cdp);
  if (isRateLimitError(login?.error)) state.lastRateLimitAt = Date.now();
  log('login', sample, issues, compactDetail({ ...context, login }));
  if (isRateLimitError(login?.error)) return false;
  if (!login?.attempted && /login control not found/i.test(String(login?.error || ''))) {
    const nav = await navigateGameHome(cdp, 'login control not found');
    log('game-entry', sample, issues, compactDetail({ reason: 'login control not found', nav }));
  }
  return true;
}

async function handleOffline(cdp, sample, issues, state) {
  const page = sample.page || {};
  if (page.wsOpen) return false;

  const t = Date.now();
  const offlineStartedAt = Number(state.offlineSince || t);
  const offlineAge = Math.max(0, t - offlineStartedAt);
  const inGame = Boolean(page.inGame);
  const unsafe = Boolean(inGame && page.safety?.unsafe);
  const safetyReason = page.safety?.reason || '';
  const safeLeaveMs = Math.min(options.safeLeaveOfflineMs, MAX_SAFE_OFFLINE_MS);
  const baseLeaveDelay = unsafe ? options.leaveOfflineMs : safeLeaveMs;
  const loginRecoveryState = isLoginRecoveryState(sample, issues);
  let currentSample = sample;
  let currentIssues = issues;
  let directReconnect = null;

  if (isPostLoginSyncState(sample, state)) {
    log('post-login-sync-wait', sample, issues, compactDetail({
      reason: 'waiting for post-login websocket sync',
      ageMs: Math.max(0, Date.now() - Number(state.lastInstallAt || Date.now())),
      remainingMs: Math.max(0, POST_LOGIN_SYNC_GRACE_MS - (Date.now() - Number(state.lastInstallAt || Date.now())))
    }));
    await sleep(Math.max(100, Math.min(300, POST_LOGIN_SYNC_GRACE_MS - (Date.now() - Number(state.lastInstallAt || Date.now())))));
    return true;
  }

  const leaveAndRelogin = async (leaveSample, leaveIssues, context = {}) => {
    const leaveCooldownMs = leaveRateLimitRemainingMs(state);
    if (leaveCooldownMs > 0) {
      log('leave-wait', leaveSample, leaveIssues, compactDetail({
        reason: 'leave rate limit cooldown',
        unsafe: Boolean(context.unsafe),
        safetyReason: context.safetyReason || safetyReason,
        offlineAge: context.offlineAge ?? offlineAge,
        cooldownRemainingMs: leaveCooldownMs,
        directReconnect
      }));
      return true;
	    }
	    const leave = await leaveGame(cdp, context.safetyReason || safetyReason || 'websocket offline');
    state.lastLeaveAt = Date.now();
    if (isRateLimitError(leave?.error)) state.lastLeaveRateLimitAt = Date.now();
    const leaveIssued = leaveWasIssued(leave);
    log(leaveIssued ? 'leave-offline' : 'leave-failed', leaveSample, leaveIssues, compactDetail({
      unsafe: Boolean(context.unsafe),
      safetyReason: context.safetyReason || safetyReason,
      offlineAge: context.offlineAge ?? offlineAge,
      directReconnect,
      leaveIssued,
      leave
    }));
    if (!leaveIssued) return true;
    state.leftForOffline = true;
    await sleep(120);
    const started = await maybeStartRelogin(cdp, leaveSample, leaveIssues, state, {
      afterLeave: true,
      unsafe: Boolean(context.unsafe),
      safetyReason: context.safetyReason || safetyReason,
      forceRelogin: true
    });
    if (started) {
      await injectWhenGameReturns(state, leaveSample, leaveIssues, 'after offline leave/login', cdp);
    }
    return true;
  };

  if (inGame && unsafe) {
    return leaveAndRelogin(sample, issues, {
      unsafe,
      safetyReason,
      offlineAge
    });
  }

  if (loginRecoveryState && page.hasToken) {
    return leaveAndRelogin(sample, issues, {
      unsafe: true,
      safetyReason: safetyReason || 'offline no-self',
      offlineAge,
      loginRecoveryState: true
    });
  }

  if (loginRecoveryState) {
    const started = await maybeStartRelogin(cdp, sample, issues, state, {
      reason: 'offline login recovery',
      forceRelogin: true
    });
    if (started) {
      await injectWhenGameReturns(state, sample, issues, 'after offline login recovery', cdp);
      return true;
    }
  }

  const directReconnectDeadline = offlineStartedAt + Math.max(0, baseLeaveDelay);
  const directReconnectRemainingMs = Math.max(0, directReconnectDeadline - Date.now());

  if (t - Number(state.lastDirectReconnectAt || 0) >= options.directReconnectCooldownMs
    && directReconnectRemainingMs > 150) {
    state.lastDirectReconnectAt = t;
    try {
      directReconnect = await requestDirectReconnect(
        cdp,
        Math.min(CDP_FAST_COMMAND_TIMEOUT_MS, Math.max(100, directReconnectRemainingMs - 50))
      );
      const remainingSafeWait = Math.max(0, directReconnectDeadline - Date.now());
      if (remainingSafeWait > 0) await sleep(Math.min(200, Math.max(25, remainingSafeWait)));
      const remainingSampleMs = Math.max(0, directReconnectDeadline - Date.now());
      if (remainingSampleMs > 100) {
        currentSample = await samplePage(cdp, Math.min(CDP_FAST_COMMAND_TIMEOUT_MS, Math.max(100, remainingSampleMs)));
        currentIssues = analyze(currentSample, state);
        if (currentSample.page?.wsOpen) {
          state.leftForOffline = false;
          log('direct-reconnect', currentSample, currentIssues, compactDetail({
            recovered: true,
            unsafe,
            safetyReason,
            offlineAge,
            directReconnect
          }));
          return true;
        }
      }
    } catch (err) {
      directReconnect = { attempted: true, error: err.message || String(err) };
      currentIssues = currentIssues.concat({ severity: 'warn', reason: `direct reconnect probe failed: ${directReconnect.error}` });
    }
  }

  const currentPage = currentSample.page || {};
  const currentInGame = Boolean(currentPage.inGame);
  const currentUnsafe = Boolean(currentInGame && currentPage.safety?.unsafe);
  const currentSafetyReason = currentPage.safety?.reason || safetyReason;
  const currentOfflineAge = Math.max(0, Date.now() - offlineStartedAt);
  const leaveDelay = currentUnsafe ? options.leaveOfflineMs : safeLeaveMs;
  const leaveDeadline = offlineStartedAt + Math.max(0, leaveDelay);

  if (currentInGame && currentUnsafe && !currentPage.wsOpen) {
    return leaveAndRelogin(currentSample, currentIssues, {
      unsafe: currentUnsafe,
      safetyReason: currentSafetyReason,
      offlineAge: currentOfflineAge
    });
  }

  while (currentInGame && !currentPage.wsOpen && Date.now() < leaveDeadline) {
    const remainingBeforeSleep = leaveDeadline - Date.now();
    if (remainingBeforeSleep <= 0) break;
    await sleep(Math.max(25, Math.min(150, remainingBeforeSleep)));
    const remainingForSample = leaveDeadline - Date.now();
    if (remainingForSample <= 100) break;
    try {
      currentSample = await samplePage(cdp, Math.min(CDP_FAST_COMMAND_TIMEOUT_MS, Math.max(100, remainingForSample)));
      currentIssues = analyze(currentSample, state);
    } catch (err) {
      currentIssues = currentIssues.concat({ severity: 'warn', reason: `offline follow-up sample failed: ${err.message || String(err)}` });
      break;
    }
    const loopPage = currentSample.page || {};
    if (loopPage.wsOpen) {
      state.leftForOffline = false;
      log('direct-reconnect', currentSample, currentIssues, compactDetail({
        recovered: true,
        unsafe: Boolean(loopPage.safety?.unsafe),
        safetyReason: loopPage.safety?.reason || currentSafetyReason,
        offlineAge: Math.max(0, Date.now() - offlineStartedAt),
        directReconnect
      }));
      return true;
    }
    if (loopPage.inGame && loopPage.safety?.unsafe) {
      return leaveAndRelogin(currentSample, currentIssues, {
        unsafe: true,
        safetyReason: loopPage.safety?.reason || currentSafetyReason,
        offlineAge: Math.max(0, Date.now() - offlineStartedAt)
      });
    }
  }

  const finalPage = currentSample.page || {};
  const finalInGame = Boolean(finalPage.inGame);
  const finalUnsafe = Boolean(finalInGame && finalPage.safety?.unsafe);
  const finalSafetyReason = finalPage.safety?.reason || currentSafetyReason;
  const finalOfflineAge = Math.max(0, Date.now() - offlineStartedAt);

  if (finalInGame && !finalPage.wsOpen && finalOfflineAge >= leaveDelay) {
    return leaveAndRelogin(currentSample, currentIssues, {
      unsafe: finalUnsafe,
      safetyReason: finalSafetyReason,
      offlineAge: finalOfflineAge
    });
  }

  if (!finalInGame && !finalPage.wsOpen) {
    const forceRelogin = isLoginRecoveryState(currentSample, currentIssues);
    const started = await maybeStartRelogin(cdp, currentSample, currentIssues, state, {
      reason: 'offline not in game',
      directReconnect,
      forceRelogin
    });
    if (started) {
      await injectWhenGameReturns(state, currentSample, currentIssues, 'after offline login', cdp);
      return true;
    }
    const blocked = reloginBlockedDetail(state, { forceRelogin });
    if (blocked) return true;
    log('login-wait', currentSample, currentIssues, compactDetail({
      reason: 'offline not in game',
      reloginCooldownRemainingMs: Math.max(0, options.reloginCooldownMs - (Date.now() - Number(state.lastReloginAt || 0))),
      directReconnect
    }));
    return true;
  }

  if (directReconnect && finalInGame && !finalPage.wsOpen && finalOfflineAge < leaveDelay) {
    log('direct-reconnect', currentSample, currentIssues, compactDetail({
      recovered: false,
      unsafe: currentUnsafe,
      safetyReason: currentSafetyReason,
      offlineAge: finalOfflineAge,
      leaveDelay,
      directReconnect
    }));
    return true;
  }

  if (!finalPage.wsOpen) {
    log('offline-wait', currentSample, currentIssues, compactDetail({
      inGame: finalInGame,
      unsafe: finalUnsafe,
      safetyReason: finalSafetyReason,
      offlineAge: finalOfflineAge,
      leaveDelay,
      directReconnect
    }));
    return true;
  }

  return false;
}

function analyze(sample, state) {
  const issues = [];
  const status = sample.after;
  const page = sample.page || {};
  if (!Array.isArray(state.movementWindow)) state.movementWindow = [];

  if (!status) issues.push({ severity: 'critical', reason: 'bot missing' });
  else if (!status.running) issues.push({ severity: 'critical', reason: `bot stopped: ${status.stopReason || 'unknown'}` });
  else if (status.lastTickAgeMs !== null && Number(status.lastTickAgeMs) > options.maxTickAgeMs) {
    issues.push({ severity: 'critical', reason: `stale tick: ${status.lastTickAgeMs}ms` });
  }
  if (status?.lastDecision?.kind === 'wait' && status.lastDecision.reason === 'no-self') {
    issues.push({ severity: 'critical', reason: 'bot has no current self entity' });
  }
  if (sample.stepError) issues.push({ severity: 'critical', reason: `step error: ${sample.stepError}` });
  const latestBotError = Array.isArray(status?.errors) && status.errors.length
    ? status.errors[status.errors.length - 1]
    : null;
  if (latestBotError?.message) {
    const errorKey = `${latestBotError.at || ''}:${latestBotError.message}`;
    if (state.lastBotErrorKey !== errorKey) {
      state.lastBotErrorKey = errorKey;
      issues.push({ severity: 'critical', reason: `bot runtime error: ${latestBotError.message}` });
    }
  }

  if (!page.wsOpen) {
    if (!state.offlineSince) state.offlineSince = Date.now();
    issues.push({ severity: 'warn', reason: `websocket offline: ${page.statusText || page.wsReadyState}` });
  } else {
    state.offlineSince = 0;
    state.leftForOffline = false;
  }

  const badAction = status ? isBadAction(status) : '';
  if (badAction) issues.push({ severity: 'critical', reason: badAction });

  const decision = status?.lastDecision || {};
  const self = status?.self || decision.self || null;
  const drop = Number(self?.drop ?? NaN);
  const stamina5s = Number(self?.stamina5s ?? decision.self?.stamina5s ?? NaN);
  const staminaLikelyAllowsMove = !Number.isFinite(stamina5s) || stamina5s > 250;
  const coinIntent = ['coin', 'seek-coin'].includes(decision.kind)
    || (decision.kind === 'patrol' && String(decision.reason || '').includes('coin'));

  if (Number.isFinite(drop)) {
    if (state.lastDrop === null || Number(state.lastDrop) !== drop) {
      state.lastDrop = drop;
      state.lastDropChangeAt = Date.now();
      state.coinPursuitSince = 0;
      state.coinPursuitLastProgressAt = 0;
      state.coinPursuitBestDistance = null;
      state.lastCoinTarget = '';
      state.movementWindow = [];
    } else if (!state.lastDropChangeAt) {
      state.lastDropChangeAt = Date.now();
    }
  }

  let coinTargetKey = '';
  let coinTargetDistance = Infinity;
  if (coinIntent) {
    const targetId = decision.target?.id === undefined ? '' : String(decision.target.id);
    const targetKey = `${decision.kind}:${targetId}`;
    const targetDistance = Number(decision.target?.distance ?? Infinity);
    coinTargetKey = targetKey;
    coinTargetDistance = targetDistance;
    if (!state.coinPursuitSince || state.lastCoinTarget !== targetKey) {
      state.coinPursuitSince = Date.now();
      state.coinPursuitLastProgressAt = Date.now();
      state.coinPursuitBestDistance = Number.isFinite(targetDistance) ? targetDistance : null;
      state.lastCoinTarget = targetKey;
      state.movementWindow = [];
    } else if (Number.isFinite(targetDistance)) {
      const bestDistance = Number(state.coinPursuitBestDistance ?? Infinity);
      if (!Number.isFinite(bestDistance) || targetDistance + 250 < bestDistance) {
        state.coinPursuitBestDistance = targetDistance;
        state.coinPursuitLastProgressAt = Date.now();
      }
    }

    const pursuitAge = Date.now() - Number(state.coinPursuitSince || Date.now());
    const progressAge = Date.now() - Number(state.coinPursuitLastProgressAt || state.coinPursuitSince || Date.now());
    const dropAge = state.lastDropChangeAt ? Date.now() - Number(state.lastDropChangeAt) : 0;
    if (pursuitAge > 90000 && progressAge > 45000 && dropAge > 90000) {
      const roundedDistance = Number.isFinite(targetDistance) ? Math.round(targetDistance) : 'unknown';
      issues.push({ severity: 'warn', reason: `coin pursuit has not improved or increased Drop: target=${targetId || 'none'} distance=${roundedDistance}` });
    }
  } else {
    state.coinPursuitSince = 0;
    state.coinPursuitLastProgressAt = 0;
    state.coinPursuitBestDistance = null;
    state.lastCoinTarget = '';
    state.movementWindow = [];
  }

  const moving = self && (decision.dx || decision.dy) && staminaLikelyAllowsMove;
  if (moving) {
    const nativeVelocity = String(status?.control?.nativeCurrentVel || '').trim();
    if (status?.control?.transport === 'native-page' && nativeVelocity === '0 0') {
      issues.push({ severity: 'critical', reason: `native velocity not applied: decision=${decision.dx || 0} ${decision.dy || 0}` });
    }
    const pos = `${self.x},${self.y}`;
    const samePosition = state.lastPosition && state.lastPosition === pos;
    const moveIntent = `${decision.kind}:${decision.dx || 0},${decision.dy || 0}`;
    if (samePosition) {
      if (!state.stuckSince) state.stuckSince = Date.now();
      if (Date.now() - state.stuckSince > options.reloadStuckMs) {
        issues.push({ severity: 'critical', reason: `position stuck while moving: ${pos} intent=${moveIntent}` });
      }
    } else {
      state.stuckSince = 0;
      state.lastPosition = pos;
    }
    state.lastMoveIntent = moveIntent;
    const x = Number(self.x);
    const y = Number(self.y);
    if (coinIntent && Number.isFinite(x) && Number.isFinite(y)) {
      const t = Date.now();
      state.movementWindow.push({
        at: t,
        x,
        y,
        dx: Number(decision.dx || 0),
        dy: Number(decision.dy || 0),
        target: coinTargetKey,
        distance: Number.isFinite(coinTargetDistance) ? coinTargetDistance : null,
        drop: Number.isFinite(drop) ? drop : null,
      });
      state.movementWindow = state.movementWindow
        .filter(item => t - Number(item.at || 0) <= 120000)
        .slice(-12);
      const window = state.movementWindow;
      if (window.length >= 4) {
        const first = window[0];
        const sameTarget = window.every(item => item.target === coinTargetKey);
        const sameDrop = window.every(item => item.drop === first.drop);
        const elapsed = t - Number(first.at || t);
        const xs = window.map(item => Number(item.x));
        const ys = window.map(item => Number(item.y));
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        const directions = new Set(window.map(item => `${item.dx},${item.dy}`));
        const distances = window.map(item => Number(item.distance)).filter(Number.isFinite);
        const bestDistance = distances.length ? Math.min(...distances) : Infinity;
        const lastDistance = distances.length ? distances[distances.length - 1] : Infinity;
        const dropAge = state.lastDropChangeAt ? t - Number(state.lastDropChangeAt) : 0;
        if (sameTarget && sameDrop && elapsed > 60000 && dropAge > 60000
          && span < 9000 && directions.size >= 3
          && Number.isFinite(bestDistance) && Number.isFinite(lastDistance)
          && lastDistance > bestDistance - 250) {
          issues.push({ severity: 'warn', reason: `possible coin orbit: target=${coinTargetKey} span=${Math.round(span)} distance=${Math.round(lastDistance)}` });
        }
      }
    }
  } else {
    state.stuckSince = 0;
    state.lastPosition = self ? `${self.x},${self.y}` : null;
    state.lastMoveIntent = '';
    if (!coinIntent) state.movementWindow = [];
  }

  if (state.lastTickCount !== null && status?.tickCount === state.lastTickCount) {
    issues.push({ severity: 'warn', reason: `tick count did not advance: ${status.tickCount}` });
  }
  if (status?.tickCount !== undefined) state.lastTickCount = status.tickCount;

  return issues;
}

async function cycle(state) {
  let sample;
  let cdp = null;
  try {
    const connected = await connectRelevantPage(state);
    const relevant = connected.relevant;
    cdp = connected.cdp;

    if (relevant.kind === 'authorize') {
      const authSample = makePageSample(relevant.page, { statusText: 'linuxdo authorize' });
      const authIssues = [{ severity: 'warn', reason: 'linuxdo authorize page active' }];
      if (Date.now() - Number(state.lastAuthorizeAt || 0) >= options.authorizeClickCooldownMs) {
        state.lastAuthorizeAt = Date.now();
        const authorize = await clickAuthorizeAllow(cdp);
        log('authorize', authSample, authIssues, compactDetail(authorize));
        await injectWhenGameReturns(state, authSample, authIssues, 'after authorize', cdp);
      } else {
        log('authorize-wait', authSample, authIssues);
      }
      return;
    }

    if (relevant.kind === 'game-recovery') {
      const recoverySample = makePageSample(relevant.page, { statusText: 'game oauth callback recovery' });
      const recoveryIssues = [{ severity: 'warn', reason: 'game oauth callback without usable session' }];
      const current = await currentPageInfo(cdp);
      await waitOrRecoverOAuthCallback(
        cdp,
        state,
        current,
        makePageSample(current, { statusText: 'game oauth callback recovery', readyState: current.readyState }),
        recoveryIssues,
        'game oauth callback recovery'
      );
      await injectWhenGameReturns(state, recoverySample, recoveryIssues, 'after game callback recovery', cdp);
      return;
    }

    const entryInfo = await currentPageInfo(cdp);
    clearOAuthCallbackState(state);
    if (isBlankGameEntry(entryInfo)) {
      const entrySample = makePageSample(entryInfo, { statusText: entryInfo.statusText || 'blank game entry', readyState: entryInfo.readyState });
      const entryIssues = [{ severity: 'warn', reason: 'blank game entry without login control or session' }];
      await handleBlankGameEntry(cdp, state, entryInfo, entrySample, entryIssues, 'blank game entry');
      return;
    }
    if (pageCanInstallBot(entryInfo)) clearGameEntryBlankState(state);

    sample = await samplePage(cdp);
    const issues = analyze(sample, state);
    if (await handleOffline(cdp, sample, issues, state)) return;

    const critical = issues.find(issue => issue.severity === 'critical');
    const offlineTooLong = state.offlineSince && Date.now() - state.offlineSince > options.reloadOfflineMs;
    const forceReinstall = critical && bypassReinstallCooldown(critical);
    const canReinstall = forceReinstall || Date.now() - state.lastInstallAt > options.reinstallCooldownMs;

    if (offlineTooLong) {
      await reloadPage(cdp, 'websocket offline too long');
      state.offlineSince = 0;
      log('reload', sample, issues);
    } else if (critical && canReinstall) {
      state.lastInstallAt = Date.now();
      const pageWs = relevant.page?.webSocketDebuggerUrl || state.lastGamePageWs || '';
      if (pageWs) {
        state.lastPageWs = pageWs;
        state.lastGamePageWs = pageWs;
      }
      const install = await installBotInPage(cdp);
      log('reinstall', sample, issues, installSummary(install));
    } else if (critical) {
      log('reinstall-wait', sample, issues, compactDetail({
        cooldownRemainingMs: Math.max(0, options.reinstallCooldownMs - (Date.now() - state.lastInstallAt)),
        critical: critical.reason
      }));
    } else {
      log('ok', sample, issues);
    }
  } catch (err) {
    log('error', sample || null, [{ severity: 'critical', reason: err.message || String(err) }], err.stack || '');
  } finally {
    if (cdp) cdp.close();
    saveState(state);
  }
}

function log(event, sample, issues = [], detail = '') {
  const status = sample?.after || null;
  const self = status?.self || status?.lastDecision?.self || null;
  const decision = status?.lastDecision || {};
  const line = {
    at: new Date().toISOString(),
    event,
    issues: issues.map(issue => issue.reason),
    action: decision.kind || null,
    reason: decision.reason || null,
    source: decision.source || null,
    tickCount: status?.tickCount ?? null,
    lastTickAgeMs: status?.lastTickAgeMs ?? null,
    hp: self?.hp ?? null,
    stamina5s: self?.stamina5s ?? null,
    drop: self?.drop ?? null,
    x: self?.x ?? null,
    y: self?.y ?? null,
    dx: decision.dx ?? null,
    dy: decision.dy ?? null,
    targetId: decision.target?.id ?? null,
    targetDistance: decision.target?.distance ?? null,
    targetAmount: decision.target?.amount ?? null,
    lastVelocity: status?.control?.lastVelocity || null,
    nativeCurrentVel: status?.control?.nativeCurrentVel || null,
    nativeLastVel: status?.control?.nativeLastVel || null,
    nativeKeys: Array.isArray(status?.control?.nativeKeys) ? status.control.nativeKeys.join(',') : null,
    coinProgress: status?.coinProgress ? {
      id: status.coinProgress.id,
      bestDistance: Math.round(Number(status.coinProgress.bestDistance ?? 0)),
      lastDistance: Math.round(Number(status.coinProgress.lastDistance ?? 0)),
      ignored: Boolean(status.coinProgress.ignoredAt)
    } : null,
    ignoredCoins: Array.isArray(status?.ignoredCoins) ? status.ignoredCoins.length : null,
    botErrors: Array.isArray(status?.errors) ? status.errors.length : null,
    lastBotError: Array.isArray(status?.errors) && status.errors.length
      ? String(status.errors[status.errors.length - 1]?.message || '').slice(0, 160)
      : null,
    wsOpen: sample?.page?.wsOpen ?? null,
    detail: detail ? String(detail).slice(0, 500) : undefined,
  };
  console.log(JSON.stringify(line));
}

async function main() {
  if (options.stop) {
    stopDaemon();
    return;
  }
  if (options.daemon) {
    startDaemon();
    return;
  }
  if (options.supervisor) {
    const shutdown = () => {
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    do {
      const run = await runOnceChild();
      const delay = shouldFastFollowRun(run)
        ? Math.max(50, options.recoveryFastFollowMs)
        : options.intervalMs;
      await new Promise(resolve => setTimeout(resolve, delay));
    } while (true);
  }

  const state = loadState();
  const shutdown = () => {
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  do {
    await cycle(state);
    if (options.once) break;
    await new Promise(resolve => setTimeout(resolve, options.intervalMs));
  } while (true);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
