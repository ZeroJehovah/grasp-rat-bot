#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const NODE_VERSION = 'v22.23.2';
const DEFAULT_ROOT = '/opt/grasp-rat-browserless';
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function runtimeNodePath(root = DEFAULT_ROOT) {
  return path.join(root, 'runtime', `node-${NODE_VERSION}-linux-arm64`, 'bin', 'node');
}
function metadata(executable) {
  return JSON.parse(execFileSync(executable, ['-p',
    'JSON.stringify({node:process.version,nodeModulesAbi:process.versions.modules,platform:process.platform,arch:process.arch})'
  ], { encoding: 'utf8', timeout: 10000 }));
}
function verifyNodeRuntime(executable, expected, options = {}) {
  const stat = fs.lstatSync(executable);
  assert(stat.isFile() && !stat.isSymbolicLink(), 'Node runtime must be a regular file');
  assert((stat.mode & 0o111) !== 0, 'Node runtime is not executable');
  if (options.requireRootOwned !== false) {
    const parents = [executable];
    for (let n = 0; n < 4; n++) parents.push(path.dirname(parents.at(-1)));
    for (const file of parents) {
      const item = fs.lstatSync(file);
      assert(!item.isSymbolicLink() && item.uid === 0 && item.gid === 0,
        `Node runtime must be root-owned without symlinks: ${file} (${item.uid}:${item.gid})`);
      assert((item.mode & 0o222) === 0, 'Node runtime must be read-only');
    }
  }
  const actual = metadata(executable);
  for (const key of ['node', 'nodeModulesAbi', 'platform', 'arch']) {
    assert(String(actual[key]) === String(expected[key]), `Node runtime ${key} mismatch: ${actual[key]} != ${expected[key]}`);
  }
  const executableSha256 = hashFile(executable);
  if (expected.executableSha256) assert.strictEqual(executableSha256, expected.executableSha256, 'Node runtime digest mismatch');
  return { ok: true, executable, ...actual, executableSha256 };
}
function installNodeRuntime(root, source) {
  assert(process.getuid?.() === 0, 'Node runtime installation requires root');
  root = path.resolve(root);
  assert(root !== '/', 'unsafe runtime root');
  source = fs.realpathSync(source);
  const expected = { ...metadata(source), executableSha256: hashFile(source) };
  assert(expected.node === NODE_VERSION && expected.platform === 'linux' && expected.arch === 'arm64',
    'Node runtime must match the pinned service version/platform');
  const executable = runtimeNodePath(root), versionDir = path.dirname(path.dirname(executable));
  for (const dir of [root, path.join(root, 'runtime')]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o555 });
    const stat = fs.lstatSync(dir);
    assert(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && stat.gid === 0, 'unsafe runtime directory');
    fs.chmodSync(dir, 0o555);
  }
  if (fs.existsSync(versionDir)) return { ...verifyNodeRuntime(executable, expected), installed: false };
  const staging = fs.mkdtempSync(path.join(root, 'runtime', '.install-node-'));
  try {
    fs.mkdirSync(path.join(staging, 'bin'), { mode: 0o555 });
    fs.copyFileSync(source, path.join(staging, 'bin', 'node'), fs.constants.COPYFILE_EXCL);
    fs.chownSync(path.join(staging, 'bin', 'node'), 0, 0);
    fs.chmodSync(path.join(staging, 'bin', 'node'), 0o555);
    const license = path.join(path.dirname(path.dirname(source)), 'LICENSE');
    if (fs.existsSync(license)) {
      fs.copyFileSync(license, path.join(staging, 'LICENSE'));
      fs.chownSync(path.join(staging, 'LICENSE'), 0, 0);
      fs.chmodSync(path.join(staging, 'LICENSE'), 0o444);
    }
    fs.writeFileSync(path.join(staging, 'runtime.json'), JSON.stringify(expected, null, 2) + '\n', { mode: 0o444 });
    fs.chmodSync(staging, 0o555);
    verifyNodeRuntime(path.join(staging, 'bin', 'node'), expected);
    fs.renameSync(staging, versionDir);
    return { ...verifyNodeRuntime(executable, expected), installed: true };
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }
}
function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-node-runtime-'));
  try {
    const first = installNodeRuntime(root, process.execPath);
    assert(first.installed);
    assert(!installNodeRuntime(root, process.execPath).installed, 'identical runtime installation is idempotent');
    assert.throws(() => verifyNodeRuntime(first.executable, { ...first, nodeModulesAbi: 'wrong' }), /ABI|nodeModulesAbi/);
    assert.throws(() => verifyNodeRuntime(first.executable, { ...first, executableSha256: '0'.repeat(64) }), /digest/);
    fs.chmodSync(first.executable, 0o755);
    assert.throws(() => verifyNodeRuntime(first.executable, first), /read-only/);
    fs.chmodSync(first.executable, 0o555);
    const alias = path.join(root, 'alias');
    fs.symlinkSync(first.executable, alias);
    assert.throws(() => verifyNodeRuntime(alias, first), /regular file/);
    fs.appendFileSync(first.executable, '\0');
    assert.throws(() => installNodeRuntime(root, process.execPath), /digest/,
      'an existing different binary is rejected rather than silently overwritten');
    return { ok: true, cases: 7 };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const value = key => args.includes(key) ? args[args.indexOf(key) + 1] : null;
    const root = value('--release-root') || DEFAULT_ROOT;
    assert(args.includes('--self-test') || args.includes('--install') || args.includes('--verify'),
      'use --install --source <node>, --verify --manifest <file>, or --self-test');
    const result = args.includes('--self-test') ? selfTest()
      : args.includes('--verify')
        ? verifyNodeRuntime(runtimeNodePath(root), JSON.parse(fs.readFileSync(value('--manifest'), 'utf8')).runtime)
        : installNodeRuntime(root, value('--source') || process.execPath);
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { NODE_VERSION, runtimeNodePath, verifyNodeRuntime, installNodeRuntime };
