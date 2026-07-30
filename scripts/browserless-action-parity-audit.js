#!/usr/bin/env node
'use strict';

const path = require('path');
const { readJsonlEntries } = require('./browserless-log-summary');
const { actionPriorityBand } = require('../src/strategy/action-priority');

const STREAMS = ['runner', 'decisions', 'actions', 'combat'];
const GAP_ALIGNED = 'aligned';
const GAP_TRANSPORT = 'known-transport-exception';
const GAP_MISSING = 'missing-browser-branch';

function parseArgs(argv) {
  const out = {
    logDir: path.join(process.cwd(), 'data', 'browserless-runner', 'logs'),
    day: new Date().toISOString().slice(0, 10),
    json: false,
    failOnMissing: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--log-dir') out.logDir = argv[++i] || out.logDir;
    else if (arg === '--day') out.day = argv[++i] || out.day;
    else if (arg === '--json') out.json = true;
    else if (arg === '--fail-on-missing') out.failOnMissing = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function loadStreams(logDir, day) {
  const dayDir = path.join(path.resolve(String(logDir)), String(day));
  const streams = {};
  for (const stream of STREAMS) {
    streams[stream] = readJsonlEntries(path.join(dayDir, `${stream}.jsonl`));
  }
  return { dayDir, streams };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolish(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function actionFromEntry(stream, entry) {
  const detail = entry?.detail && typeof entry.detail === 'object' ? entry.detail : {};
  if (stream === 'decisions') return detail.action || detail;
  if (stream === 'combat') return detail.action || detail;
  if (stream === 'actions') return detail.action || detail;
  if (entry?.type === 'movement-command') return detail.action || detail;
  if (detail.action) return detail.action;
  return null;
}

function targetFrom(action, detail = {}) {
  return action?.target
    || detail?.target
    || detail?.combat?.target
    || detail?.combat?.dryRun?.target
    || null;
}

function targetType(target, action) {
  const explicit = String(target?.type || '').trim();
  if (explicit) return explicit;
  const kind = String(action?.kind || '');
  if (target && (target.drop_id !== undefined || target.amount !== undefined || target.snapshotOnly)) return 'coin';
  if (target && (target.userId !== undefined || target.user_id !== undefined || target.entityId !== undefined || target.entity_id !== undefined)) return 'enemy';
  if (kind.includes('coin')) return 'coin';
  if (kind.includes('combat') || kind.includes('attack') || kind.includes('enemy')) return 'enemy';
  return '';
}

function targetId(target, type) {
  if (!target) return '';
  const value = type === 'coin'
    ? (target.id ?? target.drop_id ?? target.key)
    : (target.userId ?? target.user_id ?? target.entityId ?? target.entity_id ?? target.id);
  return value === undefined || value === null ? '' : String(value);
}

function actionDx(action) {
  return numberOrNull(action?.dx
    ?? action?.command?.dx
    ?? action?.movement?.command?.dx
    ?? action?.vector?.dx);
}

function actionDy(action) {
  return numberOrNull(action?.dy
    ?? action?.command?.dy
    ?? action?.movement?.command?.dy
    ?? action?.vector?.dy);
}

function actionShoots(action) {
  return Boolean(action?.shoot === true
    || action?.shoot?.command
    || action?.command?.type === 'shoot'
    || action?.movement?.shoot?.command
    || action?.lastShootCommand);
}

function normalizeAction(entry, stream) {
  const detail = entry?.detail && typeof entry.detail === 'object' ? entry.detail : {};
  const action = actionFromEntry(stream, entry);
  if (!action || typeof action !== 'object') return null;
  const target = targetFrom(action, detail);
  const kind = String(action.kind || detail.kind || entry?.type || '');
  const reason = String(action.reason || detail.reason || '');
  const band = String(action.band || detail.band || actionPriorityBand(action) || kind || '');
  const type = targetType(target, action);
  const authority = String(target?.authority
    || detail?.combat?.target?.authority
    || action?.authority
    || '');
  return {
    at: entry?.at || '',
    stream,
    entryType: entry?.type || '',
    band,
    kind,
    reason,
    targetType: type,
    targetId: targetId(target, type),
    authority,
    shouldLeave: Boolean(action.shouldLeave || action.leave || action.pendingExitIntent),
    shoot: actionShoots(action),
    dx: actionDx(action),
    dy: actionDy(action),
    target: target ? {
      active: boolish(target.active) || boolish(target.profitMetadataActive),
      moving: boolish(target.moving),
      firing: boolish(target.firing),
      snapshotOnly: boolish(target.snapshotOnly) || authority === 'snapshot',
      distance: numberOrNull(target.distance),
      amount: numberOrNull(target.amount),
      drop: numberOrNull(target.drop)
    } : null
  };
}

function classifyNormalizedAction(action) {
  const kind = String(action?.kind || '');
  const reason = String(action?.reason || '');
  const band = String(action?.band || '');
  const target = action?.target || {};
  if (!action) {
    return { status: GAP_MISSING, key: 'missing-action', message: 'no normalizable action evidence' };
  }
  if (action.targetType === 'coin' && (action.authority === 'snapshot' || target.snapshotOnly)) {
    return {
      status: GAP_TRANSPORT,
      key: 'snapshot-coin-fallback',
      message: 'direct pos frames do not currently expose realtime coins; guarded pushed snapshot coin is a transport fallback'
    };
  }
  if (kind === 'safety-exit' && reason === 'profit-live-snapshot-active-threat') {
    return {
      status: GAP_TRANSPORT,
      key: 'snapshot-active-threat-safety-exit',
      message: 'snapshot Active metadata remains a safety veto because direct realtime pos frames do not provide enough mode authority for combat/flee control'
    };
  }
  if (kind === 'safety-exit' && /^profit-live-(?:active-threat|injury-threat|combat-injury-threat)$/.test(reason)) {
    return {
      status: GAP_MISSING,
      key: 'browserless-safety-exit',
      message: 'browserless still exits for a threat branch where browser runtime may fight, flee, wait, or return-block'
    };
  }
  if (kind === 'safety-exit' && /^(?:combat-.*-leave|dynamic-whitelist-.*-leave|injury-leave|pursuit-leave|profit-live-critical-(?:threat|unknown-pressure))$/.test(reason)) {
    return {
      status: GAP_ALIGNED,
      key: 'browserless-survival-exit',
      message: 'browserless uses a browser-aligned survival exit branch'
    };
  }
  if (action.targetType === 'enemy' && (target.active || target.moving || target.firing) && band !== 'combat' && kind !== 'flee') {
    return {
      status: GAP_MISSING,
      key: 'active-target-outside-combat',
      message: 'active or moving/firing target was handled outside the combat/flee vocabulary'
    };
  }
  if (band === 'combat' && action.authority && action.authority !== 'realtime') {
    return {
      status: GAP_MISSING,
      key: 'combat-non-realtime-authority',
      message: 'combat target, aim, and fire must stay on realtime pos authority'
    };
  }
  if (kind === 'post-attack-drop-wait' || reason === 'post-attack-drop-coin') {
    return { status: GAP_ALIGNED, key: 'post-attack-drop', message: 'post-attack drop wait/pickup action vocabulary observed' };
  }
  if (kind === 'recover' || reason === 'recovery-foot-coin') {
    return { status: GAP_ALIGNED, key: 'recovery', message: 'recovery branch observed' };
  }
  if ((kind === 'leave' || kind === 'safety-exit') && /stamina-budget|1h/.test(reason)) {
    return { status: GAP_ALIGNED, key: 'stamina-budget-leave', message: '1h stamina-budget leave branch observed' };
  }
  if (reason === 'daily-stamina-final-coin' || action?.target?.dailyFinal) {
    return { status: GAP_ALIGNED, key: 'daily-final-coin', message: '1d final coin branch observed' };
  }
  if (kind === 'attack' && action.targetType === 'enemy' && !target.active && !target.moving && !target.firing) {
    return { status: GAP_ALIGNED, key: 'afk-attack', message: 'AFK attack action observed' };
  }
  if ((kind === 'coin' || kind === 'seek-coin') && action.targetType === 'coin') {
    return { status: GAP_ALIGNED, key: 'coin-profit', message: 'coin profit action observed' };
  }
  if (kind === 'wait') {
    return { status: GAP_ALIGNED, key: 'wait', message: 'wait action observed' };
  }
  return { status: GAP_ALIGNED, key: 'action-vocabulary', message: 'action is represented in the normalized browserless vocabulary' };
}

function increment(map, key) {
  const normalized = String(key || 'unknown');
  map[normalized] = Number(map[normalized] || 0) + 1;
}

function summarizeAudit(options = {}) {
  const logDir = path.resolve(String(options.logDir || path.join(process.cwd(), 'data', 'browserless-runner', 'logs')));
  const day = String(options.day || new Date().toISOString().slice(0, 10));
  const { dayDir, streams } = loadStreams(logDir, day);
  const records = [];
  const counts = {
    streams: {},
    actions: 0,
    byStatus: {},
    byKey: {}
  };
  for (const [stream, entries] of Object.entries(streams)) {
    counts.streams[stream] = entries.length;
    for (const entry of entries) {
      const normalized = normalizeAction(entry, stream);
      if (!normalized) continue;
      const classification = classifyNormalizedAction(normalized);
      records.push({ ...normalized, classification });
      counts.actions += 1;
      increment(counts.byStatus, classification.status);
      increment(counts.byKey, classification.key);
    }
  }
  const missing = records.filter(record => record.classification.status === GAP_MISSING);
  const exceptions = records.filter(record => record.classification.status === GAP_TRANSPORT);
  return {
    ok: missing.length === 0,
    day,
    logDir,
    dayDir,
    generatedAt: new Date().toISOString(),
    counts,
    missing,
    knownTransportExceptions: exceptions,
    records
  };
}

function usage() {
  return [
    'Usage: node scripts/browserless-action-parity-audit.js [--log-dir <dir>] [--day YYYY-MM-DD] [--json] [--fail-on-missing]',
    '',
    'Reads browserless runner/decisions/actions/combat JSONL logs and normalizes actions into:',
    '  band, kind, reason, targetType, targetId, authority, shouldLeave, shoot, dx, dy',
    '',
    'Statuses:',
    `  ${GAP_ALIGNED}`,
    `  ${GAP_TRANSPORT}`,
    `  ${GAP_MISSING}`
  ].join('\n');
}

function printHuman(summary) {
  console.log(`Browserless action parity audit: ${summary.ok ? 'ok' : 'gaps'}`);
  console.log(`Day: ${summary.day}`);
  console.log(`Log dir: ${summary.logDir}`);
  console.log(`Actions: ${summary.counts.actions}`);
  console.log(`Statuses: ${Object.entries(summary.counts.byStatus).map(([key, count]) => `${key}=${count}`).join(', ') || 'none'}`);
  if (summary.knownTransportExceptions.length) {
    console.log(`Known transport exceptions: ${summary.knownTransportExceptions.length}`);
  }
  if (summary.missing.length) {
    console.log('Missing browser branches:');
    for (const record of summary.missing.slice(0, 20)) {
      console.log(`- ${record.at || '(no time)'} ${record.kind}/${record.reason || '-'} target=${record.targetType}:${record.targetId || '-'} key=${record.classification.key}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const summary = summarizeAudit(args);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printHuman(summary);
  if (args.failOnMissing && !summary.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exitCode = 1;
  });
}

module.exports = {
  classifyNormalizedAction,
  loadStreams,
  normalizeAction,
  parseArgs,
  summarizeAudit
};
