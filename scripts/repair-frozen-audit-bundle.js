#!/usr/bin/env node
'use strict';

// Rebuild only the reviewed browser modules against the frozen distribution.
// Shared strategy evolution must not silently revive the retired browser build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const { bundleRemoteSource } = require('./remote-bot-bundle');
const baseline = 'a8f24fee2080ea06d1928e7a4ee60ef3eebb3399';
const version = 'bootstrap-0.4.621';
const repairedModules = [
  'src/shared/target-whitelist.js',
  ...['target-whitelist', 'combat-log-queue-runtime', 'exit-audit-runtime',
    'native-state-runtime', 'native-transport-runtime', 'combat-target-runtime',
    'pending-exit-runtime', 'orchestration-tick-runtime'].map(name => `src/browser/runtime/${name}.js`),
  'src/browser/runtime-entry.js'
];
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
function modules(source) {
  const matches = [...source.matchAll(/^  \/\/ ([^\n]+)\n  var (require_\w+) = __commonJS\(\{/gm)];
  return new Map(matches.map((match, i) => [match[1], {
    name: match[2], start: match.index,
    end: matches[i + 1]?.index ?? source.lastIndexOf('  require_runtime_entry();'),
    text: source.slice(match.index, matches[i + 1]?.index ?? source.lastIndexOf('  require_runtime_entry();'))
  }]));
}
async function main() {
  const original = execFileSync('git', ['show', `${baseline}:dist/grasp-rat-remote-bot.js`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(sha256(original), '1a8128e9b7ebc4355c2820878ea23bdf1d542f0ba36b52c5922e6ef65013efaa');
  process.chdir(root);
  const fresh = await bundleRemoteSource({ version, statusEvery: 30000 });
  const oldModules = modules(original);
  const newModules = modules(fresh);
  const names = new Map([...newModules].flatMap(([name, block]) => oldModules.has(name)
    ? [[block.name, oldModules.get(name).name]] : []));
  let repaired = original;
  for (const name of repairedModules.slice().sort((a, b) => oldModules.get(b).start - oldModules.get(a).start)) {
    const old = oldModules.get(name);
    const current = newModules.get(name);
    assert(old && current, `missing module: ${name}`);
    const mapped = current.text.replace(/\brequire_\w+\b/g, token => {
      assert(names.has(token), `new dependency outside frozen bundle: ${name}: ${token}`);
      return names.get(token);
    });
    repaired = repaired.slice(0, old.start) + mapped + repaired.slice(old.end);
  }
  repaired = repaired.replace('version: "bootstrap-0.4.620"', `version: "${version}"`);
  new vm.Script(repaired);
  const patchedModules = modules(repaired);
  for (const [name, block] of oldModules) {
    if (!repairedModules.includes(name)) assert.equal(patchedModules.get(name).text, block.text, `unreviewed module changed: ${name}`);
  }
  const distribution = path.join(root, 'dist/grasp-rat-remote-bot.js');
  const manifestFile = path.join(root, 'dist/manifest.json');
  if (process.argv.includes('--write')) {
    const manifest = JSON.parse(execFileSync('git', ['show', `${baseline}:dist/manifest.json`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
    manifest.version = version;
    manifest.builtAt = new Date().toISOString();
    manifest.sha256 = sha256(repaired);
    manifest.bundler.mode = 'frozen-audit-module-repair';
    delete manifest.bundler.directSha256;
    manifest.bundler.baseRevision = baseline;
    manifest.bundler.repairedModules = repairedModules;
    fs.writeFileSync(distribution, repaired);
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  } else {
    assert.equal(fs.readFileSync(distribution, 'utf8'), repaired, 'frozen artifact differs from reviewed module rebuild');
    assert.equal(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).sha256, sha256(repaired));
  }
  // Execute only factories under review; never start a page runtime or game transport.
  const context = { URL, Set, Map, console, setInterval: () => 0 };
  const expose = repaired.replace('  require_runtime_entry();', `  globalThis.auditFactories = {
    whitelist: ${oldModules.get('src/browser/runtime/target-whitelist.js').name}()
  };`);
  vm.runInNewContext(expose, context);
  const state = { url: 'https://fixture.invalid/whitelist' };
  const whitelist = context.auditFactories.whitelist.createTargetWhitelistRuntime({
    bot: { targetWhitelist: state }, cfg: {}, now: () => 1, fetchJsonNoStore: async () => ({ userIds: [17] })
  });
  await whitelist.refreshTargetWhitelist();
  assert(whitelist.isWhitelistedTarget({ user_id: 17 }));
  console.log(JSON.stringify({ ok: true, version, sha256: sha256(repaired), modules: repairedModules.length,
    preservedModules: oldModules.size - repairedModules.length }));
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
