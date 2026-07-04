'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { remoteBrowserRuntimeSource } = require('../src/browser/runtime-source');

const ROOT = path.resolve(__dirname, '..');
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
  return remoteBrowserRuntimeSource(options);
}

function bundleRemoteSource(directSource) {
  const result = esbuild.buildSync({
    stdin: {
      contents: directSource,
      sourcefile: 'grasp-rat-remote-bot.generated.js',
      resolveDir: ROOT,
      loader: 'js'
    },
    bundle: true,
    format: BUNDLER_INFO.format,
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
    throw new Error('esbuild did not return bundled remote source');
  }
  return output.text;
}

function bundleRuntimeEvalSource(directSource) {
  const globalName = '__graspRatBotRuntimeEvalBundle';
  const result = esbuild.buildSync({
    stdin: {
      contents: `export default ${directSource};`,
      sourcefile: 'grasp-rat-runtime-eval.generated.js',
      resolveDir: ROOT,
      loader: 'js'
    },
    bundle: true,
    format: BUNDLER_INFO.format,
    globalName,
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
    throw new Error('esbuild did not return bundled runtime eval source');
  }
  return `(() => {\n${output.text}\nreturn ${globalName}.default;\n})()`;
}

function browserRuntimeEvalSourceFor(options = {}) {
  const directSource = require('../src/browser/runtime-source').browserRuntimeSource({
    ...options,
    bundledRuntime: true
  });
  return bundleRuntimeEvalSource(directSource);
}

function bundledRemoteSourceFor(options) {
  const directSource = remoteSourceFor(options);
  const bundledSource = bundleRemoteSource(directSource);
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
      mode: manifestOptions.mode || 'production-full-generated-remote',
      directSha256: bundle.directSha256
    },
    config: {}
  };
}

function writeRemoteBotBundle(options, manifestOptions = {}) {
  const bundle = bundledRemoteSourceFor(options);
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
  buildVersion,
  sha256Hex,
  remoteSourceFor,
  bundleRemoteSource,
  bundleRuntimeEvalSource,
  browserRuntimeEvalSourceFor,
  bundledRemoteSourceFor,
  remoteManifestFor,
  writeRemoteBotBundle
};
