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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  while (true) {
    try {
      const result = await runBrowserlessRunner(config);
      console.log(JSON.stringify(result, null, 2));
      if (config.once || config.dryRun || result?.reason === 'explicit-stop' || result?.reason === 'unsupported-control-mode') {
        if (!result?.ok && result?.reason !== 'explicit-stop') process.exitCode = 1;
        return;
      }
    } catch (err) {
      console.error(err?.stack || err?.message || String(err));
      if (config.once) {
        process.exitCode = 1;
        return;
      }
    }
    await sleep(Math.max(1000, Number(config.loopDelayMs || 30000)));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err?.stack || err?.message || String(err));
    process.exitCode = 1;
  });
}

module.exports = {
  main
};
