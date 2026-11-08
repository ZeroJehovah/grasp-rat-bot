'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-activation-test-'));
try {
  const scripts = path.join(root, 'scripts');
  fs.mkdirSync(scripts);
  fs.mkdirSync(path.join(root, 'bin'));
  fs.writeFileSync(path.join(root, 'bin/id'), '#!/bin/sh\nprintf "0\\n"\n', { mode: 0o755 });
  fs.copyFileSync(path.join(__dirname, 'activate-browserless-release.sh'), path.join(scripts, 'activate-browserless-release.sh'));
  fs.writeFileSync(path.join(scripts, 'verify-browserless-release.js'), `
    const fs = require('fs');
    const file = process.env.FIXTURE_COUNTER;
    const count = Number(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 0) + 1;
    fs.writeFileSync(file, String(count));
    if (count === Number(process.env.FIXTURE_FAIL_AT)) process.exit(1);
  `);
  const ids = ['a', 'b', 'c'].map(letter => `${letter.repeat(12)}-${letter.repeat(12)}`);
  let cases = 0;
  for (const [mode, hasCurrent, failAt] of [
    ['activate', true, 3], ['activate', true, 4], ['rollback', true, 3],
    ['rollback', true, 4], ['activate', false, 2], ['activate', true, 0], ['rollback', true, 0]
  ]) {
    const releaseRoot = path.join(root, `case-${cases++}`);
    fs.mkdirSync(path.join(releaseRoot, 'releases'), { recursive: true });
    for (const id of ids) fs.mkdirSync(path.join(releaseRoot, 'releases', id));
    if (hasCurrent) fs.symlinkSync(`releases/${ids[0]}`, path.join(releaseRoot, 'current'));
    if (hasCurrent) fs.symlinkSync(`releases/${ids[1]}`, path.join(releaseRoot, 'previous'));
    const result = spawnSync('bash', [path.join(scripts, 'activate-browserless-release.sh'), '--release-root', releaseRoot,
      ...(mode === 'rollback' ? ['--rollback'] : ['--release-id', ids[2]])], {
      env: { ...process.env, NODE_BIN: process.execPath, PATH: `${root}/bin:${process.env.PATH}`,
        FIXTURE_COUNTER: path.join(releaseRoot, 'counter'), FIXTURE_FAIL_AT: String(failAt) }, encoding: 'utf8'
    });
    assert.equal(result.status, failAt ? 1 : 0, result.stderr);
    const current = fs.existsSync(path.join(releaseRoot, 'current')) ? fs.readlinkSync(path.join(releaseRoot, 'current')) : null;
    const previous = fs.existsSync(path.join(releaseRoot, 'previous')) ? fs.readlinkSync(path.join(releaseRoot, 'previous')) : null;
    assert.equal(current, failAt ? (hasCurrent ? `releases/${ids[0]}` : null)
      : `releases/${mode === 'rollback' ? ids[1] : ids[2]}`);
    assert.equal(previous, failAt ? (hasCurrent ? `releases/${ids[1]}` : null) : `releases/${ids[0]}`);
  }
  console.log(JSON.stringify({ ok: true, cases }));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
