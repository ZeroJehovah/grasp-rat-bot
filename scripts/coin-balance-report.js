#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_API_URL = 'https://elysiver.h-e.top/api/log/self';
const DEFAULT_REPORT_ROOT = path.join(ROOT, 'docs', 'reports');
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_DELAY_MS = 4000;
const DEFAULT_TIMEOUT_MS = 20000;
const BALANCE_LOG_TYPE = '1';
const COIN_QUOTA_UNIT = 500000;
const MONTHLY_KILL_STATS_LIMIT = 10;

function parseArgs(args) {
  const out = {
    apiUrl: process.env.ELYSIVER_LOG_API_URL || DEFAULT_API_URL,
    month: '',
    updateMonth: '',
    updateDay: '',
    day: '',
    out: '',
    json: false,
    pageSize: DEFAULT_PAGE_SIZE,
    delayMs: DEFAULT_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    selfTest: false
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--api-url') out.apiUrl = args[++i] || out.apiUrl;
    else if (arg === '--month') out.month = args[++i] || '';
    else if (arg === '--update-month') out.updateMonth = args[++i] || '';
    else if (arg === '--update-day') out.updateDay = args[++i] || '';
    else if (arg === '--day') out.day = args[++i] || '';
    else if (arg === '--out') out.out = path.resolve(args[++i] || out.out);
    else if (arg === '--json') out.json = true;
    else if (arg === '--page-size') out.pageSize = positiveInt(args[++i], out.pageSize);
    else if (arg === '--delay-ms') out.delayMs = Math.max(0, Number(args[++i] || out.delayMs) || 0);
    else if (arg === '--timeout-ms') out.timeoutMs = positiveInt(args[++i], out.timeoutMs);
    else if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function printHelp() {
  console.log(`Usage: node scripts/coin-balance-report.js (--month YYYY-MM | --update-month YYYY-MM | --update-day YYYY-MM-DD | --day YYYY-MM-DD) [options]

Fetches game coin balance-change logs from Elysiver and writes a monthly Markdown report.
A local .env file is loaded automatically when present.
The settled fetch method is documented in docs/agent/coin-balance-reporting.md.

Auth environment variables:
  ELYSIVER_COOKIE          Full Cookie header value, or use the three vars below.
  ELYSIVER_SESSION         session cookie value.
  ELYSIVER_JWT             elysiver_style_jwt cookie value.
  ELYSIVER_CF_CLEARANCE    cf_clearance cookie value.
  ELYSIVER_NEW_API_USER    new-api-user header value.

Options:
  --month YYYY-MM          Generate a natural-month report.
  --update-month YYYY-MM   Fetch only dates missing from an existing monthly report.
  --update-day YYYY-MM-DD  Fetch one missing date and merge it into its monthly report.
  --day YYYY-MM-DD         Fetch and summarize one day instead.
  --out <file>             Output Markdown path. Default: docs/reports/YYYY-MM/monthly-YYYY-MM.md
  --json                   Print JSON to stdout instead of Markdown.
  --page-size <n>          API page size. Default: ${DEFAULT_PAGE_SIZE}
  --delay-ms <ms>          Delay between API requests. Default: ${DEFAULT_DELAY_MS}
  --timeout-ms <ms>        Per-request timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --self-test              Run local parser/report regression checks.
`);
}

function buildAuth(env) {
  const cookie = String(env.ELYSIVER_COOKIE || '').trim() || buildCookieFromParts(env);
  const newApiUser = String(env.ELYSIVER_NEW_API_USER || env.ELYSIVER_USER_ID || env.NEW_API_USER || '').trim();
  if (!cookie) {
    throw new Error('Missing auth: set ELYSIVER_COOKIE, or ELYSIVER_SESSION + ELYSIVER_JWT + ELYSIVER_CF_CLEARANCE.');
  }
  if (!newApiUser) {
    throw new Error('Missing auth: set ELYSIVER_NEW_API_USER.');
  }
  return { cookie, newApiUser };
}

function buildCookieFromParts(env) {
  const parts = [];
  if (env.ELYSIVER_SESSION) parts.push(`session=${env.ELYSIVER_SESSION}`);
  if (env.ELYSIVER_JWT || env.ELYSIVER_STYLE_JWT) {
    parts.push(`elysiver_style_jwt=${env.ELYSIVER_JWT || env.ELYSIVER_STYLE_JWT}`);
  }
  if (env.ELYSIVER_CF_CLEARANCE) parts.push(`cf_clearance=${env.ELYSIVER_CF_CLEARANCE}`);
  return parts.join('; ');
}

function localDayBounds(day) {
  assertDate(day);
  const start = Math.floor(new Date(`${day}T00:00:00+08:00`).getTime() / 1000);
  const end = Math.floor(new Date(`${day}T23:59:59+08:00`).getTime() / 1000);
  return { start, end };
}

function assertDate(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Invalid day: ${day}`);
}

function assertMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Invalid month: ${month}`);
}

function monthDays(month) {
  assertMonth(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

function reportDaysForMonth(month) {
  const days = monthDays(month);
  const today = nowBeijingDay();
  const currentMonth = today.slice(0, 7);
  if (month === currentMonth) return days.filter(day => day <= today);
  if (month > currentMonth) return [];
  return days;
}

function nowBeijingDay() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function defaultMonthlyReportPath(month) {
  assertMonth(month);
  return path.join(DEFAULT_REPORT_ROOT, month, `monthly-${month}.md`);
}

class ApiClient {
  constructor(options, auth) {
    this.options = options;
    this.auth = auth;
    this.lastRequestAt = 0;
    this.requestCount = 0;
  }

  async fetchPage(day, page, startTimestamp, endTimestamp) {
    await this.rateLimit();
    const url = new URL(this.options.apiUrl);
    url.searchParams.set('p', String(page));
    url.searchParams.set('page_size', String(this.options.pageSize));
    url.searchParams.set('type', BALANCE_LOG_TYPE);
    url.searchParams.set('token_name', '');
    url.searchParams.set('model_name', '');
    url.searchParams.set('start_timestamp', String(startTimestamp));
    url.searchParams.set('end_timestamp', String(endTimestamp));
    url.searchParams.set('group', '');
    url.searchParams.set('request_id', '');

    try {
      this.requestCount += 1;
      process.stderr.write(`[coin-report] ${day} page ${page} curl request ${this.requestCount}\n`);
      return await fetchPageWithCurlRetry(url, this.auth, this.options.timeoutMs, day, page);
    } finally {
      this.lastRequestAt = Date.now();
    }
  }

  async rateLimit() {
    if (!this.lastRequestAt || !this.options.delayMs) return;
    const elapsed = Date.now() - this.lastRequestAt;
    const remaining = this.options.delayMs - elapsed;
    if (remaining > 0) await sleep(remaining);
  }
}

function requestHeaders(auth) {
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7',
    'cache-control': 'no-store',
    cookie: auth.cookie,
    dnt: '1',
    'new-api-user': auth.newApiUser,
    pragma: 'no-cache',
    priority: 'u=1, i',
    referer: 'https://elysiver.h-e.top/console/log',
    'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-full-version': '"150.0.7871.114"',
    'sec-ch-ua-full-version-list': '"Not;A=Brand";v="8.0.0.0", "Chromium";v="150.0.7871.114", "Google Chrome";v="150.0.7871.114"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"19.0.0"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
  };
}

function parseApiResponse(text, status) {
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}: ${String(text || '').slice(0, 200)}`);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON response: ${String(text || '').slice(0, 200)}`);
  }
  if (!payload || !payload.data || !Array.isArray(payload.data.items)) {
    throw new Error(`Unexpected response shape: ${String(text || '').slice(0, 200)}`);
  }
  return payload.data;
}

async function fetchPageWithCurlRetry(url, auth, timeoutMs, day, page) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt > 1) {
      const delay = attempt * 3000;
      process.stderr.write(`[coin-report] ${day} page ${page} curl retry ${attempt} after transient response\n`);
      await sleep(delay);
    }
    try {
      return parseApiResponse(fetchPageWithCurl(url, auth, timeoutMs), 200);
    } catch (err) {
      lastError = err;
      if (!isTransientCurlError(err)) throw err;
    }
  }
  throw lastError;
}

function isTransientCurlError(err) {
  return /Just a moment|cloudflare|error code:\s*50[234]|HTTP\s+50[234]|SSL_ERROR_SYSCALL|timed out|connection|transfer/i.test(String(err && err.message || err));
}

function fetchPageWithCurl(url, auth, timeoutMs) {
  const args = [
    '--silent',
    '--show-error',
    '--location',
    '--noproxy',
    '*',
    '--max-time',
    String(Math.max(1, Math.ceil(numberOr(timeoutMs, DEFAULT_TIMEOUT_MS) / 1000))),
    '--connect-timeout',
    '20',
    '--retry',
    '2',
    '--retry-all-errors',
    '--retry-delay',
    '2'
  ];
  for (const [key, value] of Object.entries(requestHeaders(auth))) {
    if (key === 'cookie') continue;
    args.push('-H', `${key}: ${value}`);
  }
  args.push('-b', auth.cookie);
  args.push(String(url));
  const result = spawnSync('curl', args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`curl failed with exit ${result.status}: ${String(result.stderr || result.stdout || '').slice(0, 200)}`);
  }
  return result.stdout;
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDay(client, day) {
  const bounds = localDayBounds(day);
  const today = nowBeijingDay();
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const end = day === today ? Math.min(bounds.end, currentTimestamp) : bounds.end;
  const first = await client.fetchPage(day, 1, bounds.start, end);
  const pageSize = positiveInt(first.page_size, client.options.pageSize);
  const total = positiveInt(first.total, 0);
  const pages = total > 0 ? Math.ceil(total / pageSize) : 1;
  const items = [...first.items];
  for (let page = 2; page <= pages; page += 1) {
    const data = await client.fetchPage(day, page, bounds.start, end);
    items.push(...data.items);
  }
  return summarizeDay(day, items, { startTimestamp: bounds.start, endTimestamp: end, total });
}

function parseOther(item) {
  if (!item || typeof item.other !== 'string' || !item.other.trim()) return {};
  try {
    const parsed = JSON.parse(item.other);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function amountFrom(other) {
  const amount = numeric(other.amount);
  if (amount !== null) return Math.abs(amount);
  const currency = numeric(other.currency);
  if (currency !== null) return Math.abs(currency);
  const quotaDelta = numeric(other.quota_delta);
  if (quotaDelta !== null) return Math.abs(quotaDelta / COIN_QUOTA_UNIT);
  return 0;
}

function classifyRecord(item) {
  const other = parseOther(item);
  const event = String(other.event || '').toLowerCase();
  const content = String(item.content || '');
  const sourceName = playerNameFromRecord(item, other);
  const quotaDelta = numeric(other.quota_delta);
  const rawAmount = numeric(other.amount);
  const rawCurrency = numeric(other.currency);
  const amount = amountFrom(other);
  const amountNegative = (rawAmount !== null && rawAmount < 0) || (rawCurrency !== null && rawCurrency < 0);
  const deltaNegative = amountNegative || (quotaDelta !== null && quotaDelta < 0);
  const pickupLike = event === 'pickup' || content.includes('游戏拾取') || content.includes('捡到');
  const systemPickup = pickupLike && !deltaNegative && (
    other.system_spawned === true
    || sourceName === 'system_coin'
    || Number(other.source_user_id || 0) === 0
  );
  const deathLike = deltaNegative
    || /死亡|被击杀|击杀.*文月|损失|扣除|减少额度|掉落金币/.test(content)
    || /death|dead|die|died|kill|killed|loss|lost|drop/.test(event);

  if (systemPickup) {
    return {
      kind: 'system-pickup',
      amount,
      quotaDelta: quotaDelta || 0,
      playerName: sourceName,
      other
    };
  }
  if (pickupLike && !deltaNegative) {
    return {
      kind: 'player-pickup',
      amount,
      quotaDelta: quotaDelta || 0,
      playerName: sourceName,
      other
    };
  }
  if (deathLike) {
    return {
      kind: 'death-loss',
      amount,
      quotaDelta: quotaDelta === null ? -amount * COIN_QUOTA_UNIT : quotaDelta,
      playerName: sourceName,
      other
    };
  }
  if (!isSuspiciousCoinRecord(content, event, other, amount, quotaDelta)) {
    return {
      kind: 'ignored',
      amount,
      quotaDelta: quotaDelta || 0,
      playerName: sourceName,
      other
    };
  }
  return {
    kind: 'unknown',
    amount,
    quotaDelta: quotaDelta || 0,
    playerName: sourceName,
    other
  };
}

function isSuspiciousCoinRecord(content, event, other, amount, quotaDelta) {
  if (/游戏|金币|拾取|捡到|死亡|击杀|掉落|爆出/.test(content)) return true;
  if (/game|coin|pickup|death|dead|die|died|kill|killed|drop|loot/.test(event)) return true;
  if (quotaDelta !== null && quotaDelta !== 0) return true;
  if (amount !== 0 && (
    Object.prototype.hasOwnProperty.call(other, 'source_user_id')
    || Object.prototype.hasOwnProperty.call(other, 'source_user_name')
    || Object.prototype.hasOwnProperty.call(other, 'system_spawned')
  )) {
    return true;
  }
  return false;
}

function summarizeDay(day, items, meta = {}) {
  const sortedItems = [...items].sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));
  const summary = {
    day,
    startTimestamp: meta.startTimestamp || localDayBounds(day).start,
    endTimestamp: meta.endTimestamp || localDayBounds(day).end,
    apiTotal: meta.total === undefined ? items.length : meta.total,
    fetchedRecords: items.length,
    firstRecordAt: sortedItems[0]?.created_at || null,
    lastRecordAt: sortedItems[sortedItems.length - 1]?.created_at || null,
    systemCoinGain: 0,
    playerDropPickupGain: 0,
    deathLoss: 0,
    netCoinChange: 0,
    details: [],
    unknownRecords: [],
    ignoredRecords: 0
  };
  for (const item of sortedItems) {
    const classification = classifyRecord(item);
    if (classification.kind === 'system-pickup') {
      summary.systemCoinGain += classification.amount;
      summary.netCoinChange += classification.amount;
    } else if (classification.kind === 'player-pickup') {
      summary.playerDropPickupGain += classification.amount;
      summary.netCoinChange += classification.amount;
      summary.details.push(buildDetail(item, classification, '拾取', classification.amount));
    } else if (classification.kind === 'death-loss') {
      summary.deathLoss += classification.amount;
      summary.netCoinChange -= classification.amount;
      summary.details.push(buildDetail(item, classification, '死亡', -classification.amount));
    } else if (classification.kind === 'ignored') {
      summary.ignoredRecords += 1;
    } else {
      summary.unknownRecords.push({
        time: formatTime(item.created_at),
        content: item.content || '',
        event: classification.other.event || '',
        quotaDelta: classification.quotaDelta,
        amount: classification.amount
      });
    }
  }
  summary.details.sort((a, b) => a.timestamp - b.timestamp);
  return summary;
}

function buildDetail(item, classification, type, coinDelta) {
  return {
    timestamp: Number(item.created_at || 0),
    time: formatTime(item.created_at),
    playerName: classification.playerName,
    type,
    coinDelta,
    quotaDelta: classification.quotaDelta,
    content: item.content || ''
  };
}

function playerNameFromRecord(item, other) {
  const content = String(item.content || '');
  const sourceName = String(other.source_user_name || '').trim();
  if (sourceName) return sourceName;
  const death = content.match(/被\s+(.+?)\(#\d+\)\s*击杀/);
  if (death) return death[1].trim();
  const pickup = content.match(/捡到\s+(.+?)\(#\d+\)\s*爆出的金币/);
  if (pickup) return pickup[1].trim();
  return 'unknown';
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(Number(timestamp) * 1000 + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(11, 19);
}

function formatDateTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(Number(timestamp) * 1000 + 8 * 60 * 60 * 1000);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function formatCoin(value) {
  const rounded = Math.round(Number(value || 0) * 1000000) / 1000000;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function signedCoin(value) {
  const n = Number(value || 0);
  if (n > 0) return `+${formatCoin(n)}`;
  if (n < 0) return `-${formatCoin(Math.abs(n))}`;
  return '0';
}

function sumMonth(days) {
  return days.reduce((acc, day) => {
    acc.systemCoinGain += day.systemCoinGain;
    acc.playerDropPickupGain += day.playerDropPickupGain;
    acc.deathLoss += day.deathLoss;
    acc.netCoinChange += day.netCoinChange;
    acc.fetchedRecords += day.fetchedRecords;
    acc.detailCount += day.details.length;
    acc.unknownCount += day.unknownRecords.length;
    acc.ignoredCount += day.ignoredRecords || 0;
    return acc;
  }, {
    systemCoinGain: 0,
    playerDropPickupGain: 0,
    deathLoss: 0,
    netCoinChange: 0,
    fetchedRecords: 0,
    detailCount: 0,
    unknownCount: 0,
    ignoredCount: 0
  });
}

function detailCount(day) {
  return day.detailCount === undefined ? day.details.length : day.detailCount;
}

function renderSummaryRow(day) {
  return `| ${day.day} | ${formatCoin(day.systemCoinGain)} | ${formatCoin(day.playerDropPickupGain)} | ${formatCoin(day.deathLoss)} | ${signedCoin(day.netCoinChange)} | ${detailCount(day)} | ${day.fetchedRecords} |`;
}

function renderDayDetailSection(day) {
  const lines = [];
  lines.push(`### ${day.day}`);
  lines.push('');
  lines.push(`拾取系统金币收益：${formatCoin(day.systemCoinGain)}；拾取玩家掉落金币收益：${formatCoin(day.playerDropPickupGain)}；死亡损失金币：${formatCoin(day.deathLoss)}；净金币变化：${signedCoin(day.netCoinChange)}。`);
  lines.push('');
  if (!day.details.length) {
    lines.push('无拾取玩家掉落金币或死亡损失明细。');
    return lines.join('\n');
  }
  lines.push('| 时间 | 玩家名 | 类型 | 金币变动 |');
  lines.push('|---|---|---|---:|');
  for (const detail of day.details) {
    lines.push(`| ${detail.time} | ${escapeMarkdown(detail.playerName)} | ${detail.type} | ${signedCoin(detail.coinDelta)} |`);
  }
  return lines.join('\n');
}

function renderUnknownDaySection(day) {
  const lines = [`### ${day.day}`, '', '| 时间 | event | 金币 | 额度变化 | 内容 |', '|---|---|---:|---:|---|'];
  for (const item of day.unknownRecords) {
    lines.push(`| ${item.time} | ${escapeMarkdown(item.event)} | ${formatCoin(item.amount)} | ${item.quotaDelta} | ${escapeMarkdown(item.content)} |`);
  }
  return lines.join('\n');
}

function aggregatePlayerStats(details, type) {
  const players = new Map();
  for (const detail of details.filter(item => item.type === type)) {
    const playerName = String(detail.playerName || 'unknown');
    const existing = players.get(playerName) || { playerName, coinTotal: 0, killCount: 0 };
    existing.coinTotal += Math.abs(Number(detail.coinDelta || 0));
    existing.killCount += 1;
    players.set(playerName, existing);
  }
  return [...players.values()].sort((left, right) => (
    right.coinTotal - left.coinTotal
    || right.killCount - left.killCount
    || left.playerName.localeCompare(right.playerName, 'zh-CN')
  ));
}

function renderMonthlyPlayerStats(details) {
  const deathStats = aggregatePlayerStats(details, '死亡');
  const killStats = aggregatePlayerStats(details, '拾取').slice(0, MONTHLY_KILL_STATS_LIMIT);
  const lines = [];
  if (deathStats.length) {
    lines.push('## 本月死亡统计');
    lines.push('');
    lines.push('| 玩家名称 | 损失金币 | 击杀次数 |');
    lines.push('|---|---:|---:|');
    for (const row of deathStats) {
      lines.push(`| ${escapeMarkdown(row.playerName)} | ${formatCoin(row.coinTotal)} | ${row.killCount} |`);
    }
    lines.push('');
  }
  lines.push('## 本月击杀统计');
  lines.push('');
  if (!killStats.length) {
    lines.push('无击杀记录。');
    return lines.join('\n');
  }
  lines.push('| 玩家名称 | 收获金币 | 击杀次数 |');
  lines.push('|---|---:|---:|');
  for (const row of killStats) {
    lines.push(`| ${escapeMarkdown(row.playerName)} | ${formatCoin(row.coinTotal)} | ${row.killCount} |`);
  }
  return lines.join('\n');
}

function parseMonthlyDetailRows(markdown) {
  const details = [];
  const rowPattern = /^\| \d{2}:\d{2}:\d{2} \| (.*) \| (拾取|死亡) \| ([+-]?(?:\d+(?:\.\d+)?|\.\d+)) \|$/gm;
  for (const match of markdown.matchAll(rowPattern)) {
    details.push({
      playerName: match[1].replace(/\\\|/g, '|'),
      type: match[2],
      coinDelta: Number(match[3])
    });
  }
  return details;
}

function removeTopLevelSection(markdown, heading) {
  const marker = `## ${heading}`;
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex < 0) return markdown;
  const nextHeading = markdown.indexOf('\n## ', markerIndex + marker.length);
  const suffixStart = nextHeading < 0 ? markdown.length : nextHeading + 1;
  const prefix = markdown.slice(0, markerIndex).trimEnd();
  const suffix = markdown.slice(suffixStart).trimStart();
  return suffix ? `${prefix}\n\n${suffix}` : `${prefix}\n`;
}

function refreshMonthlyPlayerStats(markdown) {
  let refreshed = removeTopLevelSection(markdown, '本月死亡统计');
  refreshed = removeTopLevelSection(refreshed, '本月击杀统计');
  const detailHeading = '## 拾取玩家掉落金币和死亡损失明细';
  const detailIndex = refreshed.indexOf(detailHeading);
  if (detailIndex < 0) throw new Error(`Cannot refresh monthly player stats: missing heading ${detailHeading}`);
  const stats = renderMonthlyPlayerStats(parseMonthlyDetailRows(refreshed));
  return `${refreshed.slice(0, detailIndex).trimEnd()}\n\n${stats}\n\n${refreshed.slice(detailIndex).trimStart()}`.trimEnd() + '\n';
}

function parseMonthlySummaryRows(markdown, month) {
  const rows = new Map();
  const rowPattern = /^\| (\d{4}-\d{2}-\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (\d+) \| (\d+) \|$/gm;
  for (const match of markdown.matchAll(rowPattern)) {
    const day = match[1];
    if (!day.startsWith(`${month}-`)) continue;
    rows.set(day, {
      day,
      systemCoinGain: Number(match[2].trim()),
      playerDropPickupGain: Number(match[3].trim()),
      deathLoss: Number(match[4].trim()),
      netCoinChange: Number(match[5].trim()),
      detailCount: Number(match[6]),
      fetchedRecords: Number(match[7])
    });
  }
  return rows;
}

function replaceLine(markdown, pattern, replacement) {
  if (!pattern.test(markdown)) throw new Error(`Cannot merge monthly report: missing line ${pattern}`);
  return markdown.replace(pattern, replacement);
}

function parseDatedSections(body) {
  const sections = new Map();
  for (const part of body.split(/(?=^### \d{4}-\d{2}-\d{2}$)/m)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^### (\d{4}-\d{2}-\d{2})$/m);
    if (!match) throw new Error('Cannot merge monthly report: malformed dated section.');
    sections.set(match[1], trimmed);
  }
  return sections;
}

function replaceDatedSectionArea(markdown, heading, newSections) {
  const marker = `## ${heading}`;
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Cannot merge monthly report: missing heading ${marker}`);
  const bodyStart = markerIndex + marker.length;
  const nextHeading = markdown.indexOf('\n## ', bodyStart);
  const bodyEnd = nextHeading < 0 ? markdown.length : nextHeading;
  const existing = parseDatedSections(markdown.slice(bodyStart, bodyEnd));
  for (const [day, section] of newSections) {
    if (existing.has(day)) throw new Error(`Cannot merge monthly report: date already covered: ${day}`);
    existing.set(day, section);
  }
  const body = [...existing.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, section]) => section)
    .join('\n\n');
  return `${markdown.slice(0, bodyStart)}\n\n${body}\n${markdown.slice(bodyEnd).replace(/^\n+/, '')}`;
}

function mergeMonthlyMarkdown(existing, month, newDays, generatedAt = new Date()) {
  if (!existing.trim()) return renderMonthlyMarkdown(month, newDays, generatedAt);
  if (!existing.startsWith(`# ${month} 金币余额变化记录\n`)) {
    throw new Error(`Cannot merge monthly report: unexpected report heading for ${month}.`);
  }
  const rows = parseMonthlySummaryRows(existing, month);
  if (!rows.size) throw new Error('Cannot merge monthly report: no daily summary rows found.');
  for (const day of newDays) {
    if (rows.has(day.day)) throw new Error(`Cannot merge monthly report: date already covered: ${day.day}`);
    rows.set(day.day, day);
  }
  const sortedRows = [...rows.values()].sort((left, right) => left.day.localeCompare(right.day));
  const totals = sortedRows.reduce((acc, day) => {
    acc.systemCoinGain += day.systemCoinGain;
    acc.playerDropPickupGain += day.playerDropPickupGain;
    acc.deathLoss += day.deathLoss;
    acc.netCoinChange += day.netCoinChange;
    acc.detailCount += detailCount(day);
    acc.fetchedRecords += day.fetchedRecords;
    return acc;
  }, { systemCoinGain: 0, playerDropPickupGain: 0, deathLoss: 0, netCoinChange: 0, detailCount: 0, fetchedRecords: 0 });
  const existingUnknownMatch = existing.match(/^- 未识别记录数：(\d+)$/m);
  const unknownCount = Number(existingUnknownMatch ? existingUnknownMatch[1] : 0)
    + newDays.reduce((sum, day) => sum + day.unknownRecords.length, 0);

  let merged = existing;
  merged = replaceLine(merged, /^生成时间：.*$/m, `生成时间：${formatDateTime(Math.floor(generatedAt.getTime() / 1000))}（北京时间）`);
  merged = replaceLine(merged, /^数据范围：.*$/m, `数据范围：${month}-01 00:00:00 到 ${sortedRows[sortedRows.length - 1].day} 23:59:59（北京时间；当天未结束时只统计到请求时刻）`);
  merged = replaceLine(merged, /^- 拾取系统金币收益（总计）：.*$/m, `- 拾取系统金币收益（总计）：${formatCoin(totals.systemCoinGain)}`);
  merged = replaceLine(merged, /^- 拾取玩家掉落金币收益（总计）：.*$/m, `- 拾取玩家掉落金币收益（总计）：${formatCoin(totals.playerDropPickupGain)}`);
  merged = replaceLine(merged, /^- 死亡损失金币（总计）：.*$/m, `- 死亡损失金币（总计）：${formatCoin(totals.deathLoss)}`);
  merged = replaceLine(merged, /^- 净金币变化：.*$/m, `- 净金币变化：${signedCoin(totals.netCoinChange)}`);
  merged = replaceLine(merged, /^- API 记录数：.*$/m, `- API 记录数：${totals.fetchedRecords}`);
  merged = replaceLine(merged, /^- 明细记录数：.*$/m, `- 明细记录数：${totals.detailCount}`);
  if (existingUnknownMatch) {
    merged = merged.replace(/^- 未识别记录数：.*$/m, `- 未识别记录数：${unknownCount}`);
  } else if (unknownCount) {
    merged = merged.replace(/(^- 明细记录数：.*$)/m, `$1\n- 未识别记录数：${unknownCount}`);
  }

  const summaryHeader = '|---|---:|---:|---:|---:|---:|---:|';
  const summaryStart = merged.indexOf(summaryHeader);
  if (summaryStart < 0) throw new Error('Cannot merge monthly report: missing daily summary table.');
  const rowsStart = summaryStart + summaryHeader.length;
  const rowsEnd = merged.indexOf('\n\n', rowsStart);
  if (rowsEnd < 0) throw new Error('Cannot merge monthly report: malformed daily summary table.');
  merged = `${merged.slice(0, rowsStart)}\n${sortedRows.map(renderSummaryRow).join('\n')}${merged.slice(rowsEnd)}`;

  merged = replaceDatedSectionArea(
    merged,
    '拾取玩家掉落金币和死亡损失明细',
    new Map(newDays.map(day => [day.day, renderDayDetailSection(day)]))
  );
  const newUnknownSections = new Map(newDays
    .filter(day => day.unknownRecords.length)
    .map(day => [day.day, renderUnknownDaySection(day)]));
  if (newUnknownSections.size) {
    if (merged.includes('\n## 未识别记录\n')) {
      merged = replaceDatedSectionArea(merged, '未识别记录', newUnknownSections);
    } else {
      const body = [...newUnknownSections.values()].join('\n\n');
      merged = `${merged.trimEnd()}\n\n## 未识别记录\n\n${body}\n`;
    }
  }
  return refreshMonthlyPlayerStats(merged);
}

function renderMonthlyMarkdown(month, days, generatedAt = new Date()) {
  const totals = sumMonth(days);
  const lines = [];
  lines.push(`# ${month} 金币余额变化记录`);
  lines.push('');
  lines.push(`生成时间：${formatDateTime(Math.floor(generatedAt.getTime() / 1000))}（北京时间）`);
  lines.push(`数据范围：${month}-01 00:00:00 到 ${days[days.length - 1].day} 23:59:59（北京时间；当天未结束时只统计到请求时刻）`);
  lines.push('');
  lines.push('## 整月汇总');
  lines.push('');
  lines.push(`- 拾取系统金币收益（总计）：${formatCoin(totals.systemCoinGain)}`);
  lines.push(`- 拾取玩家掉落金币收益（总计）：${formatCoin(totals.playerDropPickupGain)}`);
  lines.push(`- 死亡损失金币（总计）：${formatCoin(totals.deathLoss)}`);
  lines.push(`- 净金币变化：${signedCoin(totals.netCoinChange)}`);
  lines.push(`- API 记录数：${totals.fetchedRecords}`);
  lines.push(`- 明细记录数：${totals.detailCount}`);
  if (totals.unknownCount) lines.push(`- 未识别记录数：${totals.unknownCount}`);
  lines.push('');
  lines.push('## 每日汇总');
  lines.push('');
  lines.push('| 日期 | 拾取系统金币收益 | 拾取玩家掉落金币收益 | 死亡损失金币 | 净金币变化 | 明细数 | API记录数 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const day of days) {
    lines.push(renderSummaryRow(day));
  }
  lines.push('');
  lines.push(renderMonthlyPlayerStats(days.flatMap(day => day.details)));
  lines.push('');
  lines.push('## 拾取玩家掉落金币和死亡损失明细');
  lines.push('');
  for (const day of days) {
    lines.push(`### ${day.day}`);
    lines.push('');
    lines.push(`拾取系统金币收益：${formatCoin(day.systemCoinGain)}；拾取玩家掉落金币收益：${formatCoin(day.playerDropPickupGain)}；死亡损失金币：${formatCoin(day.deathLoss)}；净金币变化：${signedCoin(day.netCoinChange)}。`);
    lines.push('');
    if (!day.details.length) {
      lines.push('无拾取玩家掉落金币或死亡损失明细。');
      lines.push('');
      continue;
    }
    lines.push('| 时间 | 玩家名 | 类型 | 金币变动 |');
    lines.push('|---|---|---|---:|');
    for (const detail of day.details) {
      lines.push(`| ${detail.time} | ${escapeMarkdown(detail.playerName)} | ${detail.type} | ${signedCoin(detail.coinDelta)} |`);
    }
    lines.push('');
  }
  if (totals.unknownCount) {
    lines.push('## 未识别记录');
    lines.push('');
    for (const day of days.filter(item => item.unknownRecords.length)) {
      lines.push(`### ${day.day}`);
      lines.push('');
      lines.push('| 时间 | event | 金币 | 额度变化 | 内容 |');
      lines.push('|---|---|---:|---:|---|');
      for (const item of day.unknownRecords) {
        lines.push(`| ${item.time} | ${escapeMarkdown(item.event)} | ${formatCoin(item.amount)} | ${item.quotaDelta} | ${escapeMarkdown(item.content)} |`);
      }
      lines.push('');
    }
  }
  while (lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function run(options) {
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  const selectedModes = [options.month, options.updateMonth, options.updateDay, options.day].filter(Boolean);
  if (!selectedModes.length) throw new Error('Provide --month YYYY-MM, --update-month YYYY-MM, --update-day YYYY-MM-DD, or --day YYYY-MM-DD.');
  if (selectedModes.length > 1) throw new Error('Use only one report mode.');
  const auth = buildAuth(process.env);
  const client = new ApiClient(options, auth);
  if (options.updateDay) {
    assertDate(options.updateDay);
    const month = options.updateDay.slice(0, 7);
    const outPath = options.out || defaultMonthlyReportPath(month);
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (existing) {
      const covered = parseMonthlySummaryRows(existing, month);
      if (covered.has(options.updateDay)) {
        console.log(JSON.stringify({ outPath, fetchedDays: [], requests: 0, unchanged: true }, null, 2));
        return;
      }
    }
    const summary = await fetchDay(client, options.updateDay);
    const report = mergeMonthlyMarkdown(existing, month, [summary]);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, report, 'utf8');
    console.log(JSON.stringify({ outPath, fetchedDays: [options.updateDay], requests: client.requestCount }, null, 2));
    return;
  }
  if (options.day) {
    const summary = await fetchDay(client, options.day);
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    console.log(renderMonthlyMarkdown(options.day.slice(0, 7), [summary]));
    return;
  }
  if (options.updateMonth) {
    assertMonth(options.updateMonth);
    const outPath = options.out || defaultMonthlyReportPath(options.updateMonth);
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    const covered = existing ? new Set(parseMonthlySummaryRows(existing, options.updateMonth).keys()) : new Set();
    const missingDays = reportDaysForMonth(options.updateMonth).filter(day => !covered.has(day));
    const days = [];
    for (const day of missingDays) days.push(await fetchDay(client, day));
    if (!missingDays.length) {
      const report = refreshMonthlyPlayerStats(existing);
      const derivedUpdated = report !== existing;
      if (derivedUpdated) fs.writeFileSync(outPath, report, 'utf8');
      console.log(JSON.stringify({ outPath, fetchedDays: [], requests: 0, derivedUpdated, unchanged: !derivedUpdated }, null, 2));
      return;
    }
    const report = mergeMonthlyMarkdown(existing, options.updateMonth, days);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, report, 'utf8');
    console.log(JSON.stringify({ outPath, fetchedDays: missingDays, requests: client.requestCount }, null, 2));
    return;
  }
  const days = [];
  const reportDays = reportDaysForMonth(options.month);
  if (!reportDays.length) throw new Error(`No reportable days for month ${options.month}.`);
  for (const day of reportDays) {
    days.push(await fetchDay(client, day));
  }
  const report = renderMonthlyMarkdown(options.month, days);
  if (options.json) {
    console.log(JSON.stringify({ month: options.month, totals: sumMonth(days), days }, null, 2));
    return;
  }
  const outPath = options.out || defaultMonthlyReportPath(options.month);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, report, 'utf8');
  console.log(JSON.stringify({ outPath, totals: sumMonth(days), requests: client.requestCount }, null, 2));
}

function runSelfTest() {
  const items = [
    {
      created_at: 1782662401,
      content: '游戏拾取：文月(#28886) 捡到系统刷新金币 1，增加额度 500000（约 1.000000）',
      other: JSON.stringify({
        amount: 1,
        currency: '1.000000',
        event: 'pickup',
        quota_delta: 500000,
        source_user_id: 0,
        source_user_name: 'system_coin',
        system_spawned: true
      })
    },
    {
      created_at: 1782662402,
      content: '游戏拾取：文月(#28886) 捡到 Alice(#1) 爆出的金币 12，增加额度 6000000（约 12.000000）',
      other: JSON.stringify({
        amount: 12,
        currency: '12.000000',
        event: 'pickup',
        quota_delta: 6000000,
        source_user_id: 1,
        source_user_name: 'Alice',
        system_spawned: false
      })
    },
    {
      created_at: 1782662403,
      content: '游戏死亡：文月(#28886) 被 Bob(#2) 击杀，损失金币 7，减少额度 3500000（约 7.000000）',
      other: JSON.stringify({
        amount: 7,
        currency: '7.000000',
        event: 'death',
        quota_delta: -3500000,
        source_user_id: 2,
        source_user_name: 'Bob',
        system_spawned: false
      })
    },
    {
      created_at: 1782662404,
      content: '用户签到，获得额度 ＄3.000000 额度',
      other: null
    }
  ];
  const summary = summarizeDay('2026-06-29', items, { total: items.length });
  assert.strictEqual(summary.systemCoinGain, 1);
  assert.strictEqual(summary.playerDropPickupGain, 12);
  assert.strictEqual(summary.deathLoss, 7);
  assert.strictEqual(summary.netCoinChange, 6);
  assert.strictEqual(summary.details.length, 2);
  assert.strictEqual(summary.ignoredRecords, 1);
  assert.strictEqual(summary.unknownRecords.length, 0);
  assert.strictEqual(summary.details[0].type, '拾取');
  assert.strictEqual(summary.details[1].type, '死亡');
  assert.strictEqual(summary.details[1].playerName, 'Bob');
  const markdown = renderMonthlyMarkdown('2026-06', [summary], new Date('2026-06-30T00:00:00Z'));
  assert(markdown.includes('| 00:00:02 | Alice | 拾取 | +12 |'));
  assert(markdown.includes('| 00:00:03 | Bob | 死亡 | -7 |'));
  assert(markdown.includes('死亡损失金币（总计）：7'));
  assert(markdown.includes('## 本月死亡统计'));
  assert(markdown.includes('| Bob | 7 | 1 |'));
  assert(markdown.includes('## 本月击杀统计'));
  assert(markdown.includes('| Alice | 12 | 1 |'));
  assert(markdown.indexOf('## 本月击杀统计') < markdown.indexOf('## 拾取玩家掉落金币和死亡损失明细'));
  assert(!renderMonthlyPlayerStats([summary.details[0]]).includes('## 本月死亡统计'));
  const topTen = renderMonthlyPlayerStats(Array.from({ length: 11 }, (_, index) => ({
    playerName: `Player${index + 1}`,
    type: '拾取',
    coinDelta: index + 1
  })));
  assert.strictEqual((topTen.match(/^\| Player\d+ \|/gm) || []).length, MONTHLY_KILL_STATS_LIMIT);
  assert(topTen.includes('| Player11 | 11 | 1 |'));
  assert(!topTen.includes('| Player1 | 1 | 1 |'));
  const nextDay = {
    ...summary,
    day: '2026-06-30',
    systemCoinGain: 2,
    playerDropPickupGain: 3,
    deathLoss: 1,
    netCoinChange: 4,
    fetchedRecords: 5,
    details: [
      { timestamp: 1782748801, time: '00:00:01', playerName: 'Alice', type: '拾取', coinDelta: 3 },
      { timestamp: 1782748802, time: '00:00:02', playerName: 'Bob', type: '死亡', coinDelta: -1 }
    ],
    unknownRecords: []
  };
  const merged = mergeMonthlyMarkdown(markdown, '2026-06', [nextDay], new Date('2026-07-01T00:00:00Z'));
  assert(merged.includes('| 2026-06-30 | 2 | 3 | 1 | +4 | 2 | 5 |'));
  assert(merged.includes('- 净金币变化：+10'));
  assert(merged.includes('| Bob | 8 | 2 |'));
  assert(merged.includes('| Alice | 15 | 2 |'));
  assert(merged.includes('### 2026-06-30'));
  assert.strictEqual((merged.match(/^\| 2026-06-29 /gm) || []).length, 1);
  const initial = mergeMonthlyMarkdown('', '2026-08', [{ ...summary, day: '2026-08-01' }], new Date('2026-08-02T00:00:00Z'));
  assert(initial.startsWith('# 2026-08 金币余额变化记录\n'));
  assert(initial.includes('| 2026-08-01 | 1 | 12 | 7 | +6 | 2 | 4 |'));
  assert.strictEqual(defaultMonthlyReportPath('2026-06'), path.join(ROOT, 'docs', 'reports', '2026-06', 'monthly-2026-06.md'));
  console.log('coin-balance-report self-test passed');
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquoteDotEnvValue(match[2]);
  }
}

function unquoteDotEnvValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, '');
}

loadDotEnv(path.join(ROOT, '.env'));

run(parseArgs(process.argv.slice(2))).catch(err => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
