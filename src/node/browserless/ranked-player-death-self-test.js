'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createEasyKillPlayerTracker } = require('./easy-kill-player-tracker');
const { createHighDropPlayerTracker } = require('./high-drop-player-tracker');
const { promoteRankedPlayerDeaths } = require('./ranked-player-death');

function runRankedPlayerDeathSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranked-death-'));
  let at = Date.parse('2026-10-04T03:00:00Z');
  const start = at;
  const file = path.join(dir, 'easy.json');
  let easy = createEasyKillPlayerTracker({ file, now: () => at });
  const rank = createHighDropPlayerTracker({ file: path.join(dir, 'rank.json'), now: () => at });
  const observe = (id, drop) => rank.observeSnapshot({ tick: 10, entities: [{ user_id: id, name: `player-${id}`, drop }] }, { observedAtMs: at, selfUserId: 1, source: 'ws' });
  const death = (id, key, occurredAtMs = at) => ({ victimUserId: id, killerUserId: 99, key, occurredAtMs, tick: 100 });
  const promote = events => promoteRankedPlayerDeaths(events, { highDropPlayerTracker: rank, easyKillPlayerTracker: easy, selfUserId: 1, observedAtMs: at, source: 'test' });
  const player = id => easy.status(at).players.find(p => p.userId === id);
  try {
    observe(2, 500); observe(3, 499); observe(1, 900); observe(4, 700);
    at += 1000;
    observe(2, 20); // Retained rank membership survives a post-death Drop decrease.
    assert.strictEqual(promote([death(2, 'death-2')]).promoted, 1);
    assert.strictEqual(player(2).score, 10);
    assert.strictEqual(player(2).killCount, 0);
    assert.strictEqual(easy.status(at).engagements.length, 0);
    assert.strictEqual(promote([death(3, 'below'), death(1, 'self'), death(90, 'unknown')]).promoted, 0);
    assert.strictEqual(promote([death(4, 'before-ranking', start - 1)]).promoted, 0);
    assert.strictEqual(promote([death(4, 'future', at + 1)]).promoted, 0);
    easy.recordImmediateFailure({ userId: 2 }, 'test-failure', { atMs: at });
    assert.strictEqual(player(2).score, 9);
    easy = createEasyKillPlayerTracker({ file, now: () => at });
    assert.strictEqual(player(2).killCount, 0);
    assert.strictEqual(promote([death(2, 'death-2')]).promoted, 0);
    assert.strictEqual(player(2).score, 9);
    for (let i = 0; i < 9; i += 1) easy.recordImmediateFailure({ userId: 2 }, 'test-failure', { atMs: at });
    assert.strictEqual(player(2), undefined);
    easy = createEasyKillPlayerTracker({ file, now: () => at });
    assert.strictEqual(promote([death(2, 'death-2')]).promoted, 0);
    at += 1000;
    assert.strictEqual(promote([death(2, 'death-2-next')]).promoted, 1);
    easy.observeCombatEngagement({ userId: 4, active: true }, { atMs: at, tick: 90, selfHp: 100 });
    easy.finishEngagement(4, 'combat-exit', { atMs: at });
    assert.strictEqual(promote([death(4, 'pending-death')]).promoted, 1);
    assert.strictEqual(easy.status(at).blockedUserIds.includes(4), false);
    at += 41000;
    easy.expirePendingOutcomes(at);
    assert.strictEqual(player(4).score, 10);
    observe(5, 600);
    easy.observeCombatEngagement({ userId: 5, active: true }, { atMs: at, tick: 110 });
    assert.strictEqual(promote([{ ...death(5, 'prior-death'), tick: 100 }]).promoted, 1);
    assert.strictEqual(easy.status(at).engagements.some(e => e.userId === 5), true);
    observe(6, 600);
    easy.observeCombatEngagement({ userId: 6, active: true }, { atMs: at, tick: 90, selfHp: 100 });
    easy.observeKillEvidence([{ targetUserId: 6, tick: 100 }], { atMs: at });
    assert.strictEqual(promote([death(6, 'own-death')]).promoted, 1);
    assert.strictEqual(player(6).score, 10);
    assert.strictEqual(player(6).killCount, 1);
    assert.strictEqual(player(6).observedDeathCount, 1);
    at += 600001;
    assert.strictEqual(promote([death(4, 'old', at - 600001)]).promoted, 0);
    at = Date.parse('2026-10-04T16:00:01Z');
    assert.strictEqual(promote([death(2, 'previous-day', start + 2000)]).promoted, 0);
    assert.strictEqual(player(6).score, 9);
    assert.strictEqual(rank.status(at).players.length, 0);
    return { ok: true, cases: 15 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
module.exports = { runRankedPlayerDeathSelfTest };
if (require.main === module) process.stdout.write(JSON.stringify(runRankedPlayerDeathSelfTest()) + '\n');
