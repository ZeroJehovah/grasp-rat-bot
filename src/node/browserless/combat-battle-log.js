'use strict';

// Per-battle combat logging for the browserless runner.
//
// Instead of appending every combat frame to one unbounded `combat.jsonl`, each
// distinct engagement (`metrics.engagementId` = `<targetId>:<startedAt>`) is
// written to its own JSONL file under `<day>/battles/`. When the engagement
// ends (a different engagement takes over, the fight idles out, or the runner
// shuts down) the file is gzip-compressed to `<name>.jsonl.gz` and a one-line
// summary is appended to `<day>/battles/index.jsonl`.
//
// Frames without an engagement id (idle/search diagnostic frames, the bulk of
// the raw combat volume) are intentionally discarded here; they are not battle
// records.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { redactStructuredSecrets } = require('./session-client');
const { utc8DayKey } = require('./utc8-day');

const DEFAULT_IDLE_FINALIZE_MS = 15000;
const BATTLES_DIR = 'battles';
const INDEX_FILE = 'index.jsonl';
const MAX_INDEX_LINE_BYTES = 8192;
const BEHAVIOR_MODE_KEYS = Object.freeze([
  'zigzag-strafe',
  'retreat-kite',
  'charge-close',
  'stationary',
  'mixed/unknown'
]);
const TRAJECTORY_COVERAGE_REASON_KEYS = Object.freeze([
  'coverage-disabled',
  'no-route-coverage',
  'intercept-unreachable',
  'coverage-evidence-not-ready',
  'live-single-applied',
  'live-volley-awaits-live-single-acceptance',
  'live-single-successful-aim-protected',
  'live-single-requires-coverage-qualification',
  'live-single-insufficient-aim-improvement',
  'no-trajectory-paths',
  'marginal-coverage-selected',
  'aim-improvement-below-threshold',
  'marginal-coverage-below-threshold',
  'no-shot-candidates',
  'other'
]);

function sanitizeEngagementId(value, fallback = 'battle') {
  const text = String(value == null ? '' : value)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return text || fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function extractEngagementId(detail) {
  const metrics = detail && typeof detail === 'object' ? detail.metrics : null;
  if (!metrics || typeof metrics !== 'object') return '';
  const id = metrics.engagementId;
  return id === null || id === undefined ? '' : String(id);
}

function boundedCounter(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function normalizeBehaviorMode(value) {
  const mode = String(value || '');
  return BEHAVIOR_MODE_KEYS.includes(mode) ? mode : 'mixed/unknown';
}

function normalizeTrajectoryCoverageReason(value) {
  const reason = String(value || '');
  return TRAJECTORY_COVERAGE_REASON_KEYS.includes(reason) ? reason : 'other';
}

function createBattleObservations() {
  return {
    targetActiveObserved: false,
    targetMovingObserved: false,
    opponentFireObserved: false,
    opponentBulletIds: new Set(),
    opponentShotEventIds: new Set(),
    behaviorModeFrameCounts: boundedCounter(BEHAVIOR_MODE_KEYS),
    routeCoverageCandidateFrames: 0,
    trajectoryCoverageAppliedFrames: 0,
    trajectoryCoverageReasonCounts: boundedCounter(TRAJECTORY_COVERAGE_REASON_KEYS)
  };
}

function stableShotEventId(event, targetId) {
  const bulletId = event?.bulletId ?? event?.bullet_id ?? event?.id;
  if (bulletId !== null && bulletId !== undefined && String(bulletId)) return `bullet:${String(bulletId)}`;
  const createdTick = event?.createdTick ?? event?.created_tick ?? event?.tick;
  if (createdTick === null || createdTick === undefined || String(createdTick) === '') return '';
  return `tick:${String(targetId || '')}:${String(createdTick)}`;
}

function observeBattleDetail(observations, detail) {
  const next = observations || createBattleObservations();
  const frame = detail && typeof detail === 'object' ? detail : {};
  const target = frame.target && typeof frame.target === 'object' ? frame.target : {};
  const metrics = frame.metrics && typeof frame.metrics === 'object' ? frame.metrics : {};
  const behavior = frame.behavior && typeof frame.behavior === 'object' ? frame.behavior : {};
  const aim = frame.aim && typeof frame.aim === 'object' ? frame.aim : {};
  const targetId = metrics.targetId ?? target.userId ?? target.user_id ?? '';

  if (target.active === true) next.targetActiveObserved = true;
  const vx = Number(target.vx);
  const vy = Number(target.vy);
  if ((Number.isFinite(vx) && vx !== 0) || (Number.isFinite(vy) && vy !== 0)) next.targetMovingObserved = true;

  const bulletIds = Array.isArray(metrics.threatBulletIds) ? metrics.threatBulletIds : [];
  for (const id of bulletIds) {
    if (id !== null && id !== undefined && String(id)) next.opponentBulletIds.add(String(id));
  }
  const shotEvents = Array.isArray(behavior.metrics?.shotEvents) ? behavior.metrics.shotEvents : [];
  for (const event of shotEvents) {
    const eventId = stableShotEventId(event, targetId);
    if (eventId) next.opponentShotEventIds.add(eventId);
    const bulletId = event?.bulletId ?? event?.bullet_id ?? event?.id;
    if (bulletId !== null && bulletId !== undefined && String(bulletId)) next.opponentBulletIds.add(String(bulletId));
  }
  if (target.firing === true || bulletIds.length > 0 || shotEvents.length > 0) next.opponentFireObserved = true;

  next.behaviorModeFrameCounts[normalizeBehaviorMode(behavior.mode)] += 1;
  if (Array.isArray(aim.routeCoverage?.candidates) && aim.routeCoverage.candidates.length > 0) {
    next.routeCoverageCandidateFrames += 1;
  }
  const trajectoryCoverage = aim.trajectoryCoverage && typeof aim.trajectoryCoverage === 'object'
    ? aim.trajectoryCoverage
    : null;
  if (trajectoryCoverage?.applied === true) next.trajectoryCoverageAppliedFrames += 1;
  if (trajectoryCoverage) {
    next.trajectoryCoverageReasonCounts[normalizeTrajectoryCoverageReason(trajectoryCoverage.reason)] += 1;
  }
  return next;
}

function summarizeBattleObservations(observations) {
  const observed = observations || createBattleObservations();
  return {
    targetActiveObserved: Boolean(observed.targetActiveObserved),
    targetMovingObserved: Boolean(observed.targetMovingObserved),
    opponentFireObserved: Boolean(observed.opponentFireObserved),
    opponentUniqueBulletCount: observed.opponentBulletIds instanceof Set ? observed.opponentBulletIds.size : 0,
    opponentShotEventCount: observed.opponentShotEventIds instanceof Set ? observed.opponentShotEventIds.size : 0,
    behaviorModeFrameCounts: { ...observed.behaviorModeFrameCounts },
    routeCoverageCandidateFrames: Number(observed.routeCoverageCandidateFrames || 0),
    trajectoryCoverageAppliedFrames: Number(observed.trajectoryCoverageAppliedFrames || 0),
    trajectoryCoverageReasonCounts: { ...observed.trajectoryCoverageReasonCounts }
  };
}

// Build the persisted per-battle summary from the latest cumulative combat
// metrics plus the writer's own frame/wall bookkeeping.
function buildBattleSummary(battle, reason, finalizeMs) {
  const metrics = battle.lastMetrics && typeof battle.lastMetrics === 'object' ? battle.lastMetrics : {};
  const endedAtMs = Number(metrics.lastObservedAt) || battle.lastFrameAtMs || finalizeMs;
  return {
    at: new Date(finalizeMs).toISOString(),
    engagementId: battle.engagementId,
    file: path.basename(battle.gzFile),
    reason,
    targetId: metrics.targetId != null ? String(metrics.targetId) : (battle.targetId || ''),
    targetName: String(metrics.targetName || battle.targetName || ''),
    frames: battle.frames,
    startedAt: numberOrNull(metrics.startedAt) ?? battle.firstFrameAtMs,
    startedAtIso: new Date(numberOrNull(metrics.startedAt) ?? battle.firstFrameAtMs).toISOString(),
    endedAt: endedAtMs,
    endedAtIso: new Date(endedAtMs).toISOString(),
    durationMs: Math.max(0, endedAtMs - (numberOrNull(metrics.startedAt) ?? battle.firstFrameAtMs)),
    requestedShots: numberOrNull(metrics.requestedShots),
    acceptedShots: numberOrNull(metrics.acceptedShots),
    confirmedHits: numberOrNull(metrics.confirmedHits),
    estimatedHitRate: numberOrNull(metrics.estimatedHitRate),
    targetDamage: numberOrNull(metrics.targetDamage),
    selfDamage: numberOrNull(metrics.selfDamage),
    incomingHits: numberOrNull(metrics.incomingHits),
    initialSelfHp: numberOrNull(metrics.initialSelfHp),
    minSelfHp: numberOrNull(metrics.minSelfHp),
    lastSelfHp: numberOrNull(metrics.lastSelfHp),
    initialTargetHp: numberOrNull(metrics.initialTargetHp),
    minTargetHp: numberOrNull(metrics.minTargetHp),
    lastTargetHp: numberOrNull(metrics.lastTargetHp),
    totalStaminaSpent: numberOrNull(metrics.totalStaminaSpent),
    shootingStaminaSpent: numberOrNull(metrics.shootingStaminaSpent),
    movementStaminaSpent: numberOrNull(metrics.movementStaminaSpent),
    firstDamageDelayMs: numberOrNull(metrics.firstDamageDelayMs),
    ...summarizeBattleObservations(battle.observations),
    runId: String(battle.runId || ''),
    runtimeRevision: String(battle.runtimeRevision || '')
  };
}

// IO shim: prefer the shared background-IO worker so gzip/compression never
// runs on the 20Hz combat event loop; fall back to synchronous fs/zlib when no
// worker is available (self-tests, background IO disabled).
function createIo(backgroundIo) {
  if (backgroundIo && typeof backgroundIo.appendLog === 'function'
    && typeof backgroundIo.finalizeGz === 'function'
    && typeof backgroundIo.appendRawLine === 'function') {
    return {
      appendFrame(file, atMs, type, detail) {
        if (!backgroundIo.appendLog({ file, atMs, type, detail })) throw new Error('battle-log frame queue unavailable');
      },
      finalize(file) {
        if (!backgroundIo.finalizeGz(file)) throw new Error('battle-log finalize queue unavailable');
      },
      appendIndex(file, summary) {
        if (!backgroundIo.appendRawLine(file, summary)) throw new Error('battle-log index queue unavailable');
      },
      background: true
    };
  }
  return {
    appendFrame(file, atMs, type, detail) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const entry = {
        at: new Date(Number(atMs) || Date.now()).toISOString(),
        type: String(type || 'event'),
        detail: redactStructuredSecrets(detail || {})
      };
      fs.appendFileSync(file, JSON.stringify(entry) + '\n');
    },
    finalize(file) {
      if (!fs.existsSync(file)) return;
      const gzFile = `${file}.gz`;
      fs.writeFileSync(gzFile, zlib.gzipSync(fs.readFileSync(file)));
      fs.rmSync(file, { force: true });
    },
    appendIndex(file, summary) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(redactStructuredSecrets(summary)) + '\n');
    },
    background: false
  };
}

function createCombatBattleLog(options = {}) {
  const logDir = path.resolve(String(options.logDir || path.join(process.cwd(), 'data', 'logs')));
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const idleFinalizeMs = Math.max(1000, Number(options.idleFinalizeMs || DEFAULT_IDLE_FINALIZE_MS));
  const io = createIo(options.backgroundIo);

  let active = null;
  let battlesFinalized = 0;
  let framesWritten = 0;
  let framesDiscarded = 0;
  const allocatedBattleFiles = new Set();

  function battlesDirFor(atMs) {
    return path.join(logDir, utc8DayKey(atMs), BATTLES_DIR);
  }

  // Pick a raw file name that does not collide with an already-finalized battle
  // (e.g. the same engagement re-opening after an idle finalize).
  function chooseBattleFile(dir, engagementId) {
    const base = sanitizeEngagementId(engagementId);
    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const name = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const rawFile = path.join(dir, `${name}.jsonl`);
      const gzFile = `${rawFile}.gz`;
      if (!allocatedBattleFiles.has(rawFile) && !fs.existsSync(rawFile) && !fs.existsSync(gzFile)) {
        allocatedBattleFiles.add(rawFile);
        return { rawFile, gzFile };
      }
    }
    const fallback = path.join(dir, `${base}-${Date.now()}-${allocatedBattleFiles.size + 1}.jsonl`);
    allocatedBattleFiles.add(fallback);
    return { rawFile: fallback, gzFile: `${fallback}.gz` };
  }

  function finalizeActive(reason = 'engagement-switch', atMs = now()) {
    if (!active) return null;
    const battle = active;
    active = null;
    let summary = null;
    try {
      io.finalize(battle.rawFile);
      summary = buildBattleSummary(battle, reason, atMs);
      io.appendIndex(path.join(battle.dir, INDEX_FILE), summary);
      battlesFinalized += 1;
    } catch (err) {
      if (typeof options.onError === 'function') options.onError(err, { operation: 'battle-finalize', engagementId: battle.engagementId });
      else throw err;
    }
    return summary;
  }

  function startBattle(engagementId, detail, atMs) {
    const dir = battlesDirFor(atMs);
    const { rawFile, gzFile } = chooseBattleFile(dir, engagementId);
    const metrics = detail && typeof detail === 'object' ? detail.metrics : null;
    active = {
      engagementId,
      dir,
      rawFile,
      gzFile,
      frames: 0,
      firstFrameAtMs: atMs,
      lastFrameAtMs: atMs,
      targetId: metrics && metrics.targetId != null ? String(metrics.targetId) : '',
      targetName: metrics ? String(metrics.targetName || '') : '',
      runId: detail && detail.runId ? String(detail.runId) : '',
      runtimeRevision: detail && detail.runtimeRevision ? String(detail.runtimeRevision) : '',
      observations: createBattleObservations(),
      lastMetrics: null
    };
  }

  // Record one combat frame. `detail` is the same enriched combat payload that
  // was previously appended to `combat.jsonl`, so per-battle files keep an
  // identical `{at,type,detail}` shape for replay tooling.
  function record(type, detail, recordOptions = {}) {
    const atMs = Number(recordOptions.atMs || now());
    const engagementId = extractEngagementId(detail);
    if (!engagementId) {
      framesDiscarded += 1;
      // No live engagement: if a fight just ended, idle-finalize it.
      if (active && atMs - active.lastFrameAtMs >= idleFinalizeMs) finalizeActive('idle', atMs);
      return { recorded: false, reason: 'no-engagement' };
    }
    if (active && active.engagementId !== engagementId) finalizeActive('engagement-switch', atMs);
    else if (active && atMs - active.lastFrameAtMs >= idleFinalizeMs) {
      // Same id but a long gap: treat the prior span as a finished battle.
      finalizeActive('idle', atMs);
    }
    if (!active) startBattle(engagementId, detail, atMs);
    io.appendFrame(active.rawFile, atMs, type, detail);
    active.frames += 1;
    active.lastFrameAtMs = atMs;
    active.lastMetrics = detail && typeof detail === 'object' && detail.metrics && typeof detail.metrics === 'object'
      ? detail.metrics
      : active.lastMetrics;
    observeBattleDetail(active.observations, detail);
    if (!active.targetName && active.lastMetrics) active.targetName = String(active.lastMetrics.targetName || '');
    framesWritten += 1;
    return { recorded: true, file: active.rawFile, engagementId };
  }

  function flush(reason = 'flush') {
    return finalizeActive(reason, now());
  }

  function status() {
    return {
      logDir,
      activeEngagementId: active ? active.engagementId : '',
      activeFrames: active ? active.frames : 0,
      battlesFinalized,
      framesWritten,
      framesDiscarded,
      idleFinalizeMs,
      background: io.background
    };
  }

  return { record, finalizeActive, flush, status };
}

function runCombatBattleLogSelfTest() {
  const os = require('os');
  const zlibSync = require('zlib');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-battle-log-'));
  const cases = [];
  const assert = (name, condition) => {
    cases.push({ name, ok: Boolean(condition) });
    if (!condition) throw new Error(`battle-log self-test failed: ${name}`);
  };
  try {
    // Fixed clock so engagement/day boundaries are deterministic.
    let nowMs = Date.UTC(2026, 6, 24, 4, 0, 0);
    const dayKey = utc8DayKey(nowMs);
    const battlesDir = path.join(root, dayKey, BATTLES_DIR);
    const log = createCombatBattleLog({ logDir: root, now: () => nowMs, idleFinalizeMs: 15000 });

    const frame = (engagementId, extra = {}, detailExtra = {}) => ({
      metrics: engagementId
        ? { engagementId, targetId: engagementId.split(':')[0], targetName: 'Foe', ...extra }
        : null,
      runId: 'run-1',
      runtimeRevision: 'rev-1',
      ...detailExtra
    });

    // First battle: two frames.
    log.record('combat-live', frame('100:1000', {
      requestedShots: 2,
      confirmedHits: 1,
      targetDamage: 40,
      lastObservedAt: nowMs,
      threatBulletIds: ['bullet-a']
    }, {
      target: { userId: 100, active: true, firing: false, vx: 20, vy: 0 },
      behavior: { mode: 'zigzag-strafe', metrics: { shotEvents: [{ bulletId: 'bullet-a', createdTick: 10 }] } },
      aim: {
        routeCoverage: { candidates: [{ hypothesis: 'continue' }] },
        trajectoryCoverage: { applied: true, reason: 'live-single-applied' }
      }
    }));
    nowMs += 50;
    log.record('combat-live', frame('100:1000', {
      requestedShots: 5,
      confirmedHits: 3,
      targetDamage: 90,
      lastObservedAt: nowMs,
      sessionToken: 'leak-token',
      threatBulletIds: ['bullet-a', 'bullet-b']
    }, {
      target: { userId: 100, active: true, firing: false, vx: 0, vy: 0 },
      behavior: {
        mode: 'retreat-kite',
        metrics: { shotEvents: [{ bulletId: 'bullet-a', createdTick: 10 }, { bulletId: 'bullet-b', createdTick: 12 }] }
      },
      aim: { trajectoryCoverage: { applied: false, reason: 'coverage-evidence-not-ready' } }
    }));
    // Idle diagnostic frames are discarded and do not create files yet.
    nowMs += 50;
    log.record('combat-dry-run', frame(''));
    assert('active battle raw file exists before switch', fs.existsSync(path.join(battlesDir, '100_1000.jsonl')));

    // Switching to a new engagement finalizes the first battle.
    nowMs += 50;
    log.record('combat-live', frame('200:2000', {
      requestedShots: 1,
      confirmedHits: 0,
      targetDamage: 0,
      lastObservedAt: nowMs,
      threatBulletIds: ['bullet-a']
    }, {
      target: { userId: 200, active: true, firing: false, vx: 0, vy: 0 },
      behavior: { mode: 'stationary', metrics: { shotEvents: [{ bulletId: 'bullet-a', createdTick: 20 }] } },
      aim: { trajectoryCoverage: { applied: false, reason: 'no-route-coverage' } }
    }));
    assert('first battle compressed', fs.existsSync(path.join(battlesDir, '100_1000.jsonl.gz')));
    assert('first battle raw removed', !fs.existsSync(path.join(battlesDir, '100_1000.jsonl')));
    assert('index file created', fs.existsSync(path.join(battlesDir, INDEX_FILE)));

    // Flush finalizes the currently active battle.
    nowMs += 50;
    log.flush('shutdown');
    assert('second battle compressed', fs.existsSync(path.join(battlesDir, '200_2000.jsonl.gz')));

    // Index has exactly two battle summaries with the expected shape.
    const indexLines = fs.readFileSync(path.join(battlesDir, INDEX_FILE), 'utf8').trim().split('\n').filter(Boolean);
    assert('index has two battles', indexLines.length === 2);
    const first = JSON.parse(indexLines[0]);
    assert('index summary keeps engagement id', first.engagementId === '100:1000');
    assert('index summary counts frames', first.frames === 2);
    assert('index summary carries cumulative metrics', first.confirmedHits === 3 && first.targetDamage === 90);
    assert('index summary reason recorded', first.reason === 'engagement-switch');
    assert('index summary points at gz file', first.file === '100_1000.jsonl.gz');
    assert('index summary observes target activity and movement', first.targetActiveObserved === true && first.targetMovingObserved === true);
    assert('index summary de-duplicates opponent bullets and shot events', first.opponentFireObserved === true
      && first.opponentUniqueBulletCount === 2 && first.opponentShotEventCount === 2);
    assert('index summary counts bounded behavior modes', first.behaviorModeFrameCounts['zigzag-strafe'] === 1
      && first.behaviorModeFrameCounts['retreat-kite'] === 1);
    assert('index summary counts route and trajectory coverage', first.routeCoverageCandidateFrames === 1
      && first.trajectoryCoverageAppliedFrames === 1
      && first.trajectoryCoverageReasonCounts['live-single-applied'] === 1
      && first.trajectoryCoverageReasonCounts['coverage-evidence-not-ready'] === 1);
    assert('index summary remains below eight KiB', Buffer.byteLength(JSON.stringify(first), 'utf8') <= MAX_INDEX_LINE_BYTES);
    const second = JSON.parse(indexLines[1]);
    assert('battle observation sets are isolated across targets', second.targetId === '200'
      && second.opponentUniqueBulletCount === 1 && second.opponentShotEventCount === 1);

    // Compressed content round-trips and secrets were redacted at append time.
    const decompressed = zlibSync.gunzipSync(fs.readFileSync(path.join(battlesDir, '100_1000.jsonl.gz'))).toString('utf8');
    const gzLines = decompressed.trim().split('\n').filter(Boolean);
    assert('gz has both frames', gzLines.length === 2);
    assert('gz frames keep {at,type,detail} shape', gzLines.every(line => {
      const entry = JSON.parse(line);
      return entry.at && entry.type && entry.detail && typeof entry.detail === 'object';
    }));
    assert('gz frames redacted secrets', !decompressed.includes('leak-token'));

    // Same engagement re-opening after an idle gap gets a distinct file.
    nowMs += 100000;
    log.record('combat-live', frame('100:1000', { lastObservedAt: nowMs }));
    log.flush('shutdown');
    assert('re-opened battle uses distinct file', fs.existsSync(path.join(battlesDir, '100_1000-2.jsonl.gz')));

    // The background worker may not have created either the raw or gz path by
    // the time the same engagement reopens. In-memory path allocation must
    // still prevent the later battle from overwriting the queued first one.
    const queuedOperations = [];
    const queuedLog = createCombatBattleLog({
      logDir: path.join(root, 'queued'),
      now: () => nowMs,
      idleFinalizeMs: 15000,
      backgroundIo: {
        appendLog(message) { queuedOperations.push({ kind: 'log', ...message }); return true; },
        finalizeGz(file) { queuedOperations.push({ kind: 'finalize-gz', file }); return true; },
        appendRawLine(file, value) { queuedOperations.push({ kind: 'append-raw-line', file, value }); return true; }
      }
    });
    const queuedFirst = queuedLog.record('combat-live', frame('300:3000'));
    queuedLog.flush('idle');
    const queuedReopen = queuedLog.record('combat-live', frame('300:3000'));
    assert('queued re-open reserves a distinct file before worker writes', queuedFirst.file !== queuedReopen.file);
    assert('queued background operations exercised', queuedOperations.length >= 4);

    const status = log.status();
    assert('status counts finalized battles', status.battlesFinalized === 3);
    assert('status counts discarded idle frames', status.framesDiscarded >= 1);

    return { ok: true, cases };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), cases };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = {
  DEFAULT_IDLE_FINALIZE_MS,
  MAX_INDEX_LINE_BYTES,
  BEHAVIOR_MODE_KEYS,
  TRAJECTORY_COVERAGE_REASON_KEYS,
  buildBattleSummary,
  createBattleObservations,
  createCombatBattleLog,
  extractEngagementId,
  observeBattleDetail,
  runCombatBattleLogSelfTest,
  sanitizeEngagementId,
  summarizeBattleObservations
};
