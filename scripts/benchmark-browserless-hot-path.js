#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { performance } = require('perf_hooks');
const {
  buildBrowserlessDecision,
  buildBrowserlessRuntimeDefaults,
  buildBrowserlessStrategyInput,
  createBrowserlessDecisionAdapter,
  decisionStatePatch
} = require('../src/node/browserless/decision-adapter');
const { createBrowserlessDecisionState } = require('../src/node/browserless/decision-state');
const { createBrowserlessActionAdapter } = require('../src/node/browserless/action-adapter');
const { createBrowserlessStateStore } = require('../src/node/browserless/state-store');
const {
  browserlessStatsForDecision,
  browserlessCompactStatusSource,
  defaultBrowserlessState,
  mergeLiveState,
  mergeState,
  updateBrowserlessStateFile
} = require('../src/node/browserless/state-file');
const { runReadOnlyCanary } = require('../src/node/browserless/canary');
const { createBrowserlessBackgroundIo } = require('../src/node/browserless/background-io');
const { createLocalLogStore } = require('../src/node/browserless/local-log-store');
const { createChatService } = require('../src/node/browserless/chat-service');
const { createHighDropPlayerTracker } = require('../src/node/browserless/high-drop-player-tracker');
const { createEasyKillPlayerTracker } = require('../src/node/browserless/easy-kill-player-tracker');
const { createDailyDamagePlayerTracker } = require('../src/node/browserless/daily-damage-player-tracker');
const { createCombatCompletionTracker } = require('../src/node/browserless/combat-completion-tracker');
const { startStatusServer } = require('../src/node/browserless/status-server');

function parseArgs(argv) {
  const options = {
    iterations: 200,
    warmup: 20,
    maxMs: 50,
    learningFile: '',
    stateFile: '',
    realtimeEntities: 80,
    snapshotCoins: 88,
    bullets: 2,
    routePoolLimit: null,
    routeAnchorLimit: null,
    routeBeamWidth: null,
    canaryDurationMs: 3000,
    frameIntervalMs: 50,
    json: false,
    failOnBudget: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--iterations') options.iterations = Number(argv[++index]);
    else if (arg === '--warmup') options.warmup = Number(argv[++index]);
    else if (arg === '--max-ms') options.maxMs = Number(argv[++index]);
    else if (arg === '--learning-file') options.learningFile = String(argv[++index] || '');
    else if (arg === '--state-file') options.stateFile = String(argv[++index] || '');
    else if (arg === '--realtime-entities') options.realtimeEntities = Number(argv[++index]);
    else if (arg === '--snapshot-coins') options.snapshotCoins = Number(argv[++index]);
    else if (arg === '--bullets') options.bullets = Number(argv[++index]);
    else if (arg === '--route-pool-limit') options.routePoolLimit = Number(argv[++index]);
    else if (arg === '--route-anchor-limit') options.routeAnchorLimit = Number(argv[++index]);
    else if (arg === '--route-beam-width') options.routeBeamWidth = Number(argv[++index]);
    else if (arg === '--canary-duration-ms') options.canaryDurationMs = Number(argv[++index]);
    else if (arg === '--frame-interval-ms') options.frameIntervalMs = Number(argv[++index]);
    else if (arg === '--json') options.json = true;
    else if (arg === '--fail-on-budget') options.failOnBudget = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  options.iterations = Math.max(10, Math.round(Number(options.iterations) || 200));
  options.warmup = Math.max(0, Math.round(Number(options.warmup) || 0));
  options.maxMs = Math.max(1, Number(options.maxMs) || 50);
  options.realtimeEntities = Math.max(2, Math.round(Number(options.realtimeEntities) || 80));
  options.snapshotCoins = Math.max(0, Math.round(Number(options.snapshotCoins) || 88));
  options.bullets = Math.max(0, Math.round(Number(options.bullets) || 2));
  options.canaryDurationMs = Math.max(1000, Math.round(Number(options.canaryDurationMs) || 3000));
  options.frameIntervalMs = Math.max(1, Math.round(Number(options.frameIntervalMs) || 50));
  return options;
}

function usage() {
  return [
    'Usage: node scripts/benchmark-browserless-hot-path.js [options]',
    '',
    'Options:',
    '  --iterations <n>          Measured iterations. Default: 200',
    '  --warmup <n>              Warmup iterations. Default: 20',
    '  --max-ms <ms>             Main-thread budget. Default: 50',
    '  --learning-file <file>    Optional production combat-learning.json',
    '  --state-file <file>       Optional persisted state.json update benchmark',
    '  --realtime-entities <n>   Realtime entity count. Default: 80',
    '  --snapshot-coins <n>      Snapshot coin count. Default: 88',
    '  --bullets <n>             Realtime bullet count. Default: 2',
    '  --route-pool-limit <n>    Override coin-route candidate pool',
    '  --route-anchor-limit <n>  Override coin-route anchor count',
    '  --route-beam-width <n>    Override coin-route beam width',
    '  --canary-duration-ms <ms> Complete callback scenario duration. Default: 3000',
    '  --frame-interval-ms <ms>  Synthetic WS frame interval. Default: 50',
    '  --json                    Print JSON only',
    '  --fail-on-budget          Exit nonzero when a production hot task exceeds the budget'
  ].join('\n');
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function timingSummary(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const round = value => value === null ? null : Math.round(value * 1000) / 1000;
  return {
    count: sorted.length,
    minMs: round(sorted[0] ?? null),
    p50Ms: round(percentile(sorted, 0.5)),
    p90Ms: round(percentile(sorted, 0.9)),
    p95Ms: round(percentile(sorted, 0.95)),
    p99Ms: round(percentile(sorted, 0.99)),
    maxMs: round(sorted.length ? sorted[sorted.length - 1] : null),
    meanMs: round(sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null)
  };
}

function measure(iterations, callback) {
  const values = [];
  let lastValue;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    lastValue = callback(index);
    values.push(performance.now() - started);
  }
  return { values, lastValue, summary: timingSummary(values) };
}

async function measureYielding(iterations, callback) {
  const values = [];
  let lastValue;
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    lastValue = callback(index);
    values.push(performance.now() - started);
    // Production realtime control is paced by incoming frames rather than a
    // zero-gap synchronous loop. Yield after each measured callback so V8 and
    // Worker messages receive the same between-frame opportunity, while the
    // callback's own wall time remains strictly measured and gated.
    await new Promise(resolve => setImmediate(resolve));
  }
  return { values, lastValue, summary: timingSummary(values) };
}

async function measureSnapshotRefreshCycle(iterations, fixture, adapter) {
  const refreshValues = [];
  const controlValues = [];
  let lastValue;
  for (let index = 0; index < iterations; index += 1) {
    const snapshotNowMs = fixture.advance(160);
    fixture.state.fallback.tick = fixture.state.realtime.tick;
    fixture.state.fallback.receivedAtMs = snapshotNowMs;
    fixture.state.fallback.frameAgeMs = 0;
    let started = performance.now();
    adapter.refreshSnapshotObservation(fixture.state, {
      ...fixture.adapterOptions,
      nowMs: snapshotNowMs
    });
    refreshValues.push(performance.now() - started);
    const controlNowMs = fixture.advance(50);
    started = performance.now();
    lastValue = adapter.evaluateRealtime(fixture.state, {
      ...fixture.adapterOptions,
      nowMs: controlNowMs
    });
    controlValues.push(performance.now() - started);
    await new Promise(resolve => setImmediate(resolve));
  }
  return {
    refresh: { values: refreshValues, summary: timingSummary(refreshValues) },
    control: { values: controlValues, lastValue, summary: timingSummary(controlValues) }
  };
}

function loadCombatLearning(file) {
  if (!file) return null;
  const parsed = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  return parsed?.strategyLearning || null;
}

function createFixture(options, combatLearning) {
  const self = {
    entity_id: 106,
    user_id: 28886,
    name: 'self',
    x: 11627,
    y: 78946,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 6062,
    stamina_5s_limit_milli: 10000,
    stamina_1h_remaining_milli: 2107120,
    stamina_1h_limit_milli: 3000000,
    stamina_1d_remaining_milli: 11497840,
    stamina_1d_limit_milli: 20000000,
    death_drop_coins: 2804
  };
  const target = {
    entity_id: 200,
    user_id: 34683,
    name: 'active-target',
    x: 16916,
    y: 89196,
    vx: -35,
    vy: -35,
    hp: 97,
    max_hp: 100,
    current_join_mode: 'Active',
    stamina_5s_remaining_milli: 8138,
    stamina_5s_limit_milli: 10000,
    stamina_1h_remaining_milli: 2776452,
    stamina_1h_limit_milli: 3000000,
    stamina_1d_remaining_milli: 10886297,
    stamina_1d_limit_milli: 20000000,
    death_drop_coins: 1703
  };
  const passives = Array.from({ length: options.realtimeEntities - 2 }, (_, index) => {
    const angle = index / Math.max(1, options.realtimeEntities - 2) * Math.PI * 2;
    const distance = 7000 + index * 500;
    return {
      entity_id: 2000 + index,
      user_id: 40000 + index,
      name: `passive-${index}`,
      x: Math.round(self.x + Math.cos(angle) * distance),
      y: Math.round(self.y + Math.sin(angle) * distance),
      vx: 0,
      vy: 0,
      hp: 100,
      max_hp: 100,
      current_join_mode: 'Passive',
      stamina_5s_remaining_milli: 10000,
      stamina_5s_limit_milli: 10000,
      death_drop_coins: index % 3
    };
  });
  const entities = [self, target, ...passives];
  const coinDrops = Array.from({ length: options.snapshotCoins }, (_, index) => ({
    drop_id: 5000 + index,
    x: self.x + 2000 + (index % 11) * 4000,
    y: self.y + 1000 + Math.floor(index / 11) * 5000,
    amount: index % 17 === 0 ? 10 : 1
  }));
  const bullets = Array.from({ length: options.bullets }, (_, index) => ({
    bullet_id: index + 1,
    owner_user_id: index % 2 === 0 ? target.user_id : self.user_id,
    start_x: index % 2 === 0 ? target.x : self.x,
    start_y: index % 2 === 0 ? target.y : self.y,
    dir_x_micros: index % 2 === 0 ? -500000 : 500000,
    dir_y_micros: index % 2 === 0 ? -500000 : 500000,
    range_cm: 15000,
    speed_per_tick: 500,
    created_tick: 844280,
    expire_tick: 844310
  }));
  let nowMs = Date.parse('2026-07-15T03:45:44.260Z');
  const state = {
    userId: self.user_id,
    realtime: {
      tick: 844286,
      receivedAtMs: nowMs,
      frameAgeMs: 0,
      self,
      entities,
      bullets,
      coinDrops: []
    },
    fallback: {
      tick: 844269,
      receivedAtMs: nowMs - 3543,
      frameAgeMs: 3543,
      self,
      entities,
      bullets: [],
      coinDrops,
      messages: []
    },
    command: {
      shooting: {
        acceptedShots: [],
        executionDelay: { medianTicks: 5, p90Ticks: 5, madTicks: 0 }
      }
    }
  };
  const runtimeDefaults = buildBrowserlessRuntimeDefaults({});
  const adapterOptions = {
    ...runtimeDefaults,
    userId: self.user_id,
    now: () => nowMs,
    nowMs,
    controlMode: 'profit-live',
    combatEnabled: true,
    decisionIntervalMs: 1000,
    combatLearning,
    ...(Number.isFinite(options.routePoolLimit) ? { coinRoutePoolLimit: Math.max(2, Math.round(options.routePoolLimit)) } : {}),
    ...(Number.isFinite(options.routeAnchorLimit) ? { coinRouteAnchorLimit: Math.max(1, Math.round(options.routeAnchorLimit)) } : {}),
    ...(Number.isFinite(options.routeBeamWidth) ? { coinRouteBeamWidth: Math.max(1, Math.round(options.routeBeamWidth)) } : {})
  };
  return {
    self,
    target,
    entities,
    coinDrops,
    bullets,
    state,
    runtimeDefaults,
    adapterOptions,
    now: () => nowMs,
    advance(ms) {
      nowMs += ms;
      state.realtime.tick += Math.max(1, Math.round(ms / 160));
      state.realtime.receivedAtMs = nowMs;
      adapterOptions.nowMs = nowMs;
      return nowMs;
    }
  };
}

function encodeGrzFrame(value) {
  return Buffer.concat([
    Buffer.from('GRZ1', 'ascii'),
    Buffer.from([1]),
    zlib.gzipSync(Buffer.from(JSON.stringify(value), 'utf8'))
  ]);
}

function emptyTargetWhitelist() {
  return {
    names: [],
    userIds: [],
    nameSet: new Set(),
    userIdSet: new Set(),
    refresh: async () => ({ loaded: true, count: 0 }),
    isWhitelistedTarget: () => false
  };
}

async function runCompleteCallbackScenario(options, combatLearning, activeCombat) {
  const fixture = createFixture(options, combatLearning);
  if (!activeCombat) {
    Object.assign(fixture.target, {
      vx: 0,
      vy: 0,
      firing: false,
      current_join_mode: 'Passive',
      stamina_5s_remaining_milli: 10000,
      stamina_5s_limit_milli: 10000
    });
    fixture.bullets.splice(0, fixture.bullets.length);
  } else {
    fixture.target.firing = true;
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `grasp-rat-hot-path-canary-${process.pid}-`));
  const backgroundIo = createBrowserlessBackgroundIo();
  const logStore = createLocalLogStore({ logDir: path.join(temporary, 'logs'), backgroundIo });
  const dataDir = path.join(temporary, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const productionDataDir = options.learningFile
    ? path.dirname(path.resolve(options.learningFile))
    : '';
  const fixtureFile = name => {
    const destination = path.join(dataDir, name);
    const source = productionDataDir ? path.join(productionDataDir, name) : '';
    if (source && fs.existsSync(source)) fs.copyFileSync(source, destination);
    return destination;
  };
  const combatCompletionTracker = createCombatCompletionTracker({
    file: fixtureFile('combat-learning.json'),
    now: fixture.now,
    backgroundIo
  });
  const easyKillPlayerTracker = createEasyKillPlayerTracker({
    file: fixtureFile('easy-kill-players.json'),
    now: fixture.now,
    backgroundIo,
    onEvent: event => {
      combatCompletionTracker.observe(event);
      logStore.append('runner', 'easy-kill-player-outcome', event);
    }
  });
  const damagePlayerTracker = createDailyDamagePlayerTracker({
    file: fixtureFile('daily-damage-players.json'),
    now: fixture.now,
    backgroundIo,
    onEvent: event => logStore.append('runner', 'daily-damage-player', event)
  });
  const highDropPlayerTracker = createHighDropPlayerTracker({
    file: fixtureFile('high-drop-players.json'),
    now: fixture.now,
    backgroundIo
  });
  const chatService = createChatService({
    now: fixture.now,
    selfUserId: fixture.self.user_id
  });
  const observeSnapshotPayload = (payload, detail = {}) => {
    const atMs = Number(detail.observedAtMs || fixture.now());
    chatService.observeSnapshot(payload, { ...detail, observedAtMs: atMs });
    easyKillPlayerTracker.observePlayerNames(payload?.entities || [], {
      atMs,
      source: detail.source || 'snapshot',
      tick: payload?.tick
    });
    damagePlayerTracker.observePlayerNames(payload?.entities || [], {
      atMs,
      source: detail.source || 'snapshot',
      tick: payload?.tick
    });
    const observed = highDropPlayerTracker.observeSnapshot(payload, {
      ...detail,
      observedAtMs: atMs,
      selfUserId: fixture.self.user_id
    });
    if (observed.updated > 0) {
      logStore.append('runner', 'high-drop-player-observation', {
        source: detail.source || 'snapshot',
        observed: observed.observed,
        updated: observed.updated,
        playerCount: observed.playerCount
      });
    }
  };
  let liveState = options.stateFile
    ? JSON.parse(fs.readFileSync(path.resolve(options.stateFile), 'utf8'))
    : defaultBrowserlessState();
  const patchLiveState = patch => {
    liveState = mergeLiveState(liveState, { ...patch, updatedAt: new Date().toISOString() });
  };
  const observeDecision = decision => {
    const before = liveState;
    patchLiveState({
      ...decisionStatePatch(decision),
      stats: browserlessStatsForDecision(before, decision, { nowMs: Date.now() })
    });
  };
  let timer = null;
  let statusTimer = null;
  let statusSequence = 0;
  const statusRequests = new Set();
  const concurrentStatus = {
    fullDispatch: [],
    fullResponse: [],
    compactDispatch: [],
    compactResponse: []
  };
  const statusConfig = {
    dataDir,
    logDir: path.join(temporary, 'logs'),
    statusHost: '127.0.0.1',
    statusPort: 18767,
    webToken: 'present'
  };
  const statusCache = {
    full: { text: '', at: 0, inFlight: null },
    compact: { text: '', at: 0, inFlight: null }
  };
  const refreshStatusCache = compact => {
    const cache = compact ? statusCache.compact : statusCache.full;
    if (cache.inFlight) return cache.inFlight;
    const rawSource = {
      ...liveState,
      highDropPlayers: highDropPlayerTracker.status(fixture.now()),
      easyKillPlayers: easyKillPlayerTracker.status(),
      dailyDamagePlayers: damagePlayerTracker.status(fixture.now()),
      chat: chatService.status(fixture.now())
    };
    const source = compact ? browserlessCompactStatusSource(rawSource) : rawSource;
    cache.inFlight = backgroundIo.renderStatus(source, statusConfig, compact)
      .then(rendered => {
        cache.text = rendered.text;
        cache.at = performance.now();
        return rendered.text;
      })
      .finally(() => {
        cache.inFlight = null;
      });
    return cache.inFlight;
  };
  const scheduleStatusRender = () => {
    const compact = statusSequence % 4 !== 0;
    statusSequence += 1;
    const dispatchStarted = performance.now();
    const cache = compact ? statusCache.compact : statusCache.full;
    const text = cache.text;
    const ttlMs = compact ? 500 : 1000;
    if (performance.now() - cache.at >= ttlMs && !cache.inFlight) {
      setImmediate(() => refreshStatusCache(compact).catch(() => {}));
    }
    const dispatchMs = performance.now() - dispatchStarted;
    concurrentStatus[compact ? 'compactDispatch' : 'fullDispatch'].push(dispatchMs);
    const tracked = Promise.resolve().then(() => {
      const responseStarted = performance.now();
      Buffer.byteLength(text);
      concurrentStatus[compact ? 'compactResponse' : 'fullResponse'].push(performance.now() - responseStarted);
    });
    statusRequests.add(tracked);
    tracked.finally(() => statusRequests.delete(tracked));
  };
  const snapshotFrame = encodeGrzFrame({
    type: 'snapshot',
    tick: fixture.state.fallback.tick,
    entities: fixture.entities,
    bullets: [],
    coin_drops: fixture.coinDrops,
    messages: []
  });
  const frameCount = Math.ceil(options.canaryDurationMs / options.frameIntervalMs) + 8;
  const posFrames = Array.from({ length: frameCount }, (_, index) => encodeGrzFrame({
    type: 'pos',
    tick: fixture.state.realtime.tick + index + 1,
    entities: fixture.entities,
    bullets: fixture.bullets
  }));
  let posFrameIndex = 0;
  try {
    await Promise.all([refreshStatusCache(false), refreshStatusCache(true)]);
    scheduleStatusRender();
    statusTimer = setInterval(scheduleStatusRender, 250);
    statusTimer.unref?.();
    const result = await runReadOnlyCanary({
      ...fixture.adapterOptions,
      gameOrigin: 'https://benchmark.invalid',
      userId: fixture.self.user_id,
      sessionToken: 'benchmark-session',
      controlMode: 'profit-live',
      combatEnabled: true,
      readOnlyProbeMs: options.canaryDurationMs,
      decisionIntervalMs: 1000,
      combatControlIntervalMs: 50,
      movementCommandIntervalMs: 500,
      frameGapAlertMs: 5000,
      wsTraceEnabled: true,
      wsTracePayload: false
    }, {
      useDecisionWorker: true,
      mainThreadBudgetMs: options.maxMs,
      logStore,
      easyKillPlayerTracker,
      combatCompletionTracker,
      damagePlayerTracker,
      onSnapshotPayload: observeSnapshotPayload,
      onDecision: observeDecision,
      onCombatControl: observeDecision,
      onAction: (action, context = {}) => patchLiveState({
        runner: {
          currentAction: { ...(action || {}), actionState: context.actionState || null }
        },
        current: {
          action: { ...(action || {}), actionState: context.actionState || null }
        }
      }),
      targetWhitelist: emptyTargetWhitelist(),
      precheckedSnapshotSafety: { ok: true, reason: 'benchmark-prechecked', satisfied: true },
      persistedState: {
        loginPointSafety: {
          point: { x: fixture.self.x, y: fixture.self.y, hp: fixture.self.hp, source: 'benchmark' }
        }
      },
      openBrowserlessWs: async wsOptions => {
        setImmediate(() => wsOptions.onMessage(snapshotFrame));
        timer = setInterval(() => {
          const frame = posFrames[Math.min(posFrameIndex, posFrames.length - 1)];
          posFrameIndex += 1;
          wsOptions.onMessage(frame);
        }, options.frameIntervalMs);
        timer.unref?.();
        return {
          isOpen: () => true,
          close() {
            if (timer) clearInterval(timer);
            timer = null;
          },
          sendVelocity() {},
          sendShoot() {}
        };
      },
      leaveWithVerification: async () => ({ ok: true, attempts: [{ ok: true }] })
    });
    return {
      ok: result.ok,
      activeCombat,
      frameCount: result.hotPath?.tasks?.['ws-message']?.count || 0,
      realtimeControlCount: Number(result.decisions?.realtimeControlCount || 0),
      realtimeControlSchedule: result.decisions?.realtimeControlSchedule || null,
      hotPath: result.hotPath,
      concurrentStatus: {
        fullDispatch: timingSummary(concurrentStatus.fullDispatch),
        fullResponse: timingSummary(concurrentStatus.fullResponse),
        compactDispatch: timingSummary(concurrentStatus.compactDispatch),
        compactResponse: timingSummary(concurrentStatus.compactResponse)
      },
      worker: result.decisions?.worker || null
    };
  } finally {
    if (timer) clearInterval(timer);
    if (statusTimer) clearInterval(statusTimer);
    await Promise.allSettled(Array.from(statusRequests));
    await backgroundIo.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function benchmarkPersistedState(file, iterations) {
  if (!file) return null;
  const temporary = path.join(os.tmpdir(), `grasp-rat-hot-path-state-${process.pid}.json`);
  fs.copyFileSync(path.resolve(file), temporary);
  try {
    const measured = measure(iterations, index => updateBrowserlessStateFile(temporary, {
      runner: { currentAction: { kind: 'combat-live', sequence: index } }
    }));
    return {
      bytes: fs.statSync(temporary).size,
      updateMs: measured.summary
    };
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function optionalJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function requestAndDiscard(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      response.on('error', reject);
      response.resume();
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`status benchmark request failed with HTTP ${response.statusCode}`));
          return;
        }
        resolve(true);
      });
    });
    request.on('error', reject);
  });
}

async function benchmarkStatusRendering(options) {
  if (!options.stateFile) return null;
  const stateFile = path.resolve(options.stateFile);
  const dataDir = path.dirname(stateFile);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const highDrop = optionalJson(path.join(dataDir, 'high-drop-players.json'), {});
  const easyKill = optionalJson(path.join(dataDir, 'easy-kill-players.json'), {});
  const damage = optionalJson(path.join(dataDir, 'daily-damage-players.json'), {});
  const source = {
    ...state,
    highDropPlayers: {
      day: highDrop?.day || '',
      updatedAt: highDrop?.updatedAt || '',
      lastSnapshotAt: highDrop?.lastSnapshotAt || '',
      lastSnapshotSource: highDrop?.lastSnapshotSource || '',
      players: Object.values(highDrop?.players || {})
    },
    easyKillPlayers: {
      updatedAt: easyKill?.updatedAt || '',
      players: Object.values(easyKill?.players || {}),
      engagements: Object.values(easyKill?.engagements || {})
    },
    dailyDamagePlayers: {
      day: damage?.day || '',
      updatedAt: damage?.updatedAt || '',
      players: Object.values(damage?.players || {})
    },
    chat: { ok: true, messages: [] }
  };
  const projectionStarted = performance.now();
  const compactSource = browserlessCompactStatusSource(source);
  const compactProjectionMs = performance.now() - projectionStarted;
  const config = {
    dataDir,
    logDir: '/var/log/grasp-rat-browserless',
    statusHost: '127.0.0.1',
    statusPort: 18767,
    webToken: 'present'
  };
  const iterations = Math.min(20, Math.max(5, Math.ceil(options.iterations / 50)));
  const backgroundIo = createBrowserlessBackgroundIo();
  let statusHandle = null;
  const fullPost = [];
  const fullCompute = [];
  const fullRoundTrip = [];
  const compactPost = [];
  const compactCompute = [];
  const compactRoundTrip = [];
  const fullDispatch = [];
  const fullResponse = [];
  const compactDispatch = [];
  const compactResponse = [];
  let fullBytes = 0;
  let compactBytes = 0;
  let secretsRedacted = true;
  try {
    const fullRendered = await backgroundIo.renderStatus(source, config, false);
    const compactRendered = await backgroundIo.renderStatus(compactSource, config, true);
    fullPost.push(fullRendered.postMs);
    fullCompute.push(fullRendered.computeMs);
    fullRoundTrip.push(fullRendered.roundTripMs);
    compactPost.push(compactRendered.postMs);
    compactCompute.push(compactRendered.computeMs);
    compactRoundTrip.push(compactRendered.roundTripMs);
    fullBytes = fullRendered.bytes || Buffer.byteLength(fullRendered.text);
    compactBytes = compactRendered.bytes || Buffer.byteLength(compactRendered.text);
    if (state?.session?.sessionToken && (fullRendered.text.includes(String(state.session.sessionToken))
      || compactRendered.text.includes(String(state.session.sessionToken)))) secretsRedacted = false;
    statusHandle = await startStatusServer({
      host: '127.0.0.1',
      port: 0,
      webToken: 'benchmark-token',
      getStatusText: async () => fullRendered.text,
      getCompactStatusText: async () => compactRendered.text,
      onMainThreadTask(task, durationMs, detail = {}) {
        if (task === 'status-full-dispatch') fullDispatch.push(durationMs);
        else if (task === 'status-compact-dispatch') compactDispatch.push(durationMs);
        else if (task === 'status-response' && detail.compact) compactResponse.push(durationMs);
        else if (task === 'status-response') fullResponse.push(durationMs);
      }
    });
    const baseUrl = `http://127.0.0.1:${statusHandle.port}`;
    for (let index = 0; index < iterations; index += 1) {
      await requestAndDiscard(`${baseUrl}/api/status?token=benchmark-token`);
    }
    for (let index = 0; index < iterations; index += 1) {
      await requestAndDiscard(`${baseUrl}/api/panel-status?token=benchmark-token`);
    }
  } finally {
    await statusHandle?.close?.();
    await backgroundIo.close();
  }
  return {
    iterations,
    fullBytes,
    compactBytes,
    compactProjectionMs,
    secretsRedacted,
    fullDispatch: timingSummary(fullDispatch),
    fullResponse: timingSummary(fullResponse),
    compactDispatch: timingSummary(compactDispatch),
    compactResponse: timingSummary(compactResponse),
    workerFullPost: timingSummary(fullPost),
    workerFullCompute: timingSummary(fullCompute),
    workerFullRoundTrip: timingSummary(fullRoundTrip),
    workerCompactPost: timingSummary(compactPost),
    workerCompactCompute: timingSummary(compactCompute),
    workerCompactRoundTrip: timingSummary(compactRoundTrip)
  };
}

async function runBenchmark(options) {
  const combatLearning = loadCombatLearning(options.learningFile);
  const fixture = createFixture(options, combatLearning);
  const decisionAdapter = createBrowserlessDecisionAdapter(fixture.adapterOptions);
  for (let index = 0; index < options.warmup; index += 1) {
    fixture.advance(50);
    decisionAdapter.evaluateRealtime(fixture.state, {
      ...fixture.adapterOptions,
      nowMs: fixture.now()
    });
  }
  const realtimeControl = await measureYielding(options.iterations, () => {
    fixture.advance(50);
    return decisionAdapter.evaluateRealtime(fixture.state, {
      ...fixture.adapterOptions,
      nowMs: fixture.now()
    });
  });
  const snapshotRefreshFixture = createFixture(options, combatLearning);
  const snapshotRefreshAdapter = createBrowserlessDecisionAdapter(snapshotRefreshFixture.adapterOptions);
  await measureSnapshotRefreshCycle(options.warmup, snapshotRefreshFixture, snapshotRefreshAdapter);
  const snapshotRefreshCycle = await measureSnapshotRefreshCycle(
    options.iterations,
    snapshotRefreshFixture,
    snapshotRefreshAdapter
  );
  const snapshotObservationPrime = snapshotRefreshCycle.refresh;
  const realtimeSnapshotRefresh = snapshotRefreshCycle.control;
  const decisionStateClone = measure(options.iterations, () => decisionAdapter.getState());
  const stateStore = createBrowserlessStateStore({ userId: fixture.self.user_id, now: fixture.now });
  const frameIngest = measure(options.iterations, index => {
    const atMs = fixture.advance(50);
    stateStore.ingestFrame({
      type: 'pos',
      tick: 900000 + index,
      entities: fixture.entities,
      bullets: fixture.bullets
    }, { receivedAtMs: atMs });
    return stateStore.getDecisionState(atMs);
  });
  const actionAdapter = createBrowserlessActionAdapter({
    ...fixture.runtimeDefaults,
    now: fixture.now,
    transport: { sendVelocity() {}, sendShoot() {} },
    decisionIntervalMs: 1000,
    commandIntervalMs: 500,
    velocityRepeatEnabled: false,
    shootRepeatEnabled: false
  });
  const actionApply = measure(options.iterations, () => actionAdapter.applyDecision(
    fixture.state,
    realtimeControl.lastValue
  ));
  const idleScenario = await runCompleteCallbackScenario(options, combatLearning, false);
  const combatScenario = await runCompleteCallbackScenario(options, combatLearning, true);
  const statusRendering = await benchmarkStatusRendering(options);
  const diagnosticFixture = createFixture(options, combatLearning);
  const diagnosticState = createBrowserlessDecisionState({ combatLearning });
  for (let index = 0; index < options.warmup; index += 1) {
    diagnosticFixture.advance(1000);
    buildBrowserlessDecision(diagnosticFixture.state, diagnosticState, {
      ...diagnosticFixture.adapterOptions,
      nowMs: diagnosticFixture.now()
    });
  }
  const strategyInput = measure(options.iterations, () => buildBrowserlessStrategyInput(
    diagnosticFixture.state,
    { ...diagnosticFixture.adapterOptions, nowMs: diagnosticFixture.now() },
    diagnosticState
  ));
  const fullDecision = measure(options.iterations, () => {
    diagnosticFixture.advance(1000);
    return buildBrowserlessDecision(diagnosticFixture.state, diagnosticState, {
      ...diagnosticFixture.adapterOptions,
      nowMs: diagnosticFixture.now()
    });
  });
  const persistedState = benchmarkPersistedState(options.stateFile, Math.min(options.iterations, 50));
  const productionHotTasks = {
    idleWsMessage: idleScenario.hotPath?.tasks?.['ws-message'] || null,
    idlePlannerResponse: idleScenario.hotPath?.tasks?.['planner-response'] || null,
    idleSnapshotObserverUpdate: idleScenario.hotPath?.tasks?.['snapshot-observer-update'] || null,
    idleSnapshotObservationRefresh: idleScenario.hotPath?.tasks?.['snapshot-observation-refresh'] || null,
    combatWsMessage: combatScenario.hotPath?.tasks?.['ws-message'] || null,
    combatPlannerResponse: combatScenario.hotPath?.tasks?.['planner-response'] || null,
    combatSnapshotObserverUpdate: combatScenario.hotPath?.tasks?.['snapshot-observer-update'] || null,
    combatSnapshotObservationRefresh: combatScenario.hotPath?.tasks?.['snapshot-observation-refresh'] || null,
    combatPersistenceSchedule: combatScenario.hotPath?.tasks?.['combat-persistence-schedule'] || null,
    idleConcurrentFullStatusDispatch: idleScenario.concurrentStatus?.fullDispatch || null,
    idleConcurrentFullStatusResponse: idleScenario.concurrentStatus?.fullResponse || null,
    idleConcurrentCompactStatusDispatch: idleScenario.concurrentStatus?.compactDispatch || null,
    idleConcurrentCompactStatusResponse: idleScenario.concurrentStatus?.compactResponse || null,
    combatConcurrentFullStatusDispatch: combatScenario.concurrentStatus?.fullDispatch || null,
    combatConcurrentFullStatusResponse: combatScenario.concurrentStatus?.fullResponse || null,
    combatConcurrentCompactStatusDispatch: combatScenario.concurrentStatus?.compactDispatch || null,
    combatConcurrentCompactStatusResponse: combatScenario.concurrentStatus?.compactResponse || null,
    fullStatusDispatch: statusRendering?.fullDispatch || null,
    fullStatusResponse: statusRendering?.fullResponse || null,
    compactStatusDispatch: statusRendering?.compactDispatch || null,
    compactStatusResponse: statusRendering?.compactResponse || null,
    realtimeControl: realtimeControl.summary,
    standaloneSnapshotObservationPrime: snapshotObservationPrime.summary,
    realtimeSnapshotRefresh: realtimeSnapshotRefresh.summary,
    realtimeFrameIngestView: frameIngest.summary,
    actionApply: actionApply.summary
  };
  const overBudget = Object.entries(productionHotTasks)
    .filter(([, summary]) => summary && Number(summary.maxMs) >= options.maxMs)
    .map(([name, summary]) => ({ name, maxMs: summary.maxMs }));
  const validationErrors = [];
  if (statusRendering && !statusRendering.secretsRedacted) validationErrors.push('status-secret-redaction-failed');
  if (Number(combatScenario.realtimeControlCount || 0) < 40) {
    validationErrors.push('combat-realtime-control-below-20hz-sample-floor');
  }
  if (Number(combatScenario.realtimeControlSchedule?.minimumTickStride || 0) !== 1) {
    validationErrors.push('combat-realtime-control-not-single-tick');
  }
  return {
    environment: {
      arch: process.arch,
      node: process.version,
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || '',
      loadAverage: os.loadavg()
    },
    fixture: {
      realtimeEntities: fixture.entities.length,
      snapshotEntities: fixture.entities.length,
      snapshotCoins: fixture.coinDrops.length,
      bullets: fixture.bullets.length,
      combatLearningBytes: options.learningFile ? fs.statSync(path.resolve(options.learningFile)).size : 0
    },
    budgetMs: options.maxMs,
    accepted: overBudget.length === 0 && validationErrors.length === 0,
    overBudget,
    validationErrors,
    timings: {
      strategyInput: strategyInput.summary,
      backgroundFullDecision: fullDecision.summary,
      realtimeControl: realtimeControl.summary,
      standaloneSnapshotObservationPrime: snapshotObservationPrime.summary,
      realtimeSnapshotRefresh: realtimeSnapshotRefresh.summary,
      decisionStateClone: decisionStateClone.summary,
      realtimeFrameIngestView: frameIngest.summary,
      actionApply: actionApply.summary,
      statusRendering,
      persistedState
    },
    mainThreadTasks: productionHotTasks,
    completeCallbacks: {
      idle: idleScenario,
      combat: combatScenario
    },
    excludedFromMainThreadGate: {
      backgroundFullDecision: fullDecision.summary,
      statusWorkerFullCompute: statusRendering?.workerFullCompute || null,
      statusWorkerFullRoundTrip: statusRendering?.workerFullRoundTrip || null,
      statusWorkerCompactCompute: statusRendering?.workerCompactCompute || null,
      statusWorkerCompactRoundTrip: statusRendering?.workerCompactRoundTrip || null,
      offlinePersistedStateUpdate: persistedState?.updateMs || null
    }
  };
}

function printHuman(result) {
  console.log(`Browserless hot-path benchmark: ${result.accepted ? 'accepted' : 'over budget'}`);
  console.log(`Budget: < ${result.budgetMs}ms`);
  console.log(`Fixture: ${result.fixture.realtimeEntities} realtime entities, ${result.fixture.snapshotCoins} snapshot coins, ${result.fixture.bullets} bullets`);
  for (const [name, value] of Object.entries(result.timings)) {
    const summary = value?.updateMs || value;
    if (!summary || summary.maxMs === undefined) continue;
    console.log(`- ${name}: p50=${summary.p50Ms}ms p95=${summary.p95Ms}ms p99=${summary.p99Ms}ms max=${summary.maxMs}ms`);
  }
  for (const [name, summary] of Object.entries(result.mainThreadTasks || {})) {
    if (!summary || summary.maxMs === undefined) continue;
    console.log(`- main-thread ${name}: mean=${Math.round(Number(summary.meanMs || 0) * 1000) / 1000}ms max=${summary.maxMs}ms`);
  }
  for (const item of result.overBudget) console.log(`- over-budget ${item.name}: ${item.maxMs}ms`);
  for (const item of result.validationErrors || []) console.log(`- validation-error ${item}`);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error?.message || String(error));
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await runBenchmark(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  if (options.failOnBudget && !result.accepted) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  createFixture,
  parseArgs,
  runBenchmark,
  timingSummary
};
