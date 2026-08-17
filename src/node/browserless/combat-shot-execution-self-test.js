'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const {
  rememberBrowserlessCombatEngagement,
  syncCombatShotExecutionEvents,
  syncConfirmedCombatShots
} = require('./combat-adapter');
const { createBrowserlessStateStore } = require('./state-store');

function shotAck(bulletId, targetX, targetY, tick) {
  return {
    type: 'shoot_ok',
    bullet_id: bulletId,
    owner_user_id: 1,
    start_x: 0,
    start_y: 0,
    target_x: targetX,
    target_y: targetY,
    dir_x_micros: 1000000,
    dir_y_micros: 0,
    range_cm: 15000,
    speed_per_tick: 500,
    created_tick: tick,
    expire_tick: tick + 50,
    tick
  };
}

function combatTarget(id, x = 1000) {
  return {
    user_id: id,
    userId: id,
    name: `target-${id}`,
    x,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    max_hp: 100,
    distance: x,
    active: true,
    authority: 'realtime'
  };
}

function combatDecision(generation, mode, cadence = 160, advisoryCadence = 1000, overrides = {}) {
  const target = { ...combatTarget(8), ...(overrides.target || {}) };
  const shooting = {
    wouldShoot: true,
    commandSuppressed: false,
    reason: 'normal-fire',
    cadenceMs: cadence,
    executionCadenceMs: cadence,
    effectiveCadenceMs: cadence,
    advisoryCadenceMs: advisoryCadence,
    advisoryCadenceReasons: [`mode:${mode}`],
    recognizedMode: mode,
    ...overrides.shooting
  };
  return {
    kind: 'combat-live',
    band: 'combat',
    reason: 'combat-live-realtime',
    action: { kind: 'combat-live', band: 'combat', reason: 'combat-live-realtime', target },
    combat: {
      target,
      self: { userId: 1, x: 0, y: 0 },
      movement: { dx: 0, dy: 0, reason: 'combat-hold' },
      aim: { x: target.x, y: target.y, mode: 'intercept', ...overrides.aim },
      timing: { observedTick: overrides.tick ?? 1 },
      tick: overrides.tick ?? 1,
      shooting,
      metrics: {
        targetId: '8',
        engagementId: '8:1000',
        controlGeneration: overrides.controlGeneration || 'control:test',
        engagementGeneration: generation
      }
    }
  };
}

function runCombatShotExecutionSelfTest() {
  const cases = [];
  const check = (name, condition) => {
    assert.ok(condition, name);
    cases.push(name);
  };

  let nowMs = 1000;
  const store = createBrowserlessStateStore({ userId: 1, now: () => nowMs });
  const ackExecutionEvents = [];
  store.setShootExecutionListener(event => ackExecutionEvents.push(event));
  const controlA = store.beginControlGeneration('ws-open');
  const requestA = store.recordShootRequest({
    requestId: 'request-a',
    executionClass: 'combat',
    targetId: 8,
    targetX: 100,
    targetY: 0,
    controlGeneration: controlA,
    engagementGeneration: 'engagement-a',
    segmentGeneration: 'segment-a',
    observedTick: 10,
    evasiveAimModelVersion: 'evasive-aim-2026-08-14-v1',
    evasiveAimStrategy: 'hard-fusion',
    evasiveAimTriggerReason: 'strict-evasive-zero-hit-zigzag-strafe',
    evasiveAimApplied: true,
    evasiveAimOffsetDeg: 1.25,
    evasiveAimBaselineAngleDeg: 12,
    evasiveAimBaselineAimX: 90,
    evasiveAimBaselineAimY: 0,
    evasiveAimLinearAngleDeg: 0.5,
    evasiveAimKnnAngleDeg: 1.5,
    evasiveAimFusionAngleDeg: 1.25,
    evasiveAimRouterAngleDeg: -0.25,
    evasiveAimDisagreementDeg: 1
  });
  store.ingestFrame(shotAck('bullet-a', 100, 0, 11), { receivedAtMs: nowMs + 20 });
  let command = store.getCommandState(nowMs + 20).shooting;
  check('normal ACK keeps request and generation ownership', command.acceptedShots === 1
    && command.confirmedShots[0].requestId === requestA.requestId
    && requestA.requestSequence === 1
    && requestA.ownership?.requestSequence === requestA.requestSequence
    && requestA.ownership?.ownerSelfId === 1
    && requestA.ownership?.wireTarget?.x === 100
    && command.confirmedShots[0].controlGeneration === controlA
    && command.confirmedShots[0].engagementGeneration === 'engagement-a'
    && command.confirmedShots[0].segmentGeneration === 'segment-a'
    && requestA.ownership?.segmentGeneration === 'segment-a'
    && command.confirmedShots[0].requestSequence === requestA.requestSequence
    && command.confirmedShots[0].evasiveAimStrategy === 'hard-fusion'
    && command.confirmedShots[0].evasiveAimBaselineAngleDeg === 12
    && command.confirmedShots[0].evasiveAimLinearAngleDeg === 0.5
    && command.confirmedShots[0].evasiveAimKnnAngleDeg === 1.5
    && command.confirmedShots[0].evasiveAimFusionAngleDeg === 1.25
    && command.confirmedShots[0].evasiveAimRouterAngleDeg === -0.25
    && command.confirmedShots[0].evasiveAimDisagreementDeg === 1);
  const acceptedExecution = ackExecutionEvents.find(event => event.type === 'shoot-ack-accepted');
  check('accepted ACK listener carries bounded replay geometry without expanding cached execution state',
    acceptedExecution?.requestSequence === requestA.requestSequence
      && acceptedExecution?.executionClass === 'combat'
      && acceptedExecution?.ownerSelfId === 1
      && acceptedExecution?.wireTarget?.x === 100
      && acceptedExecution?.ack?.bullet_id === 'bullet-a'
      && acceptedExecution.ack.owner_user_id === '1'
      && acceptedExecution.ack.start_x === 0
      && acceptedExecution.ack.target_x === 100
      && acceptedExecution.ack.dir_x_micros === 1000000
      && acceptedExecution.ack.range_cm === 15000
      && acceptedExecution.ack.speed_per_tick === 500
      && acceptedExecution.ack.created_tick === 11
      && acceptedExecution.ack.expire_tick === 61
      && acceptedExecution.ack.observedTick === 10
      && acceptedExecution.ack.executionDelayTicks === 1
      && acceptedExecution.evasiveAimStrategy === 'hard-fusion'
      && acceptedExecution.evasiveAimBaselineAimX === 90
      && acceptedExecution.evasiveAimRouterAngleDeg === -0.25
      && !Object.prototype.hasOwnProperty.call(command.executionEvents.at(-1), 'ack'));

  store.ingestFrame(shotAck('bullet-a', 100, 0, 11), { receivedAtMs: nowMs + 30 });
  command = store.getCommandState(nowMs + 30).shooting;
  check('duplicate ACK is counted without accepting a request twice', command.acceptedShots === 1
    && command.duplicateAckCount === 1
    && ackExecutionEvents.find(event => event.type === 'shoot-ack-duplicate')?.executionClass === 'combat');

  nowMs += 50;
  store.recordShootRequest({
    requestId: 'request-late',
    executionClass: 'profit-opportunity',
    targetId: 8,
    targetX: 200,
    targetY: 0,
    controlGeneration: controlA,
    engagementGeneration: 'engagement-a',
    observedTick: 12
  });
  nowMs += 1100;
  store.recordShootRequest({
    requestId: 'request-b',
    targetId: 9,
    targetX: 300,
    targetY: 0,
    controlGeneration: controlA,
    engagementGeneration: 'engagement-b',
    observedTick: 35
  });
  store.ingestFrame(shotAck('bullet-late', 200, 0, 13), { receivedAtMs: nowMs + 10 });
  command = store.getCommandState(nowMs + 10).shooting;
  const late = command.confirmedShots.find(shot => shot.requestId === 'request-late');
  check('late ACK remains owned by its expired request generation', late?.lateAck === true
    && late.engagementGeneration === 'engagement-a'
    && command.lateAckCount === 1
    && ackExecutionEvents.find(event => event.type === 'shoot-ack-late')?.executionClass === 'profit-opportunity');

  store.ingestFrame(shotAck('bullet-orphan', 999, 999, 40), { receivedAtMs: nowMs + 20 });
  command = store.getCommandState(nowMs + 20).shooting;
  check('unmatched ACK is explicitly orphaned', command.orphanAckCount === 1
    && command.acceptedShots === 2);

  let matchNowMs = 5000;
  const matchStore = createBrowserlessStateStore({ userId: 1, now: () => matchNowMs });
  const matchControl = matchStore.beginControlGeneration('ws-open');
  matchStore.recordShootRequest({
    requestId: 'request-same-aim-expired',
    targetId: 8,
    targetX: 400,
    targetY: 0,
    controlGeneration: matchControl,
    engagementGeneration: 'engagement-old',
    observedTick: 50
  });
  matchNowMs += 1100;
  matchStore.recordShootRequest({
    requestId: 'request-same-aim-pending',
    targetId: 8,
    targetX: 400,
    targetY: 0,
    controlGeneration: matchControl,
    engagementGeneration: 'engagement-current',
    observedTick: 90
  });
  matchStore.ingestFrame(shotAck('bullet-same-aim-current', 400, 0, 94), { receivedAtMs: matchNowMs + 10 });
  const sameAimCommand = matchStore.getCommandState(matchNowMs + 10).shooting;
  const sameAim = sameAimCommand.confirmedShots.find(shot => shot.bullet_id === 'bullet-same-aim-current');
  check('created tick matches a same-aim ACK to the causal pending request', sameAim?.requestId === 'request-same-aim-pending'
    && sameAim.lateAck === false
    && sameAim.executionDelayTicks === 4
    && sameAimCommand.expiredShots.some(shot => shot.requestId === 'request-same-aim-expired'));

  const controlB = store.beginControlGeneration('ws-reconnect');
  check('WebSocket reconnect changes control generation', controlB !== controlA);
  store.reset({ userId: 1, reason: 'session-restart' });
  const controlC = store.getControlGeneration();
  check('session restart changes control generation and clears request ownership', controlC !== controlB);
  store.ingestFrame(shotAck('bullet-after-reset', 300, 0, 41), { receivedAtMs: nowMs + 30 });
  command = store.getCommandState(nowMs + 30).shooting;
  check('ACK after session reset is orphaned instead of transferred', command.acceptedShots === 0
    && command.orphanAckCount === 1);

  const self = { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 };
  const stateful = {};
  const engagementOptions = (controlGeneration, tick) => ({
    nowMs: tick * 50,
    currentTick: tick,
    commandShooting: {
      controlGeneration,
      lastConfirmationSequence: tick,
      lastRequestSequence: tick
    }
  });
  rememberBrowserlessCombatEngagement(stateful, self, combatTarget(8), engagementOptions(controlC, 100));
  const generationA1 = stateful.combatMetrics.engagementGeneration;
  const rootA = stateful.combatMetrics.engagementId;
  rememberBrowserlessCombatEngagement(stateful, self, combatTarget(9), engagementOptions(controlC, 101));
  const generationB = stateful.combatMetrics.engagementGeneration;
  rememberBrowserlessCombatEngagement(stateful, self, combatTarget(8), engagementOptions(controlC, 102));
  const generationA2 = stateful.combatMetrics.engagementGeneration;
  check('A to B to A creates distinct activation generations while retaining root engagement', generationA1 !== generationB
    && generationA1 !== generationA2
    && stateful.combatMetrics.engagementId === rootA);
  stateful.combatTarget = null;
  rememberBrowserlessCombatEngagement(stateful, self, combatTarget(8), engagementOptions(controlC, 103));
  const generationA3 = stateful.combatMetrics.engagementGeneration;
  check('same-target re-engagement changes generation', generationA3 !== generationA2);
  const controlD = `${controlC}:reconnect`;
  rememberBrowserlessCombatEngagement(stateful, self, combatTarget(8), engagementOptions(controlD, 104));
  check('control reconnect changes an active engagement generation', stateful.combatMetrics.engagementGeneration !== generationA3
    && stateful.combatMetrics.controlGeneration === controlD);

  const ownedGeneration = stateful.combatMetrics.engagementGeneration;
  stateful.combatMetrics.acceptedShots = 0;
  stateful.combatMetrics.requestedShots = 1;
  stateful.combatMetrics.wireRequestCount = 1;
  stateful.combatMetrics.confirmationSequenceBaseline = 500;
  stateful.combatLearning = {
    acceptedBulletIds: Array.from({ length: 256 }, (_, index) => `old:${index}`),
    recentShots: []
  };
  const added = syncConfirmedCombatShots(stateful, {
    command: {
      shooting: {
        confirmedShots: [
          { targetId: 8, bullet_id: 'old-generation', confirmationSequence: 501, controlGeneration: controlD, engagementGeneration: generationA3 },
          { targetId: 8, bullet_id: 'before-cursor', confirmationSequence: 500, controlGeneration: controlD, engagementGeneration: ownedGeneration },
          {
            targetId: 8,
            bullet_id: 'owned',
            confirmationSequence: 501,
            controlGeneration: controlD,
            engagementGeneration: ownedGeneration,
            evasiveAimModelVersion: 'evasive-aim-2026-08-14-v1',
            evasiveAimStrategy: 'similar-history-knn',
            evasiveAimTriggerReason: 'half-efficiency-window-hit-shortfall',
            evasiveAimApplied: true,
            evasiveAimOffsetDeg: -1.5,
            evasiveAimBaselineAngleDeg: 8,
            evasiveAimBaselineAimX: 1000,
            evasiveAimBaselineAimY: 0,
            evasiveAimLinearAngleDeg: 0.25,
            evasiveAimKnnAngleDeg: -1.5,
            evasiveAimFusionAngleDeg: -1,
            evasiveAimRouterAngleDeg: 0,
            evasiveAimDisagreementDeg: 1.75
          }
        ]
      }
    }
  }, combatTarget(8), {}, { nowMs });
  check('generation, cursor, and 256-id eviction cannot transfer an old ACK', added === 1
    && stateful.combatMetrics.acceptedShots === 1
    && stateful.combatMetrics.acceptedShots <= stateful.combatMetrics.requestedShots
    && stateful.combatLearning.recentShots[0].evasiveAimStrategy === 'similar-history-knn'
    && stateful.combatLearning.recentShots[0].evasiveAimBaselineAngleDeg === 8
    && stateful.combatLearning.recentShots[0].evasiveAimDisagreementDeg === 1.75);

  let actionNow = 5000;
  let wireDispatches = 0;
  const wireTargets = [];
  const executionEvents = [];
  const actionStore = createBrowserlessStateStore({ userId: 1, now: () => actionNow });
  const actionControl = actionStore.beginControlGeneration('ws-open');
  const adapter = createBrowserlessActionAdapter({
    now: () => actionNow,
    controlGeneration: actionControl,
    commandIntervalMs: 0,
    combatShootMinIntervalMs: 160,
    maxPendingShootCommands: 20,
    getSegmentGeneration: context => (
      context.controlGeneration === actionControl
        && Boolean(context.engagementGeneration)
        && String(context.targetId) === '8'
        ? 'segment:execution-current'
        : ''
    ),
    transport: {
      sendVelocity() {},
      sendShoot(x, y) {
        wireDispatches += 1;
        wireTargets.push({ x, y });
      }
    },
    onShootRequest: request => actionStore.recordShootRequest(request),
    onShootExecution: event => {
      executionEvents.push(event);
      return actionStore.recordShootExecution(event);
    }
  });
  const stateSnapshot = {
    realtime: { tick: 1, receivedAtMs: actionNow, self: { user_id: 1, x: 0, y: 0 } },
    command: actionStore.getCommandState(actionNow)
  };
  const modes = ['mixed/unknown', 'zigzag-strafe', 'retreat-kite', 'charge-close', 'high-entropy', 'low-confidence'];
  for (let index = 0; index < modes.length; index += 1) {
    actionNow += index === 0 ? 0 : 160;
    const decision = combatDecision('execution-generation', modes[index], 160, 1000, {
      controlGeneration: actionControl,
      tick: index + 1,
      aim: index === 0 ? {
        evasiveAim: {
          modelVersion: 'evasive-aim-2026-08-14-v1',
          strategy: 'gaussian-linear',
          triggerReason: 'half-efficiency-window-hit-shortfall',
          applied: true,
          offsetDeg: 0.75,
          baselineAngleDeg: 0,
          baselineAimX: 1000,
          baselineAimY: 0,
          linearAngleDeg: 0.75,
          knnAngleDeg: -0.5,
          fusionAngleDeg: 0.25,
          routerAngleDeg: 0,
          disagreementDeg: 1.25
        }
      } : undefined
    });
    const result = adapter.applyDecision(stateSnapshot, decision);
    check(`advisory mode ${modes[index]} keeps base execution cadence`, result.shoot?.skipped === false
      && result.shoot?.cadenceMs === 160);
  }
  check('advisory cadence never reduces dispatch count', wireDispatches === modes.length
    && executionEvents.filter(event => event.type === 'shoot-dispatch').length === modes.length
    && executionEvents.filter(event => event.type === 'shoot-dispatch').every(event => (
      Number(event.requestSequence) > 0
        && event.executionClass === 'combat'
        && event.segmentGeneration === 'segment:execution-current'
    ))
    && actionStore.getCommandState(actionNow).shooting.pendingShots.every(request => (
      request.executionClass === 'combat'
        && request.segmentGeneration === 'segment:execution-current'
    ))
    && executionEvents.find(event => event.type === 'shoot-dispatch' && event.evasiveAimApplied === true)?.evasiveAimLinearAngleDeg === 0.75
    && actionStore.getCommandState(actionNow).shooting.pendingShots.find(request => request.evasiveAimApplied === true)?.evasiveAimDisagreementDeg === 1.25);

  const secondaryStateful = {};
  const secondaryTarget = {
    ...combatTarget(8),
    combatRole: 'secondary',
    secondaryTarget: true,
    whitelisted: true
  };
  rememberBrowserlessCombatEngagement(
    secondaryStateful,
    { user_id: 1, x: 0, y: 0, hp: 100, max_hp: 100 },
    secondaryTarget,
    engagementOptions(actionControl, 40)
  );
  const secondaryGeneration = secondaryStateful.combatMetrics.engagementGeneration;
  actionNow += 160;
  const primaryFireTarget = {
    ...combatTarget(42, 4200),
    combatRole: 'primary',
    secondaryTarget: false
  };
  const primaryDispatch = adapter.applyDecision(stateSnapshot, combatDecision(
    secondaryGeneration,
    'mixed/unknown',
    160,
    1000,
    {
      controlGeneration: actionControl,
      tick: 39,
      target: secondaryTarget,
      shooting: {
        target: primaryFireTarget,
        targetRole: 'primary',
        aim: { x: 4200, y: 0, mode: 'exact' }
      }
    }
  ));
  const primaryCommandState = actionStore.getCommandState(actionNow);
  const syncedPrimaryEvents = syncCombatShotExecutionEvents(
    secondaryStateful,
    { command: primaryCommandState },
    secondaryTarget
  );
  check('primary fire uses the primary wire target', primaryDispatch.shoot?.skipped === false
    && primaryDispatch.fireTarget?.user_id === 42
    && wireTargets.at(-1)?.x === 4200
    && primaryDispatch.shoot?.execution?.targetId === '42');
  check('primary fire retains the secondary engagement segment',
    primaryDispatch.shoot?.execution?.segmentGeneration === 'segment:execution-current');
  check('primary fire is synchronized as cross-target execution', syncedPrimaryEvents >= 1
    && secondaryStateful.combatMetrics.crossTargetDispatchCount === 1
    && secondaryStateful.combatExecutionLedger.dispatchTimesByTarget['42'].length === 1);
  check('primary fire does not enter the secondary dispatch window',
    secondaryStateful.combatTarget.secondaryDispatchTimes.length === 0);
  assert.strictEqual(
    Number(secondaryStateful.combatMetrics.actualShots || 0),
    0,
    'primary fire does not increment secondary actual shots'
  );
  cases.push('primary fire does not increment secondary actual shots');

  actionNow += 160;
  const secondaryDispatch = adapter.applyDecision(stateSnapshot, combatDecision(
    secondaryGeneration,
    'mixed/unknown',
    160,
    1000,
    {
      controlGeneration: actionControl,
      tick: 40,
      target: secondaryTarget
    }
  ));
  const secondaryCommandState = actionStore.getCommandState(actionNow);
  const syncedSecondaryEvents = syncCombatShotExecutionEvents(
    secondaryStateful,
    { command: secondaryCommandState },
    secondaryTarget
  );
  check('actual secondary dispatches enter the bounded shot ledger', secondaryDispatch.shoot?.skipped === false
    && syncedSecondaryEvents >= 1
    && secondaryStateful.combatTarget.secondaryDispatchTimes.length === 1
    && secondaryStateful.combatMetrics.actualShots >= 1);

  actionNow += 50;
  const throttled = adapter.applyDecision(stateSnapshot, combatDecision(
    'execution-generation',
    'mixed/unknown',
    160,
    1000,
    { controlGeneration: actionControl, tick: 20 }
  ));
  check('cadence skip is explicit and generation-bound', throttled.shoot?.reason === 'shoot-command-throttled'
    && throttled.shoot?.execution?.skipReason === 'shoot-command-throttled'
    && throttled.shoot?.execution?.engagementGeneration === 'execution-generation');

  actionNow += 160;
  const reserveBlocked = adapter.applyDecision(stateSnapshot, combatDecision(
    'execution-generation',
    'mixed/unknown',
    160,
    1000,
    {
      controlGeneration: actionControl,
      tick: 21,
      shooting: {
        wouldShoot: false,
        commandSuppressed: true,
        reason: 'dodge-reserve',
        finalFireBlocker: 'dodge-reserve'
      }
    }
  ));
  check('Dodge reserve remains an explicit hard fire-state boundary', reserveBlocked.shoot?.skipped === true
    && reserveBlocked.shoot?.reason === 'dodge-reserve'
    && wireDispatches === modes.length + 2);

  const safetyStop = adapter.sealShooting('safety-trigger:test-exit', {
    observedTick: 22,
    engagementGeneration: 'execution-generation',
    target: combatTarget(8),
    baseCadenceMs: 160,
    executionCadenceMs: 160
  });
  actionNow += 160;
  const staleAfterSafety = adapter.applyDecision(stateSnapshot, combatDecision(
    'execution-generation',
    'charge-close',
    160,
    1000,
    { controlGeneration: actionControl, tick: 23 }
  ));
  check('safety-trigger seals the active generation before a stale combat action', safetyStop.sealed === true
    && safetyStop.engagementGeneration === 'execution-generation'
    && staleAfterSafety.shoot?.skipped === true
    && staleAfterSafety.shoot?.reason === 'safety-trigger:test-exit'
    && wireDispatches === modes.length + 2);
  check('safety shot stop and stale skip remain structured and generation-bound', executionEvents.some(event => (
    event.type === 'shoot-stop'
    && event.executionClass === 'safety'
    && event.engagementGeneration === 'execution-generation'
    && event.outcome === 'sealed'
  )) && executionEvents.some(event => (
    event.type === 'shoot-skip'
    && event.executionClass === 'combat'
    && event.engagementGeneration === 'execution-generation'
    && event.outcome === 'shooting-sealed'
  )));

  return { ok: true, cases };
}

module.exports = { runCombatShotExecutionSelfTest };
