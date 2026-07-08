#!/usr/bin/env node
'use strict';

const {
  parseBrowserlessRunnerArgs,
  usage
} = require('../src/node/browserless/config');
const {
  runBrowserlessRunner,
  runBrowserlessRunnerSelfTest
} = require('../src/node/browserless/runner');

async function main() {
  const config = parseBrowserlessRunnerArgs(process.argv.slice(2), process.env);
  if (config.help) {
    console.log(usage());
    return;
  }
  if (config.selfTest) {
    const result = await runBrowserlessRunnerSelfTest();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
    return;
  }
  const result = await runBrowserlessRunner(config);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}

module.exports = {
  main
};
