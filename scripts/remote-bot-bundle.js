'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const {
  remoteRuntimeEntrySource,
  runtimeEvalEntrySource
} = require('../src/browser/runtime-entry-source');

const ROOT = path.resolve(__dirname, '..');
const VIRTUAL_ENTRY_NAMESPACE = 'grasp-rat-virtual-entry';
const REMOTE_RUNTIME_ENTRY = 'grasp-rat-remote-runtime-entry.js';
const RUNTIME_EVAL_ENTRY = 'grasp-rat-runtime-eval-entry.js';
const BUNDLER_INFO = Object.freeze({
  name: 'esbuild',
  format: 'iife',
  platform: 'browser',
  target: 'es2020'
});

function buildVersion() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds())
  ].join('');
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function remoteSourceFor(options) {
  return remoteRuntimeEntrySource(options);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function virtualEntryPlugin(entryPath, contents) {
  const entryFilter = new RegExp(`^${escapeRegExp(entryPath)}$`);
  return {
    name: 'grasp-rat-virtual-entry',
    setup(build) {
      build.onResolve({ filter: entryFilter }, () => ({
        path: entryPath,
        namespace: VIRTUAL_ENTRY_NAMESPACE
      }));
      build.onLoad({ filter: entryFilter, namespace: VIRTUAL_ENTRY_NAMESPACE }, () => ({
        contents,
        loader: 'js',
        resolveDir: ROOT
      }));
    }
  };
}

async function bundleVirtualEntry(entryPath, contents, options = {}) {
  const result = await esbuild.build({
    entryPoints: [entryPath],
    plugins: [virtualEntryPlugin(entryPath, contents)],
    bundle: true,
    format: BUNDLER_INFO.format,
    ...(options.globalName ? { globalName: options.globalName } : {}),
    platform: BUNDLER_INFO.platform,
    target: [BUNDLER_INFO.target],
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent',
    write: false
  });
  const output = result.outputFiles && result.outputFiles[0];
  if (!output || typeof output.text !== 'string') {
    throw new Error(`esbuild did not return bundled output for ${entryPath}`);
  }
  return output.text;
}

async function bundleRemoteSource(directSource) {
  return bundleVirtualEntry(REMOTE_RUNTIME_ENTRY, directSource);
}

async function bundleRuntimeEvalSource(entrySource) {
  const globalName = '__graspRatBotRuntimeEvalBundle';
  const output = await bundleVirtualEntry(RUNTIME_EVAL_ENTRY, entrySource, { globalName });
  return `(() => {\n${output}\nreturn ${globalName}.default;\n})()`;
}

async function browserRuntimeEvalSourceFor(options = {}) {
  return bundleRuntimeEvalSource(runtimeEvalEntrySource(options));
}

async function bundledRemoteSourceFor(options) {
  const directSource = remoteSourceFor(options);
  const bundledSource = await bundleRemoteSource(directSource);
  const directSha256 = sha256Hex(directSource);
  const sha256 = sha256Hex(bundledSource);
  return {
    directSource,
    bundledSource,
    directBytes: Buffer.byteLength(directSource),
    bytes: Buffer.byteLength(bundledSource),
    directSha256,
    sha256
  };
}

function remoteManifestFor(options, bundle, manifestOptions = {}) {
  return {
    version: options.version,
    builtAt: new Date().toISOString(),
    scriptUrl: options.scriptUrl,
    sha256: bundle.sha256,
    statusEvery: options.statusEvery,
    production: Boolean(manifestOptions.production),
    bundler: {
      ...BUNDLER_INFO,
      mode: manifestOptions.mode || 'production-runtime-entry-source',
      directSha256: bundle.directSha256
    },
    config: {}
  };
}

async function writeRemoteBotBundle(options, manifestOptions = {}) {
  const bundle = await bundledRemoteSourceFor(options);
  fs.mkdirSync(path.dirname(options.outFile), { recursive: true });
  fs.mkdirSync(path.dirname(options.manifestFile), { recursive: true });
  const manifest = remoteManifestFor(options, bundle, manifestOptions);
  fs.writeFileSync(options.outFile, bundle.bundledSource);
  fs.writeFileSync(options.manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return {
    outFile: options.outFile,
    manifestFile: options.manifestFile,
    version: options.version,
    directBytes: bundle.directBytes,
    directSha256: bundle.directSha256,
    bytes: bundle.bytes,
    sha256: bundle.sha256
  };
}

module.exports = {
  BUNDLER_INFO,
  REMOTE_RUNTIME_ENTRY,
  RUNTIME_EVAL_ENTRY,
  buildVersion,
  sha256Hex,
  remoteSourceFor,
  virtualEntryPlugin,
  bundleVirtualEntry,
  bundleRemoteSource,
  bundleRuntimeEvalSource,
  browserRuntimeEvalSourceFor,
  bundledRemoteSourceFor,
  remoteManifestFor,
  writeRemoteBotBundle
};
