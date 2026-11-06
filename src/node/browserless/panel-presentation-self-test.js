'use strict';

const assert = require('assert');
const vm = require('vm');
const { buildCompactBrowserlessStatus, browserlessCompactStatusSource } = require('./state-file');
const { panelTargetRolesCore, postKillPresentationCore } = require('./panel-presentation');
const { renderBrowserlessWebPanel, mapRemoteTargetPositionCore } = require('./web-panel');

function runPanelPresentationSelfTest() {
  const checks = {};
  const check = (name, test) => { test(); checks[name] = true; };
  const script = renderBrowserlessWebPanel().match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(script);
  const context = vm.createContext({
    panelTargetRoles: panelTargetRolesCore,
    postKillPresentation: postKillPresentationCore,
    mapRemoteTargetPosition: mapRemoteTargetPositionCore,
    integer: value => String(Math.round(value))
  });
  vm.runInContext(script.slice(script.indexOf('    const value = v =>'), script.indexOf('    const pad2 =')), context);
  for (const name of ['targetIdentity', 'targetLabel', 'activeTarget', 'actionText', 'actionTitleText',
    'actionReasonDisplay', 'mapTargetMatchesPlayer', 'mapTargetMatchesCoin', 'isAfkNearbyPlayer',
    'mapTargetDescriptorRole', 'mapTargetNearbyRole', 'mapTargetPathColor', 'mapTargetPathPoint',
    'mapTargetLineKey', 'mapTargetLineEntries', 'appendMapTargetDestinations']) {
    const start = script.indexOf(`    function ${name}(`);
    const end = script.indexOf('\n    }', start) + '\n    }'.length;
    assert(start >= 0 && end > start, name);
    vm.runInContext(script.slice(start, end), context);
  }
  const nowMs = Date.parse('2026-11-07T01:00:00Z');
  const config = { nowMs };
  const primary = { type: 'enemy', userId: 9, name: 'retained-afk', x: 1000, y: 2000, drop: 38 };
  const secondary = { userId: 8, name: 'defender', x: 2000, y: 1000,
    combatRole: 'secondary', secondaryTarget: true, primaryTargetId: '', active: true };
  const mission = { active: true, targetId: '9', type: 'enemy', navigationTarget: primary };
  const source = (action, combat = {}, nearby = {}) => ({
    updatedAt: new Date(nowMs).toISOString(),
    runner: { mode: 'profit-live', running: true },
    stats: { currentSession: { online: true } },
    current: {
      self: { userId: 7, hp: 86, x: -50000, y: -60000 },
      decision: { kind: action.kind, action, at: new Date(nowMs).toISOString(), tick: 20,
        input: { nearby: { compactVersion: 3, vr: 50000, ar: 14500, c: [], p: [], ...nearby } } },
      combatSummary: combat,
      profit: { mission }
    }
  });
  const compact = state => {
    const direct = buildCompactBrowserlessStatus(state, config);
    const reduced = buildCompactBrowserlessStatus(browserlessCompactStatusSource(state, config), config);
    assert.deepStrictEqual(reduced, direct, 'double projection preserves presentation');
    assert.deepStrictEqual(panelTargetRolesCore(direct), direct.targets, 'browser respects status targets');
    return direct;
  };
  check('recovery-secondary-release-sequence', () => {
    const before = compact(source({ kind: 'recover' }, { profitMission: mission }));
    const during = compact(source({ kind: 'combat-live', target: secondary }, {
      target: secondary, fireTarget: secondary, profitMission: mission,
      movement: { secondaryTarget: { primaryTargetId: '', mainTargetVisible: false } }
    }));
    const after = compact(source({ kind: 'recover' }, { profitMission: mission }));
    assert.deepStrictEqual([before.targets.mode, during.targets.mode, after.targets.mode], ['none', 'secondary-only', 'none']);
    assert.strictEqual(during.combat.primaryTarget, null);
    assert.strictEqual(during.combat.primaryTargetId, '');
  });
  check('bound-escort-keeps-real-primary', () => {
    const defender = { ...secondary, primaryTargetId: '9' };
    const result = compact(source({ kind: 'combat-live', target: defender }, {
      target: defender, fireTarget: defender, profitMission: mission
    }));
    assert.strictEqual(result.targets.mode, 'dual');
    assert.strictEqual(result.targets.primary.userId, 9);
  });
  check('explicit-empty-primary-survives-browser-fallback', () => {
    const result = panelTargetRolesCore({ targets: { primary: null, secondary },
      action: { kind: 'combat-live', target: secondary }, combat: { primaryTarget: primary, profitMission: mission } });
    assert.strictEqual(result.primary, null);
  });
  const coin = { type: 'coin', id: '8', amount: 40, x: 0, y: 0 };
  check('pickup-owns-primary-instead-of-retained-player', () => {
    assert.strictEqual(compact(source({ kind: 'coin', target: coin }, { profitMission: mission })).targets.primary.type, 'coin');
  });
  check('defensive-loot-retains-coin-and-secondary-with-equal-id', () => {
    const result = compact(source({ kind: 'combat-live', target: secondary, lootTarget: coin }, { target: secondary, profitMission: mission }));
    assert.strictEqual(result.targets.mode, 'dual');
    assert.strictEqual(result.targets.primary.type, 'coin');
  });
  check('explicit-profit-wait-target-kept', () => {
    assert.strictEqual(compact(source({ kind: 'wait', target: coin })).targets.primary.id, '8');
  });
  const wait = {
    kind: 'post-attack-drop-wait', reason: 'post-kill-settlement-wait',
    target: { type: 'post-attack-target', id: '9', name: '', x: null, y: null, drop: 0 },
    postKillSettlement: { active: true, phase: 'drop-pending', targetDropKnown: false, matchedCoinKey: '', pickupEvidence: false }
  };
  check('unknown-drop-is-not-zero', () => {
    const result = compact(source(wait));
    assert.strictEqual(result.action.target.drop, null);
    assert.strictEqual(result.decision.target.drop, null);
    assert.strictEqual(result.targets.primary.drop, null);
    assert(!context.targetLabel(result.action.target).includes('掉落 0'));
  });
  check('observed-zero-remains-zero', () => {
    const result = compact(source({ ...wait, postKillSettlement: { ...wait.postKillSettlement, targetDropKnown: true } }));
    assert.strictEqual(result.action.target.drop, 0);
  });
  for (const [name, changes, nearby, title] of [
    ['pending', {}, {}, '正在确认击杀收益'],
    ['approaching', { postKillSettlementMovement: { arrived: false, distance: 500 } }, {}, '正在前往掉落位置'],
    ['arrived', { postKillSettlementMovement: { arrived: true, distance: 70 } }, {}, '正在确认击杀收益'],
    ['visible', { postKillSettlement: { ...wait.postKillSettlement, phase: 'drop-visible', matchedCoinKey: 'drop' } },
      { c: [['drop', 40, 100, 1, 0, 'snapshot', 0, 0, 0]] }, '正在拾取掉落'],
    ['disappeared', { postKillSettlement: { ...wait.postKillSettlement, phase: 'drop-visible', matchedCoinKey: 'drop' } },
      {}, '正在确认拾取结果'],
    ['picked-up', { postKillSettlement: { ...wait.postKillSettlement, phase: 'settled', pickupEvidence: true } }, {}, '掉落已拾取'],
    ['expired', { postKillSettlement: { ...wait.postKillSettlement, phase: 'expired', active: false } }, {}, '收益确认结束']
  ]) {
    check(`settlement-${name}`, () => {
      const result = compact(source({ ...wait, ...changes }, {}, nearby));
      assert.strictEqual(context.actionTitleText(result), title);
      assert.strictEqual(context.actionText(result), title);
      assert(!context.actionReasonDisplay(result).includes('等待掉落'));
    });
  }
  check('unrelated-coin-does-not-confirm-drop', () => {
    const result = compact(source(wait, {}, { c: [['other', 40, 100, 0]] }));
    assert.strictEqual(context.actionTitleText(result), '正在确认击杀收益');
  });
  const scene = { selfX: -50000, selfY: -60000, visibleRange: 50000, scale: 0.002 };
  const frame = { center: 100, radius: 100 };
  check('missing-coordinate-does-not-project-to-origin', () => {
    for (const invalid of [null, undefined, '', NaN, Infinity]) {
      assert.strictEqual(context.mapTargetPathPoint({ x: invalid, y: 0 }, scene, frame), null);
      assert.strictEqual(context.mapTargetPathPoint({ x: 0, y: invalid }, scene, frame), null);
    }
    assert(context.mapTargetPathPoint({ x: 0, y: 0 }, scene, frame));
  });
  check('unknown-kill-has-neither-line-nor-endpoint', () => {
    const result = compact(source(wait));
    const markers = [];
    context.appendMapTargetDestinations(result, markers, scene, frame);
    assert.strictEqual(markers.length, 0);
    assert.strictEqual(context.mapTargetLineEntries(result, markers, scene, frame).length, 0);
  });
  check('secondary-only-has-one-dashed-line', () => {
    const result = compact(source({ kind: 'combat-live', target: secondary }, { target: secondary, profitMission: mission }));
    const markers = [{ role: 'secondary', targetRole: 'combat', px: 105, py: 110, kind: 'player', color: '#fb7185' }];
    const lines = context.mapTargetLineEntries(result, markers, scene, frame);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(lines[0].key, 'target-line:secondary');
    assert.strictEqual(lines[0].dashed, true);
  });
  check('offscreen-target-line-has-labelled-endpoint', () => {
    const result = compact(source({ kind: 'seek-remote-player', target: { ...primary, x: 100000, authority: 'snapshot-navigation' } }));
    const markers = [];
    context.appendMapTargetDestinations(result, markers, scene, frame);
    assert.strictEqual(markers.length, 1);
    assert(markers[0].label.includes('视野外'));
    const line = context.mapTargetLineEntries(result, markers, scene, frame)[0];
    assert.strictEqual(line.fromMarker, true);
    assert.strictEqual(line.point.px, markers[0].px);
    assert.strictEqual(line.point.py, markers[0].py);
    assert.strictEqual(line.color, '#9ca3af');
    context.appendMapTargetDestinations(result, markers, scene, frame);
    assert.strictEqual(markers.length, 1);
  });
  check('death-point-is-not-a-live-player', () => {
    const action = { ...wait, target: { ...wait.target, x: -49900, y: -60000 } };
    const result = compact(source(action));
    const markers = [];
    context.appendMapTargetDestinations(result, markers, scene, frame);
    assert.strictEqual(markers[0].label, '掉落位置');
    assert.strictEqual(markers[0].color, '#fbbf24');
    assert.strictEqual(context.mapTargetMatchesPlayer(action.target, ['', 100, 0, 0, 0, 0, 0, '', 0, '9']), false);
  });
  return { ok: true, checks };
}

module.exports = { runPanelPresentationSelfTest };
if (require.main === module) process.stdout.write(`${JSON.stringify(runPanelPresentationSelfTest(), null, 2)}\n`);
