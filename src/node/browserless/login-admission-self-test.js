'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loginAttemptControlled, loginAttemptStarted, normalizeLoginAdmission,
  reconcileLoginAdmission, serverEntryObservedToday, serverJoinObservation, transportRetryDelayMs
} = require('./login-admission');
const { runPreLoginSnapshotSafety, highHpLoginPointSafetyExemption } = require('./canary');
const { summarizeSnapshotSafety } = require('./session-client');
const { parseBrowserlessRunnerArgs } = require('./config');
const {
  buildCompactBrowserlessStatus, browserlessCompactStatusSource,
  readBrowserlessStateFile, updateBrowserlessStateFile
} = require('./state-file');
const { renderBrowserlessWebPanel } = require('./web-panel');
const { DAY_MS, UTC8_OFFSET_MS, utc8DayKey } = require('./utc8-day');

const attemptedAtMs = Date.parse('2026-09-26T07:29:21.194Z');
const completedAtMs = Date.parse('2026-09-26T07:29:56.825Z');
const point = { x: 5999, y: 66268, hp: 100, source: 'browserless-entry-self' };
const at = ms => new Date(ms).toISOString();
const dayIndex = ms => Math.floor((ms + UTC8_OFFSET_MS) / DAY_MS);
const joinSelf = (count, tick, hp = 100, ms = completedAtMs) => ({
  ok: true, event: 'left', user_id: 7, x: -38656, y: 24383, hp,
  active_join_count: count, active_join_ticks: [tick], daily_budget_day_key_utc8: dayIndex(ms)
});
const beforeState = () => ({
  updatedAt: at(attemptedAtMs - 4000),
  session: { userId: 7 },
  loginPointSafety: { point: { ...point } },
  current: { self: joinSelf(43, 1087968) },
  runner: { lastLoginAt: at(attemptedAtMs - 1000000) },
  stats: {
    today: { day: utc8DayKey(attemptedAtMs), sessionCount: 1 }, currentSession: { online: false },
    lastExit: { at: at(attemptedAtMs - 4000), reason: 'frame-gap', runId: 'previous-controlled-session' }
  }
});

function failedCanary(hp = 39, options = {}) {
  const self = joinSelf(options.count || 44, options.tick || 1111235, hp, options.completedAtMs || completedAtMs);
  if (options.missingHp) delete self.hp;
  if (options.missingCoordinates) { delete self.x; delete self.y; }
  return {
    ok: false, runId: options.runId || 'uncontrolled-entry',
    startedAt: at(options.attemptedAtMs || attemptedAtMs),
    completedAt: at(options.completedAtMs || completedAtMs),
    entry: { attemptedAt: at(options.attemptedAtMs || attemptedAtMs), firstSelf: null, firstSelfAt: '', firstSelfTick: null },
    stats: { frameCount: 0, selfPresent: { true: 0, false: 0 } },
    actions: { sentCount: 0, velocitySentCount: 0, shootSentCount: 0 },
    error: 'websocket connect timeout',
    safety: { event: { reason: 'ws-connect-unconfirmed-leave', shouldLeave: true, entryUnconfirmed: true } },
    leave: { ok: true, attempts: [{ ok: true, status: 200, response: self }] }
  };
}

function reconcile(value, canary, previousState = beforeState()) {
  return reconcileLoginAdmission(value, {
    canary, previousState, config: { userId: 7 },
    confirmedLeave: canary.leave?.ok === true,
    confirmedLeaveSelf: canary.leave?.attempts?.at(-1)?.response || null
  });
}

function fixtureDeps(now) {
  return {
    now, startStatusServer: false, disableBackgroundIo: true, disableSourceIpPreflight: true,
    snapshotGapPoller: { start() {}, stop() {}, noteSnapshot() {}, refreshSchedule() {}, status: () => ({ stopped: true, intervalMs: 30000 }) },
    remoteProfitWorker: { context: () => null, reset() {}, status: () => null, close: async () => ({ ok: true }) },
    fetchWithTimeout: async () => { throw new Error('unexpected fixture HTTP'); },
    openBrowserlessWs: async () => { throw new Error('unexpected fixture WS'); }
  };
}

async function runLoginAdmissionSelfTest() {
  const {
    browserlessLoginIntervalDelayPlan, hydrateConfigFromState, isFirstBrowserlessLoginOfDay,
    learnedLoginPointFromCanary, runBrowserlessRunner
  } = require('./runner');
  const checks = {};
  const check = (name, condition) => { assert.ok(condition, name); checks[name] = true; };
  const low = failedCanary();
  let state = reconcile(null, low);
  check('server confirms an entry without inventing a first self or exact login time',
    state.lastServerEntry?.count === 44 && state.lastServerEntry.latestTick === 1111235
    && state.lastServerEntry.earliestAt === low.entry.attemptedAt
    && state.lastServerEntry.latestAt === low.completedAt
    && state.lastServerEntry.timeEvidence === 'confirmed-leave-upper-bound' && low.entry.firstSelf === null);
  check('uncertain entry interval uses the upper bound and first transport backoff is one minute',
    state.entryNotBeforeAt === at(completedAtMs + 60000)
    && state.retryNotBeforeAt === at(completedAtMs + 60000) && state.consecutiveFailures === 1);
  const duplicate = reconcile(state, low);
  check('duplicate completion cannot count another failure or extend a deadline', JSON.stringify(duplicate) === JSON.stringify(state));
  check('ordinary lastLoginAt is not rewritten to departure time', !Object.hasOwn(state, 'lastLoginAt'));

  for (const shape of [
    { name: 'hp39', hp: 39, radius: 20500 },
    { name: 'hp0', hp: 0, radius: 30000 },
    { name: 'null-hp', hp: null, radius: 30000 },
    { name: 'missing-hp', hp: null, radius: 30000, missingHp: true },
    { name: 'missing-coordinates', hp: 39, radius: 20500, missingCoordinates: true }
  ]) {
    const canary = failedCanary(shape.hp, shape);
    const learned = learnedLoginPointFromCanary(canary, { point, userId: 7 });
    check(`${shape.name}: latest health survives zero frames without moving the login point`,
      learned.loginPoint?.hp === shape.hp && learned.loginPoint.x === point.x && learned.loginPoint.y === point.y
      && learned.loginPoint.hpSource === 'confirmed-leave' && learned.finalSelf !== null);
    const nextState = { loginPointSafety: { point: learned.loginPoint } };
    check(`${shape.name}: no cached healthy exemption`, highHpLoginPointSafetyExemption(nextState, completedAtMs) === null);
    const safety = summarizeSnapshotSafety({ tick: 200, entities: [] }, learned.loginPoint, { userId: 7 });
    check(`${shape.name}: safety uses the required radius and preserves unknown versus zero`,
      safety.radius === shape.radius && safety.point.hp === shape.hp);
    check(`${shape.name}: newer persisted health overrides the original configured HP`,
      hydrateConfigFromState({ userId: 7, loginPointX: point.x, loginPointY: point.y, loginPointHp: 100 }, nextState).loginPointHp === shape.hp);
  }
  const emptyResult = { entry: { firstSelf: null }, snapshotSafety: { ok: false }, completedAt: at(completedAtMs) };
  check('a pre-login refusal with no exposure does not erase known health', learnedLoginPointFromCanary(emptyResult, { point }).loginPoint === null);
  const unknownExposure = learnedLoginPointFromCanary({ ...low, leave: null }, { point, userId: 7 });
  check('unconfirmed exposure without any new health clears the healthy exemption', unknownExposure.loginPoint.hp === null);
  const healthyCanary = { ...low, entry: { ...low.entry, firstSelf: { x: 10, y: 20, hp: 100 } }, leave: { ok: true, attempts: [{ ok: true, response: joinSelf(44, 1111235, 76) }] } };
  const learnedHealthy = learnedLoginPointFromCanary(healthyCanary, { point, userId: 7 });
  check('normal entry coordinates remain distinct from departure coordinates', learnedHealthy.loginPoint.x === 10 && learnedHealthy.loginPoint.y === 20 && learnedHealthy.loginPoint.hp === 76);

  const gateState = { ...beforeState(), runner: { ...beforeState().runner, loginAdmission: state } };
  const gate = browserlessLoginIntervalDelayPlan(gateState, {}, completedAtMs + 1000);
  check('the next ordinary login sees the remaining persistent transport delay', gate.reason === 'login-transport-backoff' && gate.delayMs === 59000);
  check('the deadline is inclusive and does not extend when read', browserlessLoginIntervalDelayPlan(gateState, {}, completedAtMs + 60000) === null);
  for (const [name, patch] of [
    ['online', { stats: { currentSession: { online: true } } }],
    ['pending-exit', { runner: { ...gateState.runner, pendingExit: { active: true } } }],
    ['transport-takeover', { runner: { ...gateState.runner, transportRecovery: { expectedSelfPresent: true } } }]
  ]) check(`${name} bypasses new-entry waits`, browserlessLoginIntervalDelayPlan({ ...gateState, ...patch }, {}, completedAtMs) === null);
  check('server-only entry blocks another invulnerability exemption while preserving the first controlled-entry snapshot',
    serverEntryObservedToday(gateState, completedAtMs)
    && isFirstBrowserlessLoginOfDay({ ...gateState, stats: { today: { day: utc8DayKey(completedAtMs), sessionCount: 0 } } }, completedAtMs));
  check('future-day entry evidence does not suppress tomorrow first entry', isFirstBrowserlessLoginOfDay(gateState, completedAtMs + DAY_MS));

  const normal = failedCanary(100, { runId: 'controlled-entry', completedAtMs: attemptedAtMs + 90000 });
  normal.error = '';
  normal.safety = { event: { reason: 'duration-complete', shouldLeave: true } };
  normal.entry.firstSelf = { x: 10, y: 20, hp: 100 };
  normal.entry.firstSelfAt = at(attemptedAtMs + 200);
  normal.entry.firstSelfTick = 1111236;
  const normalAdmission = reconcile(null, normal);
  check('normal successful login interval starts at first-self, not departure', normalAdmission.entryNotBeforeAt === at(attemptedAtMs + 60200));
  check('a long normal session can relog immediately after confirmed exit', browserlessLoginIntervalDelayPlan({
    runner: { lastLoginAt: normal.entry.firstSelfAt, loginAdmission: normalAdmission }
  }, {}, attemptedAtMs + 90000) === null);
  const stale = { ...normal, runId: 'stale-record', leave: { ok: true, attempts: [{ ok: true, response: joinSelf(43, 1087968) }] } };
  const staleAdmission = reconcile(state, stale);
  check('a regressed join count/tick cannot replace the watermark or extend the interval', staleAdmission.serverObservation.count === 44 && staleAdmission.entryNotBeforeAt === state.entryNotBeforeAt);
  const wrong = { ...stale, leave: { ok: true, attempts: [{ ok: true, response: { ...joinSelf(99, 9999999), user_id: 8 } }] } };
  check('another user cannot advance the entry clock', reconcile(state, wrong).entryNotBeforeAt === state.entryNotBeforeAt);
  check('missing baseline does not fabricate counter growth', reconcile(null, low, { session: { userId: 7 } }).lastServerEntry === null);
  check('missing baseline still backs off an uncontrolled attempt', reconcile(null, low, {}).consecutiveFailures === 1);
  const nextDayMs = Date.parse('2026-09-26T16:00:05.000Z');
  check('previous-day server records are rejected at midnight', serverJoinObservation(joinSelf(44, 1111235), nextDayMs, 7) === null);
  const nextDayCanary = failedCanary(100, { runId: 'next-day', attemptedAtMs: nextDayMs, completedAtMs: nextDayMs + 15000, count: 1, tick: 4 });
  const nextDay = reconcile(state, nextDayCanary);
  check('lower ticks/counts in a genuinely new day advance the epoch', nextDay.serverObservation.count === 1 && nextDay.serverObservation.latestTick === 4 && nextDay.lastServerEntry.dayIndex === dayIndex(nextDayMs));

  const delays = [];
  for (let index = 2; index <= 6; index++) {
    const start = completedAtMs + index * 400000;
    const failure = failedCanary(100, { runId: `failure-${index}`, count: 43 + index, tick: 1111235 + index, attemptedAtMs: start, completedAtMs: start + 35000 });
    state = reconcile(state, failure);
    delays.push(Date.parse(state.retryNotBeforeAt) - Date.parse(failure.completedAt));
  }
  check('persistent backoff increases 120/240/300 seconds and caps', delays.join(',') === '120000,240000,300000,300000,300000');
  const controlled = loginAttemptControlled(loginAttemptStarted(state, { runId: 'brief-control', attemptedAt: at(completedAtMs + 3000000) }), {
    runId: 'brief-control', firstSelfAt: at(completedAtMs + 3000001), firstSelfTick: 2000000
  });
  check('one self frame does not reset repeated transport failures', controlled.consecutiveFailures === 6);
  const stable = {
    ...normal, runId: 'stable-control', completedAt: at(completedAtMs + 3100000),
    entry: { firstSelf: { hp: 100 }, firstSelfAt: at(completedAtMs + 3000000) },
    state: { realtime: { receivedAtMs: completedAtMs + 3060000 } },
    stats: { selfPresent: { true: 1200 } }, frameHealth: { maxFrameGapMs: 60 }, leave: null
  };
  const reset = reconcile(state, stable);
  check('one minute of sustained native control resets the streak', reset.consecutiveFailures === 0 && reset.retryNotBeforeAt === '' && reset.lastHealthyAt === stable.completedAt);
  check('59.999 seconds is not the stable reset boundary', reconcile(state, {
    ...stable, state: { realtime: { receivedAtMs: completedAtMs + 3059999 } }
  }).consecutiveFailures === 6);
  check('an interrupted frame window is not stable recovery', reconcile(state, { ...stable, frameHealth: { maxFrameGapMs: 5000 } }).consecutiveFailures === 6);
  const slowExit = { ...normal, runId: 'slow-transport-exit', safety: { event: { reason: 'frame-gap' } }, leave: {
    ...normal.leave, attempts: [{ ok: false, error: 'request timeout' }, ...normal.leave.attempts]
  } };
  check('a timed-out transport exit also prevents immediate re-exposure', reconcile(null, slowExit).consecutiveFailures === 1);

  const stranded = { ...low, leave: { ok: false, attempts: [{ ok: false, error: 'request timeout' }] } };
  const awaiting = reconcile(null, stranded);
  check('an unresolved exit records the failure but does not start a new-entry timer', awaiting.lastFailure.awaitingLeave && awaiting.retryNotBeforeAt === '');
  const recoveryState = { ...beforeState(), runner: { pendingExit: { active: true, sourceRunId: low.runId } } };
  let renewed = awaiting;
  for (let index = 0; index < 3; index++) {
    renewed = reconcile(renewed, {
      ...stranded, runId: `renewed-rescue-${index}`, entry: { firstSelf: null },
      recovery: { exitRecovery: true }, completedAt: at(completedAtMs + 10000 * (index + 1))
    }, { ...recoveryState, runner: { pendingExit: { active: true, sourceRunId: `renewed-chain-${index}` } } });
  }
  check('renewing an uncertain exit chain without another WS attempt cannot inflate failures', renewed.consecutiveFailures === 1 && renewed.lastFailure.runId === low.runId);
  const rescue = { ...low, runId: 'exit-rescue', entry: { firstSelf: null }, completedAt: at(completedAtMs + 100000) };
  const rescued = reconcile(awaiting, rescue, recoveryState);
  check('exit retries count once and start waiting only after confirmed absence', rescued.consecutiveFailures === 1
    && !rescued.lastFailure.awaitingLeave && rescued.retryNotBeforeAt === at(completedAtMs + 160000));
  check('normalization is bounded and keeps deadlines across serialization', JSON.stringify(normalizeLoginAdmission(JSON.parse(JSON.stringify(rescued)))) === JSON.stringify(rescued));
  check('maximum backoff remains finite for malformed counters', transportRetryDelayMs(1000000) === 300000);
  const compact = buildCompactBrowserlessStatus(browserlessCompactStatusSource(gateState, {}, { nowMs: completedAtMs }), { nowMs: completedAtMs });
  check('compact status exposes the persistent entry/failure evidence', compact.runner.loginAdmission.lastServerEntry.count === 44 && compact.runner.loginAdmission.consecutiveFailures === 1);
  const html = renderBrowserlessWebPanel();
  const functionStart = html.indexOf('function offlineActionTitleText(status)');
  const functionEnd = html.indexOf('function nonBlankText(text)', functionStart);
  const offlineTitle = new Function('number', 'offlineCooldownAt', `${html.slice(functionStart, functionEnd)}; return offlineActionTitleText;`)(Number, () => true);
  check('panel explains the transport wait ahead of generic cooldown text', offlineTitle({ action: { reason: 'login-transport-backoff' }, stats: { offline: { reconnectRemainingMs: 60000 } } }) === '连接异常，等待恢复后重试');
  check('panel keeps exit rescue ahead of transport wait', offlineTitle({ action: { reason: 'login-transport-backoff' }, exitRecovery: { active: true } }) === '等待退出确认重试');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-login-admission-'));
  const integration = [];
  try {
    for (const shape of [
      { restart: false, hp: 39, radius: 20500 },
      { restart: true, hp: 39, radius: 20500 },
      { restart: false, hp: 0, radius: 30000 },
      { restart: true, hp: null, radius: 30000 },
      { restart: false, hp: 39, radius: 20500, firstDay: true }
    ]) {
      const { restart, hp, radius } = shape;
      const tag = `${restart ? 'restart' : 'continuous'}-${hp === null ? 'unknown' : hp}${shape.firstDay ? '-first-day' : ''}`;
      let nowMs = attemptedAtMs;
      const config = {
        ...parseBrowserlessRunnerArgs([
          '--live', '--data-dir', path.join(root, tag), '--loop-delay-ms', '1000',
          '--user-id', '7', '--session-token', 'offline-admission-test', '--login-point-x', String(point.x),
          '--login-point-y', String(point.y), '--login-point-hp', '100'
        ], {}),
        snapshotEdgeEnabled: false, loginPointSafetySuccessRequired: 1, once: restart
      };
      const initial = beforeState();
      if (shape.firstDay) initial.stats.today.sessionCount = 0;
      updateBrowserlessStateFile(config.stateFile, initial);
      let calls = 0, fetched = 0, nextAt = 0, nextSafety = null, diskAtNext = null;
      const run = async (runConfig, options) => {
        calls++;
        if (calls === 1) {
          const snapshotSafety = await runPreLoginSnapshotSafety(runConfig, options.persistedState, {
            now: () => nowMs, fetchWithTimeout: async () => { throw new Error('healthy entry must be exempt'); }
          });
          options.onSnapshotSafety(snapshotSafety);
          options.onLoginTransportAttempt({ runId: low.runId, attemptedAt: at(nowMs) });
          nowMs = completedAtMs;
          return { ...failedCanary(hp), snapshotSafety };
        }
        if (calls > 2) throw new Error('unexpected extra login cycle');
        nextAt = nowMs;
        diskAtNext = readBrowserlessStateFile(config.stateFile);
        check(`${tag}: next canary reads the new HP from disk`, options.persistedState.loginPointSafety.point.hp === hp);
        check(`${tag}: no reused daily-first exemption after server-confirmed entry`, options.bypassPreLoginSafetyReason === '');
        nextSafety = await runPreLoginSnapshotSafety(runConfig, options.persistedState, {
          now: () => nowMs,
          fetchWithTimeout: async () => {
            fetched++;
            return {
              ok: true, status: 200, statusText: 'OK', headers: { get: () => '' },
              text: async () => JSON.stringify({ tick: 1114000, entities: [{
                user_id: 9, entity_id: 9, x: point.x + 20000, y: point.y, hp: 100,
                life: 'Alive', current_join_mode: 'Active', stamina_5s_remaining_milli: 9000, stamina_5s_limit_milli: 10000
              }], bullets: [], coin_drops: [], messages: [] })
            };
          }
        });
        options.onSnapshotSafety(nextSafety);
        return { ok: false, runId: 'fixture-stop', completedAt: at(nowMs), snapshotSafety: nextSafety,
          safety: { event: { reason: 'restart-drain-ready', shouldLeave: false } } };
      };
      const deps = { ...fixtureDeps(() => nowMs), sleep: async ms => { nowMs += ms; }, runReadOnlyOnce: run };
      await runBrowserlessRunner(config, deps);
      if (restart) {
        const saved = readBrowserlessStateFile(config.stateFile);
        check(`${tag}: first one-shot invocation persists the failure before exit`, saved.runner.loginAdmission.retryNotBeforeAt === at(completedAtMs + 60000));
        nowMs += 5000;
        await runBrowserlessRunner({ ...config, once: false }, deps);
      }
      check(`${tag}: next cycle waits until the durable deadline`, nextAt === completedAtMs + 60000);
      check(`${tag}: next real safety check blocks a threat inside the required radius`, fetched === 1 && nextSafety.ok === false
        && nextSafety.response.summary.safety.radius === radius && nextSafety.response.summary.safety.blockingPlayers.length === 1);
      check(`${tag}: failed WS remains recorded after a successful leave`, diskAtNext.network.sourceIpPreflight.phase === 'login-failed'
        && diskAtNext.runner.loginAdmission.consecutiveFailures === 1);
      check(`${tag}: old first-self login clock is preserved`, diskAtNext.runner.lastLoginAt === beforeState().runner.lastLoginAt);
      check(`${tag}: cooldown does not replace the prior recorded gameplay exit reason`, diskAtNext.stats.lastExit?.reason === 'frame-gap'
        && diskAtNext.runner.loginAdmission.lastFailure.reason === 'unconfirmed-entry');
      integration.push({ restart, attempts: calls, nextAt: at(nextAt), knownHp: diskAtNext.loginPointSafety.point.hp, snapshotRequests: fetched, radius: nextSafety.response.summary.safety.radius });
    }
    for (const online of [false, true]) {
      const config = { ...parseBrowserlessRunnerArgs([
        '--once', '--live', '--data-dir', path.join(root, online ? 'takeover' : 'pending'), '--user-id', '7',
        '--session-token', 'offline-priority-test', '--login-point-x', '0', '--login-point-y', '0', '--login-point-hp', '100'
      ], {}), snapshotEdgeEnabled: false };
      const initial = beforeState();
      initial.runner.loginAdmission = reconcile(null, low);
      initial.stats.currentSession.online = online;
      if (!online) initial.runner.pendingExit = {
        active: true, exitAttemptId: 'pending-priority', sourceRunId: low.runId, reason: 'ws-connect-unconfirmed-leave',
        firstAtMs: completedAtMs - 5000, lastAttemptAtMs: completedAtMs - 1000, nextRetryAtMs: completedAtMs,
        entryUnconfirmed: true, lastHp: null, minHp: null, startHp: null
      };
      updateBrowserlessStateFile(config.stateFile, initial);
      let calls = 0, waits = 0;
      await runBrowserlessRunner(config, {
        ...fixtureDeps(() => completedAtMs),
        sleep: async () => { waits++; throw new Error('recovery must not wait for a new-entry deadline'); },
        runReadOnlyOnce: async () => {
          calls++;
          return { ok: false, runId: 'priority-stop', completedAt: at(completedAtMs),
            safety: { event: { reason: 'restart-drain-ready', shouldLeave: false } } };
        }
      });
      check(`${online ? 'online takeover' : 'pending exit rescue'} enters the runner immediately despite persisted backoff`, calls === 1 && waits === 0);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  return { ok: true, cases: Object.keys(checks).length, checks, integration };
}

module.exports = { runLoginAdmissionSelfTest };
if (require.main === module) runLoginAdmissionSelfTest().then(result => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}).catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
