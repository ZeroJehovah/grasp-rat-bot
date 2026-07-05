'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_ENTRY_POINT = path.join(ROOT, 'src', 'browser', 'runtime-entry.js');
const RUNTIME_ENTRY_LABEL = 'src/browser/runtime-entry.js';
const BUNDLER_INFO = Object.freeze({
  name: 'esbuild',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  entry: RUNTIME_ENTRY_LABEL
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

function browserRuntimeConfig(options = {}) {
  const config = {
    bundledRuntime: true,
    dryRun: Boolean(options.dryRun),
    once: Boolean(options.once),
    statusEvery: options.statusEvery
  };
  if (options.version !== undefined) config.version = options.version;
  if (options.overrides && typeof options.overrides === 'object') {
    Object.assign(config, options.overrides);
  }
  return config;
}

function runtimeDefineFor(options = {}) {
  return {
    __GRASP_RAT_RUNTIME_CONFIG__: JSON.stringify(browserRuntimeConfig(options))
  };
}

function remoteSourceFor(options = {}) {
  const entrySource = fs.readFileSync(RUNTIME_ENTRY_POINT, 'utf8');
  return [
    `// entry: ${RUNTIME_ENTRY_LABEL}`,
    `// runtimeConfig: ${JSON.stringify(browserRuntimeConfig(options))}`,
    entrySource
  ].join('\n');
}

async function bundleRuntimeEntry(options = {}, bundleOptions = {}) {
  const result = await esbuild.build({
    entryPoints: [RUNTIME_ENTRY_POINT],
    bundle: true,
    format: BUNDLER_INFO.format,
    ...(bundleOptions.globalName ? { globalName: bundleOptions.globalName } : {}),
    platform: BUNDLER_INFO.platform,
    target: [BUNDLER_INFO.target],
    define: runtimeDefineFor(options),
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent',
    write: false
  });
  const output = result.outputFiles && result.outputFiles[0];
  if (!output || typeof output.text !== 'string') {
    throw new Error(`esbuild did not return bundled output for ${RUNTIME_ENTRY_LABEL}`);
  }
  return output.text;
}

async function bundleRemoteSource(options = {}) {
  return bundleRuntimeEntry(options);
}

async function bundleRuntimeEvalSource(options = {}) {
  const globalName = '__graspRatBotRuntimeEvalBundle';
  const output = await bundleRuntimeEntry(options, { globalName });
  return `(() => {\n${output}\nreturn ${globalName}.default || ${globalName};\n})()`;
}

async function browserRuntimeEvalSourceFor(options = {}) {
  return bundleRuntimeEvalSource(options);
}

async function bundledRemoteSourceFor(options) {
  const directSource = remoteSourceFor(options);
  const bundledSource = await bundleRemoteSource(options);
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
      mode: manifestOptions.mode || 'production-runtime-entry',
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
  RUNTIME_ENTRY_LABEL,
  RUNTIME_ENTRY_POINT,
  buildVersion,
  browserRuntimeConfig,
  sha256Hex,
  runtimeDefineFor,
  remoteSourceFor,
  bundleRuntimeEntry,
  bundleRemoteSource,
  bundleRuntimeEvalSource,
  browserRuntimeEvalSourceFor,
  bundledRemoteSourceFor,
  remoteManifestFor,
  writeRemoteBotBundle
};
