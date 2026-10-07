'use strict';

const assert = require('assert');
const { createBrowserlessActionAdapter } = require('./action-adapter');

function harness() {
  let now = 1000;
  let nextTimer = 0;
  const timers = new Map();
  const velocity = [];
  const shots = [];
  const adapter = createBrowserlessActionAdapter({
    userId: 7, now: () => now, commandIntervalMs: 0, decisionIntervalMs: 1000,
    velocityRepeatEnabled: true, shootRepeatEnabled: true,
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    transport: {
      sendVelocity(dx, dy) { velocity.push({ dx, dy, at: now }); },
      sendShoot(x, y) { shots.push({ x, y, at: now }); }
    }
  });
  const target = { user_id: 41, userId: 41, type: 'enemy', authority: 'realtime', x: 0, y: 0,
    hp: 80, active: false, alive: true, vx: 0, vy: 0, current_join_mode: 'Passive' };
  function frame({ x = -54, y = -796, vx = 0, vy = 0, stamina = 10000,
    tick = Math.floor(now / 50), subject = target, bullets = [{ owner_user_id: 99 }], entities = [] } = {}) {
    const self = { user_id: 7, x, y, vx, vy, hp: 100,
      stamina_5s_remaining_milli: stamina, stamina_5s_limit_milli: 10000 };
    return { realtime: { self, entities: [self, ...(subject ? [subject] : []), ...entities],
      bullets, tick, receivedAtMs: now }, command: { shooting: { pendingShots: [], expiredShots: [] } } };
  }
  const decision = subject => ({ action: { kind: 'attack', band: 'profit', reason: 'test', target: subject || target } });
  function advance(at) {
    for (;;) {
      const entry = [...timers].filter(([, timer]) => timer.at <= at).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
    }
    now = at;
  }
  return { adapter, frame, decision, target, velocity, shots, timers, advance,
    setNow(at) { now = at; }, pulse() { return [...timers.values()].find(timer => timer.at === now + 150); } };
}

function runAfkCompetitionApproachSelfTest() {
  let cases = 0;
  {
    const h = harness();
    const first = h.adapter.applyDecision(h.frame(), h.decision());
    assert.deepStrictEqual(h.velocity.at(-1), { dx: 0, dy: 1, at: 1000 });
    assert.equal(first.movement.competitionApproach.vector.precisionPulseMs, 150);
    assert.equal(first.shoot.reason, 'profit-target-competition-position-blocked');
    assert.equal(first.movement.competitionApproach.vector.pushThrough, undefined);
    h.advance(1150);
    assert.deepStrictEqual(h.velocity.at(-1), { dx: 0, dy: 0, at: 1150 });
    h.setNow(1200);
    const stale = h.adapter.applyDecision(h.frame({ tick: 20 }), h.decision());
    assert.equal(stale.movement.competitionApproach.phase, 'feedback-wait');
    h.setNow(2000);
    const next = h.adapter.applyDecision(h.frame({ y: -646 }), h.decision());
    assert.equal(next.movement.competitionApproach.phase, 'approach');
    assert.equal(next.movement.command.dx, 0);
    assert.equal(next.movement.command.dy, 1);
    assert.equal(h.shots.length, 0);
    h.adapter.sealTransport(); cases++;
  }
  {
    const h = harness();
    for (const [index, distance] of [150, 149, 151].entries()) {
      h.setNow(1000 + index * 1000);
      const result = h.adapter.applyDecision(h.frame({ x: -distance, y: 0 }), h.decision());
      assert.equal(result.profitKillRace.fireAllowed, distance <= 150);
      assert.equal(result.movement.competitionApproach.phase, distance <= 150 ? 'arrived' : 'approach');
      if (distance <= 150) assert.equal(result.movement.command.dx, 0);
    }
    assert.equal(h.shots.length, 2);
    h.adapter.sealTransport(); cases++;
  }
  for (const takeover of ['combat', 'safety', 'stop', 'seal']) {
    const h = harness();
    h.adapter.applyDecision(h.frame(), h.decision());
    const pulse = h.pulse();
    assert(pulse);
    h.setNow(1050);
    if (takeover === 'combat') {
      h.adapter.applyCombatDecision(h.frame(), { combat: { target: { userId: 99 },
        movement: { dx: 0, dy: 1, reason: 'emergency-dodge' }, shooting: { wouldShoot: false } } });
    } else if (takeover === 'safety') {
      h.adapter.applyDecision(h.frame(), { action: { kind: 'flee', band: 'safety', reason: 'escape', dx: 0, dy: 1 } });
    } else if (takeover === 'stop') h.adapter.stop('exit');
    else h.adapter.sealTransport('exit');
    const count = h.velocity.length;
    pulse.fn(); // Even a callback already queued before cancellation is inert.
    assert.equal(h.velocity.length, count, takeover);
    assert.equal(h.adapter.getState().afkCompetitionApproach, null);
    h.adapter.sealTransport(); cases++;
  }
  for (const change of ['different-target', 'invulnerable', 'active', 'dead', 'missing', 'competition-cleared']) {
    const h = harness();
    h.adapter.applyDecision(h.frame(), h.decision());
    const pulse = h.pulse();
    h.setNow(1050);
    const subject = change === 'different-target' ? { ...h.target, user_id: 42, userId: 42 }
      : change === 'invulnerable' ? { ...h.target, invulnerable: true, invulnerable_remaining_ticks: 100 }
        : change === 'active' ? { ...h.target, active: true, current_join_mode: 'Active' }
          : change === 'dead' ? { ...h.target, alive: false, hp: 0 }
            : change === 'missing' ? null : h.target;
    const input = h.frame({ subject, ...(change === 'competition-cleared'
      ? { bullets: [], entities: [{ user_id: 99, alive: false, hp: 0 }] } : {}) });
    h.adapter.applyDecision(input, h.decision(subject));
    const count = h.velocity.length;
    pulse.fn();
    assert.equal(h.velocity.length, count, change);
    if (change !== 'different-target') assert.equal(h.adapter.getState().afkCompetitionApproach, null, change);
    h.adapter.sealTransport(); cases++;
  }
  {
    const h = harness();
    const low = h.adapter.applyDecision(h.frame({ x: -100, y: 0, stamina: 3299 }), h.decision());
    assert.equal(low.profitKillRace.fireAllowed, true);
    assert.equal(low.shoot.reason, 'afk-shoot-stamina-reserve');
    assert.equal(low.shoot.requiredStaminaMs, 3300);
    h.setNow(2000);
    const recovered = h.adapter.applyDecision(h.frame({ x: -100, y: 0, stamina: 10000 }), h.decision());
    assert.equal(recovered.shoot.skipped, false);
    h.setNow(2450);
    h.adapter.observeState(h.frame({ x: -100, y: 0, stamina: 9500 }));
    assert.equal(h.shots.length, 2);
    assert.equal(h.shots[1].at - h.shots[0].at, 450);
    h.adapter.sealTransport(); cases++;
  }
  {
    const h = harness();
    h.adapter.applyDecision(h.frame(), h.decision());
    h.advance(1150);
    h.setNow(2000);
    const moved = { ...h.target, x: 800, y: -646 };
    const result = h.adapter.applyDecision(h.frame({ y: -646, subject: moved }), h.decision());
    assert.equal(result.movement.command.dx, 1);
    assert.equal(result.movement.command.dy, 0);
    h.adapter.sealTransport(); cases++;
  }
  return { ok: true, cases };
}

if (require.main === module) console.log(JSON.stringify(runAfkCompetitionApproachSelfTest()));
module.exports = { runAfkCompetitionApproachSelfTest };
