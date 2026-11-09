'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

async function main() {
  const checks = [];
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-demo-security-'));
  try {
    const nodeStub = path.join(temp, 'node');
    fs.writeFileSync(nodeStub, '#!/bin/sh\nprintf "%s\\n" "$GRASP_RAT_DEMO_HOST" "$GRASP_RAT_DEMO_WEB_TOKEN"\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${temp}:${process.env.PATH}` };
    delete env.GRASP_RAT_DEMO_HOST;
    delete env.GRASP_RAT_DEMO_WEB_TOKEN;
    const start = spawnSync('bash', [path.join(root, 'headless-demo/start-demo.sh')], { env, encoding: 'utf8' });
    assert.equal(start.status, 0, start.stderr);
    assert(start.stdout.endsWith('127.0.0.1\n\n'));
    for (const token of ['', '1234567890', 'change-this-before-start']) {
      const denied = spawnSync(process.execPath, [path.join(root, 'headless-demo/server.js')], {
        env: { ...process.env, GRASP_RAT_DEMO_HOST: '0.0.0.0', GRASP_RAT_DEMO_WEB_TOKEN: token },
        encoding: 'utf8', timeout: 3000
      });
      assert.equal(denied.status, 1);
      assert.match(denied.stderr, /Refusing to listen/);
    }
    checks.push('A-024 loopback startup and public placeholder rejection');

    process.stdout.write(JSON.stringify({ ok: true, checks }, null, 2) + '\n');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
