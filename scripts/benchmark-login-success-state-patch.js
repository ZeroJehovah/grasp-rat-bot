#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runLoginSuccessStatePatchPersistenceSelfTest
} = require('../src/node/browserless/runner');

function parseArgs(argv = []) {
  const options = { loginCount: 13, paddingBytes: 2 * 1024 * 1024, keepTemp: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--login-count') options.loginCount = Number(argv[++index] || 13);
    else if (arg === '--padding-bytes') options.paddingBytes = Number(argv[++index] || 2 * 1024 * 1024);
    else if (arg === '--keep-temp') options.keepTemp = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-login-success-patch-'));
  try {
    const result = await runLoginSuccessStatePatchPersistenceSelfTest(tmp, options);
    process.stdout.write(`${JSON.stringify({ ...result, temporaryDirectory: options.keepTemp ? tmp : '' }, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (!options.keepTemp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
