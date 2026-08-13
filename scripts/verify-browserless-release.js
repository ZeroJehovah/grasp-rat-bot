#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RELEASE_KIND = 'grasp-rat-browserless-release';
const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);

function fail(message) {
  throw new Error(message);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalValue(value[key])])
  );
}

function digestPayload(manifest) {
  if (Number(manifest?.schemaVersion) === 1) {
    return {
      schemaVersion: manifest.schemaVersion,
      kind: manifest.kind,
      sourceRevision: manifest.sourceRevision,
      runtimeRevision: manifest.runtimeRevision,
      runtime: manifest.runtime,
      files: manifest.files
    };
  }
  return canonicalValue({
    schemaVersion: manifest?.schemaVersion,
    kind: manifest?.kind,
    sourceRevision: manifest?.sourceRevision,
    runtimeRevision: manifest?.runtimeRevision,
    builtAt: manifest?.builtAt,
    runtime: manifest?.runtime,
    build: manifest?.build,
    entries: manifest?.entries,
    files: manifest?.files
  });
}

function calculateArtifactDigest(manifest) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(digestPayload(manifest)))
    .digest('hex');
}

function walkRelease(root) {
  const files = [];
  const directories = [];
  const visit = dir => {
    const dirStat = fs.lstatSync(dir);
    if (dirStat.isSymbolicLink()) fail(`release symlink is forbidden: ${path.relative(root, dir) || '.'}`);
    if (!dirStat.isDirectory()) fail(`release directory expected: ${dir}`);
    directories.push({ path: dir, stat: dirStat });
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) fail(`release symlink is forbidden: ${relative}`);
      if (stat.isDirectory()) {
        visit(full);
        continue;
      }
      if (!stat.isFile()) fail(`unsupported release entry: ${relative}`);
      files.push({ path: full, relative, stat });
    }
  };
  visit(root);
  return { files, directories };
}

function requireReadOnly(stat, label) {
  if ((stat.mode & 0o222) !== 0) fail(`release entry is writable: ${label}`);
}

function requireRootOwned(stat, label) {
  if (stat.uid !== 0 || stat.gid !== 0) fail(`release entry is not root-owned: ${label}`);
}

function verifyRelease(rootArg, options = {}) {
  const root = path.resolve(String(rootArg || '.'));
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink()) fail(`release root cannot be a symlink: ${root}`);
  if (!rootStat.isDirectory()) fail(`release root is not a directory: ${root}`);

  const manifestFile = path.join(root, 'release-manifest.json');
  const manifestStat = fs.lstatSync(manifestFile);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail('release manifest must be a regular file');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const schemaVersion = Number(manifest.schemaVersion);
  if (!SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) fail(`unsupported release schema: ${manifest.schemaVersion}`);
  if (manifest.kind !== RELEASE_KIND) fail(`unexpected release kind: ${manifest.kind || 'missing'}`);
  if (!/^[0-9a-f]{40}$/.test(String(manifest.sourceRevision || ''))) fail('source revision must be a full lowercase Git commit');
  if (!/^[0-9a-f]{12}$/.test(String(manifest.runtimeRevision || ''))) fail('runtime revision must be 12 lowercase hex characters');
  if (manifest.runtimeRevision !== manifest.sourceRevision.slice(0, 12)) fail('runtime revision does not match source revision');
  if (!/^[0-9a-f]{64}$/.test(String(manifest.artifactDigest || ''))) fail('artifact digest must be a lowercase SHA-256');
  if (!Number.isFinite(Date.parse(String(manifest.builtAt || '')))) fail('release build timestamp is missing or invalid');
  if (manifest.releaseId !== `${manifest.runtimeRevision}-${manifest.artifactDigest.slice(0, 12)}`) fail('release ID mismatch');
  if (options.requireDirectoryId && path.basename(root) !== manifest.releaseId) fail('release directory does not match release ID');

  const walked = walkRelease(root);
  const actualFiles = walked.files
    .map(item => item.relative)
    .filter(relative => relative !== 'release-manifest.json')
    .sort();
  const expectedFiles = Object.keys(manifest.files || {}).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail('release file set differs from manifest');

  for (const item of walked.files) {
    const label = item.relative;
    if (options.requireReadOnly) requireReadOnly(item.stat, label);
    if (options.requireRootOwned) requireRootOwned(item.stat, label);
    if (label === 'release-manifest.json') continue;
    const record = manifest.files[label];
    if (!record || typeof record !== 'object') fail(`release manifest record missing: ${label}`);
    if (sha256File(item.path) !== record.sha256) fail(`release file digest mismatch: ${label}`);
    if (item.stat.size !== record.bytes) fail(`release file size mismatch: ${label}`);
    if ((item.stat.mode & 0o777) !== record.mode) fail(`release file mode mismatch: ${label}`);
  }
  for (const item of walked.directories) {
    const label = path.relative(root, item.path).split(path.sep).join('/') || '.';
    if (options.requireReadOnly) requireReadOnly(item.stat, label);
    if (options.requireRootOwned) requireRootOwned(item.stat, label);
  }

  const calculatedDigest = calculateArtifactDigest(manifest);
  if (calculatedDigest !== manifest.artifactDigest) fail('artifact digest mismatch');

  const requiredFiles = [
    'browserless-runner.cjs',
    'benchmark-browserless-hot-path.cjs',
    'decision-worker-thread.js',
    'realtime-control-worker-thread.js',
    'background-io-worker.js',
    'leave-supervisor-worker.js',
    'remote-profit-worker-thread.js',
    'web-panel.js',
    'dist/target-whitelist.json',
    'release.env',
    'verify-release.cjs'
  ];
  for (const relative of requiredFiles) {
    if (!manifest.files?.[relative]) fail(`required release file missing: ${relative}`);
  }

  if (options.requireRuntimeCompatible) {
    if (manifest.runtime?.platform !== process.platform) fail(`release platform mismatch: ${manifest.runtime?.platform || 'missing'} != ${process.platform}`);
    if (manifest.runtime?.arch !== process.arch) fail(`release architecture mismatch: ${manifest.runtime?.arch || 'missing'} != ${process.arch}`);
    if (String(manifest.runtime?.nodeModulesAbi || '') !== String(process.versions.modules || '')) {
      fail(`release Node ABI mismatch: ${manifest.runtime?.nodeModulesAbi || 'missing'} != ${process.versions.modules || 'missing'}`);
    }
  }

  return {
    ok: true,
    root,
    schemaVersion,
    releaseId: manifest.releaseId,
    sourceRevision: manifest.sourceRevision,
    runtimeRevision: manifest.runtimeRevision,
    artifactDigest: manifest.artifactDigest,
    fileCount: expectedFiles.length,
    runtime: manifest.runtime
  };
}

function parseArgs(argv) {
  const out = {
    root: '',
    requireReadOnly: false,
    requireRootOwned: false,
    requireDirectoryId: false,
    requireRuntimeCompatible: false,
    json: true,
    help: false
  };
  for (const arg of argv) {
    if (arg === '--require-read-only') out.requireReadOnly = true;
    else if (arg === '--require-root-owned') out.requireRootOwned = true;
    else if (arg === '--require-directory-id') out.requireDirectoryId = true;
    else if (arg === '--require-runtime-compatible') out.requireRuntimeCompatible = true;
    else if (arg === '--human') out.json = false;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (!arg.startsWith('--') && !out.root) out.root = arg;
    else fail(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    'Usage: node scripts/verify-browserless-release.js <release-dir> [options]',
    '',
    'Options:',
    '  --require-read-only          Reject writable release files or directories.',
    '  --require-root-owned         Require uid/gid 0 for the complete release tree.',
    '  --require-directory-id       Require the directory basename to equal releaseId.',
    '  --require-runtime-compatible Require platform, architecture, and Node ABI compatibility.',
    '  --human                      Print a compact human-readable result.'
  ].join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.root) fail('release directory is required');
  const report = verifyRelease(options.root, options);
  if (options.json) console.log(JSON.stringify(report));
  else console.log(`Browserless release verified: ${report.releaseId} (${report.fileCount} files, ${report.artifactDigest})`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  RELEASE_KIND,
  calculateArtifactDigest,
  canonicalValue,
  digestPayload,
  parseArgs,
  verifyRelease
};
