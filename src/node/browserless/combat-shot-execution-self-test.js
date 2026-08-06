'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const {
  rememberBrowserlessCombatEngagement,
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
  const target = combatTarget(8);
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
      aim: { x: target.x, y: target.y, mode: 'intercept' },
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
    targetId: 8,
    targetX: 100,
    targetY: 0,
    controlGeneration: controlA,
    engagementGeneration: 'engagement-a',
    observedTick: 10
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
    && command.confirmedShots[0].requestSequence === requestA.requestSequence);
  const acceptedExecution = ackExecutionEvents.find(event => event.type === 'shoot-ack-accepted');
  check('accepted ACK listener carries bounded replay geometry without expanding cached execution state',
    acceptedExecution?.requestSequence === requestA.requestSequence
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
      && !Object.prototype.hasOwnProperty.call(command.executionEvents.at(-1), 'ack'));

  store.ingestFrame(shotAck('bullet-a', 100, 0, 11), { receivedAtMs: nowMs + 30 });
  command = store.getCommandState(nowMs + 30).shooting;
  check('duplicate ACK is counted without accepting a request twice', command.acceptedShots === 1
    && command.duplicateAckCount === 1);

  nowMs += 50;
  store.recordShootRequest({
    requestId: 'request-late',
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
    && command.lateAckCount === 1);

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
          { targetId: 8, bullet_id: 'owned', confirmationSequence: 501, controlGeneration: controlD, engagementGeneration: ownedGeneration }
        ]
      }
    }
  }, combatTarget(8), {}, { nowMs });
  check('generation, cursor, and 256-id eviction cannot transfer an old ACK', added === 1
    && stateful.combatMetrics.acceptedShots === 1
    && stateful.combatMetrics.acceptedShots <= stateful.combatMetrics.requestedShots);

  let actionNow = 5000;
  let wireDispatches = 0;
  const executionEvents = [];
  const actionStore = createBrowserlessStateStore({ userId: 1, now: () => actionNow });
  const actionControl = actionStore.beginControlGeneration('ws-open');
  const adapter = createBrowserlessActionAdapter({
    now: () => actionNow,
    controlGeneration: actionControl,
    commandIntervalMs: 0,
    combatShootMinIntervalMs: 160,
    maxPendingShootCommands: 20,
    transport: {
      sendVelocity() {},
      sendShoot() { wireDispatches += 1; }
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
      tick: index + 1
    });
    const result = adapter.applyDecision(stateSnapshot, decision);
    check(`advisory mode ${modes[index]} keeps base execution cadence`, result.shoot?.skipped === false
      && result.shoot?.cadenceMs === 160);
  }
  check('advisory cadence never reduces dispatch count', wireDispatches === modes.length
    && executionEvents.filter(event => event.type === 'shoot-dispatch').length === modes.length
    && executionEvents.filter(event => event.type === 'shoot-dispatch').every(event => Number(event.requestSequence) > 0));

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
    && wireDispatches === modes.length);

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
    && wireDispatches === modes.length);
  check('safety shot stop and stale skip remain structured and generation-bound', executionEvents.some(event => (
    event.type === 'shoot-stop'
    && event.engagementGeneration === 'execution-generation'
    && event.outcome === 'sealed'
  )) && executionEvents.some(event => (
    event.type === 'shoot-skip'
    && event.engagementGeneration === 'execution-generation'
    && event.outcome === 'shooting-sealed'
  )));

  return { ok: true, cases };
}

module.exports = { runCombatShotExecutionSelfTest };
