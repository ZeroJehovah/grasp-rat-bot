'use strict';
const path = require('node:path');

async function profit_score() {
 const console = { log() {} };

const path = require('node:path').resolve(__dirname, '..');
const { buildOpportunityDecision, scoreEnemyOpportunity, opportunityEnemyStaminaCost } = require(path + '/src/node/browserless/decision-adapter');
const { playerProfitScoreMultiplierCore } = require(path + '/src/strategy/player-profit-score');
const now = Date.parse('2026-11-08T04:00:00Z');
const options = {
  profitThresholdContext: { active: true, threshold: { rewardCoins: 1, staminaMilli: 10000 } },
  enemyMissingHoldMs: 1800,
  opportunitySwitchHoldMs: 1800
};
function input(at, targets, coins = []) {
  return { self: { x: 0, y: 0, hp: 100, max_hp: 100,
    stamina_5s_remaining_milli: 10000, stamina_1h_remaining_milli: 3000000, stamina_1d_remaining_milli: 10000000 },
    nowMs: at, profitCoins: coins, afkTargets: targets, easyKillTargets: [], activeThreats: [], avoidanceThreats: [], bullets: [],
    realtime: { tick: 100 + (at - now) / 50 }, stamina: {}, profitCoinSource: 'realtime', realtimeObservedCoins: [], snapshotVisibleCoins: [] };
}
function caseFor(drop) {
  const target = { user_id: 'audit-target', x: 30000, y: 0, distance: 30000,
    hp: 100, max_hp: 100, drop, dropKnown: true, active: false, alive: true, authority: 'realtime' };
  const state = {};
  const first = buildOpportunityDecision(input(now, [target]), state, options);
  state.currentOpportunity = first.opportunityChoice;
  const missing = buildOpportunityDecision(input(now + 1000, []), state, options);
  return { drop, multiplier: playerProfitScoreMultiplierCore(drop),
    first: { choice: first.choice, remembered: first.opportunityChoice },
    missing: { choice: missing.choice, hold: missing.missingEnemyHold },
    sameEconomicsVisibleScore: scoreEnemyOpportunity(target, options),
    sameEconomicsCost: opportunityEnemyStaminaCost(target, options) };
}
const result = [50, 100, 450].map(caseFor);
function switchingCase(explicitWeight, visible) {
  const opts = { ...options, ...(explicitWeight ? { enemyOpportunityValue: 60000 } : {}) };
  const held = { user_id: 'audit-target', x: 30000, y: 0, distance: 30000,
    hp: 100, max_hp: 100, drop: 450, dropKnown: true, active: false, alive: true, authority: 'realtime' };
  const competitor = { drop_id: 'audit-alternative', x: 1000, y: 0, distance: 1000, amount: 10, authority: 'realtime' };
  const state = {};
  const first = buildOpportunityDecision(input(now, [held]), state, opts);
  state.currentOpportunity = first.opportunityChoice;
  const frames = [];
  let next;
  for (const age of [1000]) {
    next = buildOpportunityDecision(input(now + age, visible ? [held] : [], [competitor]), state, opts);
    frames.push({ age, chosen: next.choice?.id, rejection: next.switchDiagnostics?.bestRejectedReason });
    state.currentOpportunity = next.opportunityChoice;
    state.switchLock = next.switchLock;
  }
  return { explicitWeight, visible, chosen: next.choice?.id,
    frames,
    scores: next.opportunities.map(x => ({ id: x.id, score: x.score, reward: x.reward, staminaCost: x.staminaCost, priorityTier: x.priorityTier, reason: x.reason })),
    switch: next.switchDiagnostics, missingHold: next.missingEnemyHold };
}
const switching = [false, true].flatMap(w => [true, false].map(v => switchingCase(w, v)));
const assert = require('assert/strict');
for (const row of switching) assert.equal(row.chosen, 'audit-target');
for (const row of result) {
  assert.equal(row.first.choice.staminaCost, row.missing.choice.staminaCost);
  assert.equal(row.first.choice.reward, row.missing.choice.reward);
  assert(Math.abs(row.first.choice.score / row.missing.choice.score - 1) < 1e-6);
}
const output = { scoring: result, switching };
console.log(JSON.stringify({ assertionsPassed: true, scoring: result.map(x => ({ drop: x.drop, multiplier: x.multiplier,
  firstScore: x.first.choice?.score, firstCost: x.first.choice?.staminaCost, firstReward: x.first.choice?.reward,
  missingScore: x.missing.choice?.score, missingCost: x.missing.choice?.staminaCost, missingReward: x.missing.choice?.reward,
  missingReason: x.missing.choice?.reason })), switching }, null, 2));

}

async function coin_anchors() {
 const console = { log() {} };

const path = require('node:path').resolve(__dirname, '..');
const { buildOpportunityDecision, BROWSER_RUNTIME_DEFAULTS } = require(path + '/src/node/browserless/decision-adapter');
const now = Date.parse('2026-11-08T04:00:00Z');
const decoys = Array.from({ length: 22 }, (_, i) => ({ drop_id: `early-${i}`, x: -40000, y: i * 100, amount: 1, authority: 'realtime' }));
const dense = Array.from({ length: 6 }, (_, i) => ({ drop_id: `late-${i}`, x: 20000 + i * 100, y: 0, amount: 1, authority: 'realtime' }));
function caseFor(lateFirst) {
  const coins = (lateFirst ? [...dense, ...decoys] : [...decoys, ...dense]).map(c => ({ ...c, distance: Math.hypot(c.x, c.y) }));
  const input = { self: { x: 0, y: 0, hp: 100, max_hp: 100,
    stamina_5s_remaining_milli: 10000, stamina_1h_remaining_milli: 3000000, stamina_1d_remaining_milli: 10000000 },
    nowMs: now, profitCoins: coins, afkTargets: [], easyKillTargets: [], activeThreats: [], avoidanceThreats: [], bullets: [],
    realtime: { tick: 100 }, stamina: {}, profitCoinSource: 'realtime', realtimeObservedCoins: coins, snapshotVisibleCoins: [] };
  const result = buildOpportunityDecision(input, {}, {
    ...BROWSER_RUNTIME_DEFAULTS,
    profitThresholdContext: { active: true, threshold: { rewardCoins: 1, staminaMilli: 10000 } }
  });
  return { lateFirst, choice: result.choice, action: result.action,
    routes: result.opportunities.filter(x => x.sourceCoin?.coinRoute || x.coinRoute), rawRoutes: result.rawOpportunities.filter(x => x.sourceCoin?.coinRoute || x.coinRoute) };
}
const result = [caseFor(false), caseFor(true)];
const assert = require('assert/strict');
assert.equal(result[0].choice.id, 'late-0');
assert.equal(result[1].choice.id, 'late-0');
assert.equal(result[0].choice.reward, result[1].choice.reward);
assert.equal(result[0].choice.staminaCost, 20500);
assert.equal(result[1].choice.staminaCost, 20500);
console.log(JSON.stringify(result.map(x => ({ lateFirst: x.lateFirst, chosen: x.choice?.id, reason: x.choice?.reason,
  score: x.choice?.score, reward: x.choice?.reward, cost: x.choice?.staminaCost,
  routeIds: x.routes.map(r => r.sourceCoin.coinRoute.ids), assertionsPassed: true })), null, 2));

}

async function coverage_cumulative() {
 const console = { log() {} };

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCombatBattleLog } = require('../src/node/browserless/combat-battle-log');

function scenario(count, split = false) {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-audit-coverage-'));
  let nowMs = Date.parse('2026-11-08T04:00:00Z');
  const startedAt = nowMs;
  const logger = createCombatBattleLog({ logDir, now: () => nowMs });
  const all = [];
  const frame = n => ({
    runId: 'audit', runtimeRevision: 'audit',
    self: { userId: 7, hp: 100, x: 0, y: 0 },
    target: { userId: 8, hp: 100, active: true, x: 5000, y: 0 },
    metrics: {
      engagementId: '8:audit', targetId: '8', targetName: 'Audit',
      controlGeneration: 'control:audit', engagementGeneration: 'control:audit:8:1',
      startedAt, lastObservedAt: nowMs,
      requestedShots: n, wireRequestCount: n, actualShots: n, acceptedShots: n,
      confirmedHits: 0, targetDamage: 0, selfDamage: 0,
      lastExecutionSequence: n * 2,
      coverageShotAttribution: all.slice(-60)
    }
  });
  try {
    logger.record('combat-live', frame(0));
    for (let n = 1; n <= count; n++) {
      nowMs = startedAt + n * 500;
      const common = {
        atMs: nowMs, executionClass: 'combat', requestId: `audit-shot-${n}`,
        controlGeneration: 'control:audit', engagementGeneration: 'control:audit:8:1', targetId: '8'
      };
      logger.recordShotExecution({ ...common, sequence: n * 2 - 1, type: 'shoot-dispatch', outcome: 'transport-accepted' });
      logger.recordShotExecution({ ...common, sequence: n * 2, type: 'shoot-ack-accepted', outcome: 'accepted', ack: { bullet_id: `audit-bullet-${n}`, owner_user_id: 7 } });
      all.push({ bulletId: `audit-bullet-${n}`, acceptedShotOrdinal: n,
        coverageApplied: true, confirmedHit: false,
        baselineExpectedMissCm: n <= count - 128 ? 900 : 500,
        selectedExpectedMissCm: 100, expectedMissImprovementCm: n <= count - 128 ? 800 : 400,
        hypothesis: 'stop', variant: 'immediate', selectionMode: 'weighted-primary' });
      logger.record('combat-live', frame(n));
      if (split && n === 128) logger.flush('segment-boundary');
    }
    const summary = logger.flush('audit-finish');
    const result = {
      shots: count,
      durationMs: summary.segmentDurationMs,
      segmentAccepted: summary.segmentAcceptedShots,
      engagementAccepted: summary.engagementCumulativeAcceptedShots,
      segmentCoverage: summary.segmentTrajectoryCoverageAppliedAcceptedShots,
      engagementCoverage: summary.engagementCumulativeTrajectoryCoverageAppliedAcceptedShots,
      segmentBaselineMissMean: summary.segmentTrajectoryCoverageBaselineExpectedMissCmMean,
      engagementBaselineMissMean: summary.engagementCumulativeTrajectoryCoverageBaselineExpectedMissCmMean,
      physicalInvariant: summary.shotOwnershipInvariantOk,
      coverageKeys: Object.keys(summary).filter(k => /TrajectoryCoverageAppliedAccepted|TrajectoryCoverageBaselineExpectedMiss/.test(k))
    };
    return result;
  } finally { fs.rmSync(logDir, { recursive: true, force: true }); }
}
const results = [128, 129, 256].map(count => scenario(count));
const split = scenario(256, true);
assert.equal(split.segmentCoverage, 128);
assert.equal(split.engagementCoverage, 256);
assert.equal(split.engagementBaselineMissMean, 700);
for (const row of results) {
  assert.equal(row.segmentCoverage, row.shots);
  assert.equal(row.engagementCoverage, row.shots);
  assert.equal(row.segmentAccepted, row.shots);
  assert.equal(row.engagementAccepted, row.shots);
  assert.equal(row.physicalInvariant, true);
  assert.equal(row.segmentBaselineMissMean, row.engagementBaselineMissMean);
}
console.log(JSON.stringify({ results, assertionsPassed: true }, null, 2));

}

async function watchdog_body_timeout() {
 const console = { log() {} };

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { createWatchdogService } = require('../combat-log-service/watchdog');


  let headersResolve;
  const headersSeen = new Promise(resolve => { headersResolve = resolve; });
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"left":');
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let capturedSignal;
  const watchdog = createWatchdogService({
    autoStart: false, config: { auditEnabled: false },
    fetch: async (url, options) => {
      capturedSignal = options.signal;
      const response = await fetch(url, options);
      headersResolve();
      return response;
    }
  });
  const timeoutMs = 250;
  let settled = false;
  const started = Date.now();
  const pending = watchdog.sendDirectLeaveRequest({ url: `http://127.0.0.1:${server.address().port}/audit`, method: 'GET' }, timeoutMs)
    .then(result => { settled = true; return result; });
  const escape = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 5000);
  try {
    await headersSeen;
    await new Promise(resolve => setTimeout(resolve, 750));
    const observation = { timeoutMs, elapsedMs: Date.now() - started, settledBeforeForcedClose: settled, signalAbortedBeforeForcedClose: capturedSignal.aborted };
    assert.equal(settled, true);
    assert.equal(capturedSignal.aborted, true);
    for (const socket of sockets) socket.destroy();
    const result = await pending;
    assert.equal(result.ok, false);
    const evidence = { observation, afterForcedClose: { ok: result.ok, error: result.error, durationMs: result.durationMs }, assertionsPassed: true, network: 'temporary loopback only', productionServicesTouched: false };
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    clearTimeout(escape); watchdog.stop();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }

}

async function replay_geometry_utf8() {
 const console = { log() {} };

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../combat-log-service');
const { replay, loadFrames, DEFAULTS } = require(root + '/replay-combat');
const { evaluateFrames } = require(root + '/replay-dodge-lane-hold');
const { readEntries } = require(root + '/daily-summary');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-audit-replay-'));
try {
  const geometry = [5000, 5125].map(targetX => {
    const file = path.join(dir, `geometry-${targetX}.jsonl.gz`);
    const rows = Array.from({ length: 34 }, (_, i) => ({ at: new Date(10000 + i * 50).toISOString(),
      type: 'combat-live', detail: {
        self: { userId: '7', x: 0, y: 0, hp: 100, vx: 0, vy: 0, stamina5s: 10000 },
        target: { userId: '8', x: targetX, y: 0, hp: 100, vx: 0, vy: 0, distance: targetX, authority: 'realtime' },
        aim: { x: targetX, y: 0, ok: true }, shooting: { wouldShoot: true },
        metrics: { engagementId: 'audit', acceptedShots: i === 0 ? 0 : 1 }
      } }));
    fs.writeFileSync(file, zlib.gzipSync(rows.map(JSON.stringify).join('\n') + '\n'));
    const result = replay({ ...DEFAULTS, file, selfId: '7', targetId: '8' });
    return { targetX, shots: result.shots, trueCollisionMsAfterShot: targetX / 10,
      expectedContinuousCpa: 0, scenarios: result.scenarios.filter(s => ['actual bullet vectors vs live target',
        'logged aimTarget vs live target', 'live intercept vs live target'].includes(s.label)) };
  });
  assert.equal(geometry[0].shots, 1);
  assert.equal(geometry[1].shots, 1);
  assert(geometry[0].scenarios.every(s => s.hits === 1 && s.minDistanceCm === 0));
  assert(geometry[1].scenarios.every(s => s.hits === 1 && s.minDistanceCm === 0));

  // A late first sighting has only the bullet's remaining lifetime available.
  for (const targetX of [4875, 5125]) {
    const file = path.join(dir, `remaining-life-${targetX}.jsonl`);
    const rows = Array.from({ length: 14 }, (_, i) => ({
      type: 'combat-frame', at: 10000 + i * 50, tick: 102 + i,
      self: { id: '7', x: 0, y: 0, hp: 100 },
      target: { id: '8', x: targetX, y: 0, hp: 100 },
      nearbyEntities: [{ id: '8', x: targetX, y: 0, hp: 100 }],
      aimTarget: { x: targetX, y: 0 },
      bullets: i === 0 ? [{ id: 'late-bullet', owner_id: '7', x: 1000, y: 0,
        vx: 500, vy: 0, created_tick: 100, expire_tick: 110 }] : []
    }));
    fs.writeFileSync(file, rows.map(JSON.stringify).join('\n'));
    const actual = replay({ ...DEFAULTS, file, selfId: '7', targetId: '8' }).scenarios
      .find(scenario => scenario.label === 'actual bullet vectors vs live target');
    assert.equal(actual.hits, targetX === 4875 ? 1 : 0);
    assert.equal(actual.minDistanceCm, targetX === 4875 ? 0 : 125);
  }

  const creation = [100, 102].map(firstSightTick => {
    const frames = Array.from({ length: 11 }, (_, i) => ({ line: i + 1, tick: 100 + i,
      self: { x: 5000, y: 0, vx: 0, vy: 0, hp: i === 10 ? 97 : 100 }, target: { x: 0, y: 0 },
      movement: { dx: 0, dy: 1, dodge: { threatField: [{ dangerousBullets: 100 + i >= firstSightTick
        ? [{ bulletId: 'audit', createdTick: 100, speed: 500 }] : [] }] } } }));
    const result = evaluateFrames(frames, { file: 'synthetic-memory-only', bulletId: 'audit', direction: '0,1',
      commandDelayTicks: 0, moveSpeedPerTick: 50, hitRadiusCm: 90 });
    return { firstSightTick, expectedLoggedCpa: 0, ...result };
  });
  assert.equal(creation[0].accepted, true);
  assert.equal(creation[1].accepted, true);
  assert.equal(creation[1].actualMinClearanceCm, 0);
  assert.equal(creation[1].lengthRatio, 1);

  const block = 1024 * 1024;
  const row = { type: 'combat-frame', at: 10000, pad: '', self: { id: 7, x: 0, y: 0, hp: 100 },
    target: { id: 8, name: '中', x: 5000, y: 0, hp: 100 }, nearbyEntities: [], bullets: [] };
  const empty = JSON.stringify(row);
  const nameOffset = Buffer.byteLength(empty.slice(0, empty.indexOf('中')));
  row.pad = 'a'.repeat(block - 1 - nameOffset);
  const data = JSON.stringify(row) + '\n';
  const byteOffset = Buffer.byteLength(data.slice(0, data.indexOf('中')));
  assert.equal(byteOffset, block - 1);
  const utf8 = ['plain', 'gzip'].map(format => {
    const subdir = path.join(dir, format); fs.mkdirSync(subdir);
    const file = path.join(subdir, 'input.jsonl' + (format === 'gzip' ? '.gz' : ''));
    fs.writeFileSync(file, format === 'gzip' ? zlib.gzipSync(data) : data);
    const daily = readEntries(subdir);
    const combat = loadFrames({ file, selfId: '7', targetId: '8' });
    return { format, byteOffset, expectedName: '中', dailyName: daily[0].target.name,
      replayName: combat.frames[0].target.name, dailyParseErrors: daily.filter(r => r.type === 'parse-error').length };
  });
  assert.equal(utf8[0].dailyParseErrors, 0);
  assert.equal(utf8[0].dailyName, '中'); assert.equal(utf8[0].replayName, '中');
  assert.equal(utf8[1].dailyName, '中'); assert.equal(utf8[1].replayName, '中');
  for (const [index, symbol] of ['¢', '中', '😀'].entries()) {
    for (let split = 1; split < Buffer.byteLength(symbol); split += 1) {
      const sample = { ...row, pad: '', target: { ...row.target, name: symbol } };
      const template = JSON.stringify(sample);
      const offset = Buffer.byteLength(template.slice(0, template.indexOf(symbol)));
      sample.pad = 'a'.repeat(block - split - offset);
      const unicodeDir = path.join(dir, `utf8-${index}-${split}`);
      fs.mkdirSync(unicodeDir);
      const unicodeFile = path.join(unicodeDir, 'boundary.jsonl');
      fs.writeFileSync(unicodeFile, JSON.stringify(sample));
      assert.equal(readEntries(unicodeDir)[0].target.name, symbol);
      assert.equal(loadFrames({ file: unicodeFile, selfId: '7', targetId: '8' }).frames[0].target.name, symbol);
    }
  }

  const output = { ok: true, geometry, creation, utf8 };
  console.log(JSON.stringify(output, null, 2));
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

}

async function log_consumers_cpu() {
 const console = { log() {} };

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const { createLocalLogStore } = require(root + '/src/node/browserless/local-log-store');
const { createCombatBattleLog } = require(root + '/src/node/browserless/combat-battle-log');
const { summarizeAudit } = require(root + '/scripts/browserless-canary-audit');
const { analyzeDay, reconcileState } = require(root + '/scripts/reconcile-browserless-today-stats');
const { evaluateCpuGate } = require(root + '/scripts/benchmark-browserless-hot-path');


  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-audit-consumers-'));
  const evidence = { network: 'none', productionServicesTouched: false };
  try {
    const logDir = path.join(temp, 'canary');
    let at = Date.parse('2026-11-08T04:00:00Z');
    const start = at;
    const logs = createLocalLogStore({ logDir, now: () => at });
    const battle = createCombatBattleLog({ logDir, now: () => at });
    const runId = 'audit-canary';
    logs.append('decisions', 'decision', { runId, action: { kind: 'wait' } });
    logs.append('runner', 'movement-command', { runId, action: { velocity: { dx: 1, dy: 0 } } });
    const frame = {
      runId, runtimeRevision: 'audit',
      self: { userId: 7, hp: 100, x: 0, y: 0 },
      target: { userId: 8, hp: 100, active: true, authority: 'realtime', x: 5000, y: 0 },
      metrics: { engagementId: '8:audit-canary', targetId: '8', startedAt: start, lastObservedAt: at }
    };
    battle.record('combat-live', frame);
    at += 1000;
    const index = battle.flush('audit-finish');
    logs.append('runner', 'canary-finish', {
      runId, mode: 'combat-live', ok: true,
      startedAt: new Date(start).toISOString(), completedAt: new Date(at).toISOString(),
      snapshotSafety: { ok: true, bootstrapOnly: false },
      stats: { decodedFrameCount: 2, selfPresent: { true: 2 } },
      frameHealth: { decodeErrors: 0 }, leave: { ok: true },
      actions: { velocitySentCount: 1, shootSentCount: 0 }
    });
    const options = { logDir, day: '2026-11-08', profile: 'combat-live' };
    const current = summarizeAudit(options);
    const gzip = path.join(logDir, options.day, 'battles', index.file);
    const body = zlib.gunzipSync(fs.readFileSync(gzip)).toString('utf8');
    const combatRows = body.trim().split('\n').map(JSON.parse).filter(row => row.type === 'combat-live');
    assert.equal(combatRows.length, 1);
    assert.equal(current.counts.combatLive, 1);
    assert.deepEqual(current.failed.map(row => row.key), []);
    fs.writeFileSync(path.join(logDir, options.day, 'combat.jsonl'), combatRows.map(JSON.stringify).join('\n') + '\n');
    const flatControl = summarizeAudit(options);
    assert.equal(flatControl.ok, true);
    assert.equal(flatControl.counts.combatLive, 1);
    evidence.canary = {
      currentWriterCombatFrames: combatRows.length,
      currentLayout: { ok: current.ok, combatLive: current.counts.combatLive, failed: current.failed.map(row => row.key) },
      sameRowsInLegacyFlatLayout: { ok: flatControl.ok, combatLive: flatControl.counts.combatLive }
    };

    const earlyLogDir = path.join(temp, 'stats');
    at = Date.parse('2026-11-07T17:00:00Z');
    const earlyLogs = createLocalLogStore({ logDir: earlyLogDir, now: () => at });
    earlyLogs.append('runner', 'source-ip-login-success', { runId: 'audit-stats' });
    for (const [elapsed, drop] of [[0, 10], [60000, 20]]) {
      at = Date.parse('2026-11-07T17:00:00Z') + elapsed;
      earlyLogs.append('ws', 'message', { runId: 'audit-stats', decodedSummary: { tick: 1000 + elapsed / 50, self: { user_id: 7, death_drop_coins: drop } } });
      earlyLogs.append('decisions', 'decision', { input: { selfKillEvidence: [], stamina: { stamina1dRemainingMilli: 500000 - elapsed, stamina1dLimitMilli: 500000 } } });
    }
    earlyLogs.append('runner', 'runner-finish', { runId: 'audit-stats', completedAt: new Date(at).toISOString() });
    const statsOptions = { day: '2026-11-08', userId: 7, logDir: earlyLogDir, cutoffMs: Date.parse('2026-11-07T18:00:00Z') };
    const early = await analyzeDay(statsOptions);
    const later = await analyzeDay({ ...statsOptions, cutoffMs: Date.parse('2026-11-08T00:00:00Z') });
    assert.equal(path.basename(earlyLogs.dayDirFor()), '2026-11-08');
    assert.equal(early.evidence.selfSamples, 2);
    assert.equal(later.evidence.selfSamples, 2);
    assert.equal(later.stats.coinsGained, 20);
    assert.equal(later.stats.uptimeMs, 60000);
    assert.equal(later.stats.staminaSpentMs, 60000);
    const emptyState = { stats: { today: { day: '2026-11-08' }, currentSession: { online: false } } };
    evidence.stats = {
      writerDay: path.basename(earlyLogs.dayDirFor()),
      cutoffAt02hUtc8: { evidence: early.evidence, stats: early.stats, after: reconcileState(emptyState, early).after },
      sameLogsCutoffAt08hUtc8: { evidence: later.evidence, stats: later.stats, after: reconcileState(emptyState, later).after }
    };

    const auditModule = { exports: require('../src/node/browserless/canary') };
    const actualRead = fs.readFileSync;
    let cpuReads = 0;
    let profile;
    try {
      fs.readFileSync = function(file, ...args) {
        if (String(file) === `/proc/self/task/${process.pid}/schedstat`) {
          cpuReads += 1;
          if (cpuReads === 1) return '1000000000 0 0\n';
          throw Object.assign(new Error('audit injected schedstat read failure'), { code: 'EIO' });
        }
        return actualRead.call(this, file, ...args);
      };
      const started = auditModule.exports.startMainThreadCpuUsage();
      profile = auditModule.exports.mainThreadWorkProfile(started, 90);
    } finally { fs.readFileSync = actualRead; }
    const stats = auditModule.exports.createMainThreadTimingStats(50);
    auditModule.exports.recordMainThreadTask(stats, 'audit-callback', 90, {}, { workProfile: profile });
    const gate = evaluateCpuGate(stats.tasks, 50);
    assert.equal(cpuReads, 2);
    assert.equal(profile.cpuWorkMs, null);
    assert.equal(stats.cpuMeasurementMissingCount, 1);
    assert.equal(stats.tasks['audit-callback'].cpuCount, 0);
    assert.equal(gate.missing.length, 1);
    assert.equal(gate.overBudget.length, 0);
    evidence.cpu = { injected: 'first schedstat read succeeds; completion read throws EIO', cpuReads, profile, task: stats.tasks['audit-callback'], gate, scope: 'actual measurement producer, aggregator and gate; no full benchmark; 90ms is a synthetic wall-duration, not measured CPU work' };
    evidence.assertionsPassed = true;
    console.log(JSON.stringify(evidence, null, 2));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }

}

async function replay_causality() {
 const console = { log() {} };

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const file = path.resolve(__dirname, 'replay-browserless-runtime-log.js');
const api = require('./replay-browserless-runtime-log');
const at = Date.parse('2026-11-08T04:00:00Z');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-replay-causal-'));
try {
  const rows = Array.from({length: 41}, (_, i) => {
    const y = Math.min(i, 5) * 50;
    return {
      line: i + 1,
      entry: {type:'combat-live', at: new Date(at+i*50).toISOString()},
      detail: {
        tick:100+i,
        self: {userId:7, x:0, y:0, vx:0, vy:0, hp:100, stamina5s:10000},
        target: {userId:8, x:5000, y, vx:0, vy:i>0&&i<5?50:0, hp:100, active:true, distance:Math.hypot(5000,y)},
        aim: {ok:true,x:5000,y,timing:{executionDelayTicks:5,rollingMedianTicks:5,rollingP90Ticks:5,rollingMadTicks:0}},
        shooting: {wouldShoot:i===0,inRange:true,cadenceMs:500,state:'ready'},
        movement: {dx:0,dy:0},
        metrics: {targetId:'8',acceptedShots:i>=6?1:0},
      }
    };
  });
  const ack = {bullet_id:'fixture-bullet',owner_user_id:'7',start_x:0,start_y:0,target_x:5000,target_y:0,dir_x_micros:1000000,dir_y_micros:0,range_cm:15000,speed_per_tick:500,created_tick:105,expire_tick:135,observedTick:100,executionDelayTicks:5};
  const events = [
    {entry:{type:'shoot-execution',at:new Date(at+1).toISOString()},detail:{type:'shoot-dispatch',atMs:at+1,requestId:'fixture-request',commandId:'fixture-command',targetId:'8',observedTick:100}},
    {entry:{type:'shoot-execution',at:new Date(at+251).toISOString()},detail:{type:'shoot-ack-accepted',atMs:at+251,requestId:'fixture-request',commandId:'fixture-command',targetId:'8',ack}}
  ];
  const options = {file:path.join(dir,'combat.jsonl'),targetId:'8',startLine:1,endLine:Infinity,hitRadius:90,executionDelayTicks:5};
  const all = [...rows,...events].sort((a,b)=>Date.parse(a.entry.at)-Date.parse(b.entry.at));
  fs.writeFileSync(options.file, all.map(row=>JSON.stringify({...row.entry,detail:row.detail})).join('\n')+'\n');
  const matched = api.executionMatchedConfirmedShots(options,all,rows);
  assert.equal(matched.length,1);
  assert.equal(matched[0].dispatchObservedTick,100);
  const replay = api.replayDistanceAwareAim(all,rows,options);
  const publicReplay = api.replayDistanceAwareCombat(options);
  const dispatchAim = api.recomputeDistanceAwareAimForRow(rows,0,options);
  const createdAim = api.recomputeDistanceAwareAimForRow(rows,5,options);
  const unchangedAimRows = rows.map(row=>({...row,detail:{...row.detail,aim:{...row.detail.aim,x:5000,y:0}}}));
  const unchangedReplay = api.replayDistanceAwareAim([...unchangedAimRows,...events],unchangedAimRows,options);
  const result = {
    dispatchObservedTick:matched[0].dispatchObservedTick,
    createdTick:ack.created_tick,
    actualWireAim:{x:ack.target_x,y:ack.target_y},
    actualWireMissCm:api.bulletCorridorMiss(rows,ack),
    dispatchCausalAim:{ok:dispatchAim.ok,x:dispatchAim.x,y:dispatchAim.y},
    dispatchCausalAimMissCm:api.bulletCorridorMiss(rows,ack,dispatchAim),
    createdFrameRecomputedAim:{ok:createdAim.ok,x:createdAim.x,y:createdAim.y},
    createdFrameRecomputedAimMissCm:api.bulletCorridorMiss(rows,ack,createdAim),
    replayHistorical:replay.historical,
    replayCurrent:replay.current,
    replayHistoricalEstimatedHits:replay.historicalEstimatedHits,
    replayCurrentEstimatedHits:replay.currentEstimatedHits,
    replayAimAccepted:replay.accepted,
    unchangedPostDispatchLoggedAimHistorical:unchangedReplay.historical,
    publicCausalPrefixOnly:publicReplay.causalPrefixOnly,
    publicReplayAccepted:publicReplay.accepted,
  };
  assert.equal(result.actualWireMissCm,250);
  assert.equal(result.dispatchCausalAimMissCm,250);
  assert.ok(result.createdFrameRecomputedAimMissCm < 1e-9);
  assert.equal(result.replayHistoricalEstimatedHits,0);
  assert.equal(result.unchangedPostDispatchLoggedAimHistorical.estimatedHits,0);
  assert.equal(result.replayAimAccepted,false);
  assert.deepEqual(replay.decisionSamples, unchangedReplay.decisionSamples);
  const missing = api.replayDistanceAwareAim(all, rows, { ...options, executionMatchedShots: matched.map(shot => ({ ...shot, dispatchObservedTick: null })) });
  assert.equal(missing.insufficientDispatchEvidence, 1);
  assert.equal(missing.accepted, false);
} finally { fs.rmSync(dir,{recursive:true,force:true}); }

}

async function main() {
 await profit_score(); process.stdout.write('profit_score: passed\n');
 await coin_anchors(); process.stdout.write('coin_anchors: passed\n');
 await coverage_cumulative(); process.stdout.write('coverage_cumulative: passed\n');
 await watchdog_body_timeout(); process.stdout.write('watchdog_body_timeout: passed\n');
 await replay_geometry_utf8(); process.stdout.write('replay_geometry_utf8: passed\n');
 await log_consumers_cpu(); process.stdout.write('log_consumers_cpu: passed\n');
 await replay_causality(); process.stdout.write('replay_causality: passed\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
