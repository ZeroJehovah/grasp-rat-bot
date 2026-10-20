'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { determineCombatFireState, resolveEstablishedCombatFireAuthorizationCore,
  evaluateCombatFireBudgetCore } = require('../../strategy/combat-fire-discipline');
const { contactEntryRiskCore } = require('../../strategy/combat-movement');
const { checkProactiveActiveCombatGates } = require('../../strategy/combat-target-selection');
const { combatStaminaWindowCore, actualShotAffordabilityCore } = require('../../strategy/combat-stamina-window');
const { primaryFinishRaceAuthorization, secondaryFirePolicy } = require('../../strategy/dual-target-policy');
const { buildBrowserlessCombatDryRun, buildCombatMovementPlan, estimateAim } = require('./combat-adapter');
const { opportunityEnemyStaminaCost, evaluateProactiveCombatMarginalRoi } = require('./decision-adapter');
const { buildRuntimeDefaults } = require('../../shared/runtime-defaults');
const { createBrowserlessActionAdapter } = require('./action-adapter');
const { buildIncomingPressureFixture } = require('./incoming-pressure-self-test');
const { runAfkCombatHandoffReserveSelfTest } = require('./afk-combat-handoff-reserve-self-test');
const { runAfkCompetitionApproachSelfTest } = require('./afk-competition-approach-self-test');
const { runSecondaryDodgeSelfTest } = require('./secondary-dodge-self-test');
const { runInvulnerableWaitStationSelfTest } = require('./invulnerable-wait-station-self-test');
const { runStrategyModuleSelfTests } = require('../../strategy/self-test');

// Production-era non-zero controls deliberately exercise ignored old options.
const OLD = { combatShootHardReserveMs: 1800, combatShootDodgeReserveMs: 3800,
  combatShootPressureDodgeReserveMs: 2600, combatClosePressureReserveMs: 2600,
  combatOpponentProbeReserveMs: 5600, combatPreDodgeStaminaCostMs: 1000,
  afkAttackCombatHandoffReserveMs: 3300, afkAttackApproachReserveMaxMs: 5000,
  combatShootPassiveRunnerDodgeReserveMs: 1800,
  invulnerableApproachRiskMinStamina5sMilli: 3000, fieldMigrationStaminaThreshold: 9999 };
const FIRE_OLD = { hardReserveMs: 1800, dodgeReserveMs: 3800, pressureReserveMs: 2600,
  opponentProbeReserveMs: 5600, finishReserveMs: 1800, passiveReserveMs: 1800,
  closePressureReserveMs: 2600, dodgeActionCostMs: 1000 };
function staticReserveGuard(root = path.resolve(__dirname, '../../..')) {
  // Bundled artifact self-tests run behavioral scenarios; source-static gates
  // execute in the tested source checkout before archive construction.
  if (fs.existsSync(path.join(__dirname, 'release-manifest.json'))) return 0;
  const files = [];
  const visit = directory => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) visit(file);
      else if (item.name.endsWith('.js') && !/self-test|regression/.test(item.name)
        && !['web-panel.js', 'combat-audit.js', 'state-file.js', 'zh-cn.js'].includes(item.name)) files.push(file);
    }
  };
  for (const dir of ['src/strategy', 'src/node/browserless', 'src/shared']) visit(path.join(root, dir));
  files.push(path.join(root, 'scripts/replay-browserless-runtime-log.js'));
  const forbiddenOptions = Object.keys(OLD).concat(['combatShootReserveMs', 'combatShootHighHpDodgeReserveMs',
    'combatShootFinishLowThreatDodgeReserveMs', 'combatShootWinningPressureDodgeReserveMs',
    'combatShootSteadyAimDodgeReserveMs', 'combatShootNoDamageDuelDodgeReserveMs',
    'recoveryContactMinimumDodgeBudgetMs', 'proactiveActiveCombatMinimumStamina5s']);
  const optionPattern = new RegExp('(?:options|context|config|BROWSER_RUNTIME_DEFAULTS)\\??\\.(?:' + forbiddenOptions.join('|') + ')\\b');
  const reasonPattern = /['"](?:below-hard-reserve|probe-reserve|finish-reserve|passive-reserve|pressure-dodge-reserve|dodge-reserve|close-pressure-movement-reserve|close-pressure-reserve-band|afk-shoot-stamina-reserve|stamina-reserve-blocked|insufficient-immediate-stamina|stamina-5s-below-approach-reserve)['"]/;
  const violations = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (optionPattern.test(text) || reasonPattern.test(text)
      || /\b(?:dodgeActionCostMs|preDodgeStamina|expectedDodgeCost)\b/.test(text)
      || /Dodge reserve (?:remains|may|must)|dodge-stamina reserve|hardReserve \+ shotCost/.test(text)
      || (file.endsWith('replay-browserless-runtime-log.js') && /\b(?:3400|5600)\b/.test(text))) {
      violations.push(path.relative(root, file));
    }
  }
  assert.deepEqual(violations, [], 'future-reserve authority reintroduced');
  return files.length;
}
function wireHarness() {
  let nowMs = 10000;
  const moves = [], shots = [];
  const self = { user_id: 1, authority: 'realtime', x: 0, y: 0, hp: 100,
    stamina_5s_remaining_milli: 10000 };
  const target = { user_id: 2, authority: 'realtime', x: 6000, y: 0, hp: 100, active: true };
  const state = { realtime: { tick: 200, receivedAtMs: nowMs, self, entities: [self, target] }, command: { shooting: {} } };
  const adapter = createBrowserlessActionAdapter({ ...OLD, now: () => nowMs,
    shootRepeatEnabled: false, velocityRepeatEnabled: false, commandIntervalMs: 0,
    transport: { sendVelocity(dx, dy) { moves.push([dx, dy]); }, sendShoot() { shots.push(nowMs); } } });
  const decide = () => ({ kind: 'combat-live', band: 'combat', combat: { self, target,
    movement: { dx: 0, dy: 1, modifiers: ['dodge'], reason: 'safe-native-movement' },
    aim: { x: target.x, y: target.y }, timing: { observedTick: state.realtime.tick },
    shooting: { wouldShoot: true, commandSuppressed: false, targetRole: 'primary' } } });
  return { adapter, state, self, shots, moves, decide,
    setTime(at) { nowMs = at; state.realtime.receivedAtMs = at; state.realtime.tick = Math.floor(at / 50); } };
}
function runStaminaReserveCleanupSelfTest() {
  const cases = [];
  const check = (id, fn) => { fn(); cases.push(id); };
  check('R01', () => {
    const h = wireHarness(); let spent = 0;
    for (let tick = 200; tick < 300; tick += 1) {
      h.setTime(tick * 50); h.state.realtime.tick = tick;
      h.self.stamina_5s_remaining_milli = 10000 - spent;
      const result = h.adapter.applyDecision(h.state, h.decide());
      if (tick % 10 === 0) { assert.equal(result.shoot.skipped, false); spent += 500; }
      else assert(['shoot-frame:frame-not-on-grid', 'actual-stamina-unaffordable'].includes(result.shoot.reason));
      spent += 50; h.self.y += 50;
    }
    assert.equal(spent, 10000); assert.equal(h.shots.length, 10); assert.equal(h.self.y, 5000);
    assert(h.moves.every(([dx, dy]) => dx === 0 && dy === 1));
    assert.equal(combatStaminaWindowCore(h.shots.map(requestedAtMs => ({ requestedAtMs })), 14950).spentMilli, 5000);
    h.adapter.sealTransport();
  });
  check('R02', () => {
    for (const stamina of [0, 499, 500, 1800, 2833, 3833, 5418]) {
      for (const context of [{}, { targetPressureFire: true }, { opponentProbe: true },
        { finishLowThreat: true }, { closePressure: true }, { closePressure: true, closePressureAttack: true }, { passiveRunner: true }]) {
        const fire = determineCombatFireState({ stamina5s: stamina }, {}, { ...FIRE_OLD, ...context });
        assert(!['disabled', 'paused', 'reserve-band'].includes(fire.state));
        assert.equal(fire.requiredStaminaMs, 500);
      }
    }
  });
  check('R03', () => {
    const f = buildIncomingPressureFixture({ selfHp: 70, stamina: 500 });
    const combat = buildBrowserlessCombatDryRun(f.state, { ...f.options, ...OLD });
    assert.equal(combat.shooting.requiredStaminaMs, 500);
    assert.equal(combat.shooting.dodgeActionCostMs, undefined);
    const withDodge = determineCombatFireState(f.self, f.primary, FIRE_OLD);
    assert.deepEqual(withDodge, determineCombatFireState(f.self, f.primary, { ...FIRE_OLD, dodgeActionCostMs: 9999 }));
  });
  check('R04', () => {
    const h = wireHarness(); h.self.stamina_5s_remaining_milli = 500;
    const result = h.adapter.applyDecision(h.state, h.decide());
    assert.equal(result.shoot.skipped, false); assert.deepEqual(h.moves.at(-1), [0, 1]);
    const duplicate = h.adapter.applyDecision(h.state, h.decide());
    assert.equal(duplicate.shoot.skipped, true);
    assert.deepEqual([duplicate.movement.command?.dx ?? 0, duplicate.movement.command?.dy ?? 1], [0, 1]);
    h.adapter.sealTransport();
  });
  check('R05', () => {
    const t = { user_id: 2, active: true, current_join_mode: 'Active', drop: 100, firing: false };
    const context = { selfStamina5s: 1, proactiveActiveCombatMinimumStamina5s: 5600, opportunityStaminaBudget: 200000 };
    assert.equal(checkProactiveActiveCombatGates({}, t, context).allowed, true);
    assert.equal(checkProactiveActiveCombatGates({}, t, { ...context, opportunityStaminaBudget: 1 }).allowed, false);
  });
  check('R06', () => {
    const self = { x: 0, y: 0, vx: 0, vy: 0, hp: 100, stamina_5s_remaining_milli: 0 };
    const target = { x: 15000, y: 0, vx: -50, vy: 0, distance: 15000, active: true };
    assert.equal(contactEntryRiskCore(self, target, null, { minimumStamina5s: 3400 }).eligible, true);
    assert.equal(contactEntryRiskCore(self, target, null, { armed: false }).eligible, false);
  });
  check('R07', () => assert.equal(runSecondaryDodgeSelfTest().ok, true));
  check('R08', () => {
    const budget = evaluateCombatFireBudgetCore({ stamina5s: 500, resolvedReserveMs: 3800 }, { controlMarginMs: 500, plannedCoverageShots: 3 });
    assert.equal(budget.coverageVolleyStaminaReady, true);
    assert.equal(budget.coverageVolleyRequiredStamina, 500);
    const target = { user_id: 2, active: true, hp: 20, distance: 5000, drop: 50 };
    assert.equal(opportunityEnemyStaminaCost(target, { opportunityExpectedDodgeCostMs: 1200 }),
      opportunityEnemyStaminaCost(target, { opportunityExpectedDodgeCostMs: 99999 }));
    const stateful = { combatTarget: { id: 2, intent: 'profit', firstSeenAt: 1000 }, combatMetrics: { targetId: '2', acceptedShots: 10, confirmedHits: 2 } };
    const roi = phase => evaluateProactiveCombatMarginalRoi({ self: { hp: 100 }, nowMs: 10000 },
      { target, dryRun: { behavior: { dimensions: { shootingPhase: { state: phase } } } } }, {}, structuredClone(stateful), {}, OLD);
    assert.equal(roi('idle').expectedRemainingStamina, 19000);
    assert.equal(roi('preparing').expectedRemainingStamina, 19000);
    const aim = estimateAim({ user_id: 1, x: 0, y: 0, stamina_5s_remaining_milli: 500 },
      { ...target, x: 5000, y: 0, vx: 0, vy: 50 }, OLD);
    if (aim.fireRiskClassification) assert.equal(aim.fireRiskClassification.affordabilityDegraded, false);
  });
  check('R09', () => {
    assert.equal(runAfkCombatHandoffReserveSelfTest().ok, true);
    assert.equal(runAfkCompetitionApproachSelfTest().ok, true);
  });
  check('R10', () => assert.equal(runInvulnerableWaitStationSelfTest().ok, true));
  check('R11', () => {
    const input = { nowMs: 1000, selfHp: 80, primaryHp: 7, primaryTarget: { user_id: 2, hp: 7 },
      primaryPhysicalEligible: true, primaryCompetitionAllowed: true, primaryTargetFresh: true,
      primaryNormalAuthorized: true, normalFireBlocker: 'none', closePressure: { active: true },
      rewardRace: { evaluated: true, continuePrimary: true }, stamina5s: 500, ...FIRE_OLD };
    assert.equal(primaryFinishRaceAuthorization(input, OLD).eligible, true);
    assert.equal(primaryFinishRaceAuthorization({ ...input, selfHp: 50 }, OLD).eligible, false);
  });
  check('R12', () => {
    // Maintained pure suite covers strict pre-dispatch and post-dispatch quota boundaries.
    assert.equal(runStrategyModuleSelfTests().failed, 0);
  });
  check('R13', () => {
    const h = wireHarness(); h.adapter.applyDecision(h.state, h.decide());
    h.self.stamina_5s_remaining_milli = 10000;
    const result = h.adapter.applyDecision(h.state, h.decide());
    assert.equal(result.shoot.reason, 'shoot-frame:frame-slot-already-consumed');
    h.adapter.sealTransport();
  });
  check('R14', () => {
    const h = wireHarness(); h.self.stamina_5s_remaining_milli = 499;
    const result = h.adapter.applyDecision(h.state, h.decide());
    assert.equal(result.shoot.reason, 'actual-stamina-unaffordable');
    assert.deepEqual(h.moves.at(-1), [0, 1]);
    assert.equal(h.shots.length, 0);
    const costs = Array.from({ length: 10 }, (_, i) => ({ requestedAtMs: 1000 + i * 50, shotCostMilli: 500 }));
    assert.equal(actualShotAffordabilityCore({ authority: 'realtime', stamina5s: 5000 }, costs, 1000).allowed, false);
    assert.equal(actualShotAffordabilityCore({ authority: 'realtime', stamina5s: 5500 }, costs, 1000).allowed, true);
    assert.equal(actualShotAffordabilityCore({ authority: 'realtime', staminaMetadataAuthority: 'snapshot', stamina5s: 0 }).allowed, true);
    h.adapter.sealTransport();
  });
  check('R15', () => {
    const base = { targetPresent: true, aimOk: true, inRange: true, fireState: { state: 'paused', reason: 'legacy' } };
    for (const extra of [{ targetPresent: false }, { targetInvulnerable: true }, { aimOk: false },
      { inRange: false }, { aim: { fireReachability: { reachable: false } } }, { contactEntryOnly: true }]) {
      assert.equal(resolveEstablishedCombatFireAuthorizationCore({ ...base, ...extra }).wouldShoot, false);
    }
  });
  check('R16', () => {
    staticReserveGuard();
    const defaults = buildRuntimeDefaults(OLD, false);
    for (const key of Object.keys(OLD)) assert.equal(defaults[key], undefined, key);
    assert.equal(defaults.combatCloseBandReserveEnabled, true);
    assert.equal(defaults.opportunityLongStaminaReserveMs, 1500);
  });
  return { ok: true, cases };
}
module.exports = { runStaminaReserveCleanupSelfTest, staticReserveGuard };
if (require.main === module) console.log(JSON.stringify(runStaminaReserveCleanupSelfTest()));
