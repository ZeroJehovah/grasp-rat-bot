#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const moduleBuiltin = require('module');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RELEASE_ENTRYPOINTS = {
  'scripts/browserless-runner.js': 'browserless-runner.cjs',
  'src/node/browserless/decision-worker-thread.js': 'decision-worker-thread.js',
  'src/node/browserless/realtime-control-worker-thread.js': 'realtime-control-worker-thread.js',
  'src/node/browserless/background-io-worker.js': 'background-io-worker.js',
  'src/node/browserless/leave-supervisor-worker.js': 'leave-supervisor-worker.js',
  'src/node/browserless/remote-profit-worker-thread.js': 'remote-profit-worker-thread.js',
  'scripts/benchmark-browserless-hot-path.js': 'benchmark-browserless-hot-path.cjs'
};

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding === null ? null : 'utf8',
    input: options.input,
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe']
  });
  if (result.error || result.status !== 0) {
    const stderr = String(result.stderr || result.error?.message || '').trim();
    fail(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return result.stdout;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function ensureDirectory(dir, mode = 0o755) {
  fs.mkdirSync(dir, { recursive: true, mode });
}

function copyFile(source, destination, mode = 0o444) {
  ensureDirectory(path.dirname(destination));
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, mode);
}

function copyTree(source, destination, mode = 0o444) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      ensureDirectory(to);
      copyTree(from, to, mode);
    } else if (entry.isFile()) {
      copyFile(from, to, mode);
    } else {
      fail(`unsupported dependency entry: ${from}`);
    }
  }
}

function writeText(file, text, mode = 0o444) {
  ensureDirectory(path.dirname(file));
  fs.writeFileSync(file, text, { encoding: 'utf8', mode });
  fs.chmodSync(file, mode);
}

function packageVersion(packageFile) {
  return JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
}

function normalizeInput(input, sourceDir, repositoryNodeModules) {
  const resolved = path.resolve(sourceDir, input);
  if (resolved === sourceDir || resolved.startsWith(sourceDir + path.sep)) {
    return path.relative(sourceDir, resolved).split(path.sep).join('/');
  }
  if (resolved === repositoryNodeModules || resolved.startsWith(repositoryNodeModules + path.sep)) {
    return `node_modules/${path.relative(repositoryNodeModules, resolved).split(path.sep).join('/')}`;
  }
  if (resolved === '/usr/share/nodejs' || resolved.startsWith('/usr/share/nodejs/')) {
    return `system-nodejs/${path.relative('/usr/share/nodejs', resolved).split(path.sep).join('/')}`;
  }
  return `external-build-input/${resolved}`;
}

function fileRecords(root) {
  const records = {};
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) fail(`release cannot contain symlink: ${relative}`);
      if (stat.isDirectory()) {
        visit(full);
        continue;
      }
      if (!stat.isFile()) fail(`release contains unsupported entry: ${relative}`);
      if (relative === 'release-manifest.json') continue;
      records[relative] = {
        sha256: sha256File(full),
        bytes: stat.size,
        mode: stat.mode & 0o777
      };
    }
  };
  visit(root);
  return Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b)));
}

function chmodDirectoriesReadOnly(root) {
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(path.join(dir, entry.name));
    }
    fs.chmodSync(dir, 0o555);
  };
  visit(root);
}

function parseArgs(argv) {
  const repositoryRoot = path.resolve(__dirname, '..');
  const out = {
    repositoryRoot,
    revision: 'HEAD',
    outputDir: '',
    nodeModulesDir: path.join(repositoryRoot, 'node_modules'),
    keepArchivedSource: false,
    json: true,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repository') out.repositoryRoot = path.resolve(argv[++i] || out.repositoryRoot);
    else if (arg === '--revision') out.revision = argv[++i] || out.revision;
    else if (arg === '--output-dir') out.outputDir = path.resolve(argv[++i] || '');
    else if (arg === '--node-modules') out.nodeModulesDir = path.resolve(argv[++i] || out.nodeModulesDir);
    else if (arg === '--keep-archived-source') out.keepArchivedSource = true;
    else if (arg === '--human') out.json = false;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else fail(`unknown argument: ${arg}`);
  }
  if (out.repositoryRoot !== repositoryRoot && !argv.includes('--node-modules')) {
    out.nodeModulesDir = path.join(out.repositoryRoot, 'node_modules');
  }
  return out;
}

function usage() {
  return [
    'Usage: node scripts/build-browserless-release.js --output-dir <dir> [options]',
    '',
    'Options:',
    '  --revision <commit>       Git commit to archive. Default: HEAD.',
    '  --repository <dir>        Primary source repository. Default: repository containing this script.',
    '  --node-modules <dir>      Locked build dependencies. Default: <repository>/node_modules.',
    '  --keep-archived-source    Preserve the temporary archived source and report its path.',
    '  --human                   Print a compact human-readable result.',
    '',
    'The runtime source is always extracted with git archive from the resolved commit; uncommitted files are never build inputs.'
  ].join('\n');
}

function resolveSourceRevision(repositoryRoot, revision) {
  if (!fs.statSync(path.join(repositoryRoot, '.git')).isDirectory()) {
    fail(`repository must be the primary checkout with a .git directory: ${repositoryRoot}`);
  }
  const resolved = String(run('git', ['rev-parse', '--verify', `${revision}^{commit}`], { cwd: repositoryRoot })).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(resolved)) fail(`invalid resolved source revision: ${resolved}`);
  return resolved;
}

function archiveSource(repositoryRoot, sourceRevision, tempRoot) {
  const archiveFile = path.join(tempRoot, 'source.tar');
  const sourceDir = path.join(tempRoot, 'source');
  ensureDirectory(sourceDir);
  run('git', ['archive', '--format=tar', `--output=${archiveFile}`, sourceRevision], { cwd: repositoryRoot });
  run('tar', ['-xf', archiveFile, '-C', sourceDir]);
  fs.unlinkSync(archiveFile);
  return sourceDir;
}

function assertBuildDependencies(sourceDir, repositoryNodeModules) {
  const lock = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package-lock.json'), 'utf8'));
  const packageMeta = JSON.parse(fs.readFileSync(path.join(sourceDir, 'package.json'), 'utf8'));
  const expected = name => lock.packages?.[`node_modules/${name}`]?.version || '';
  const installedPackages = {
    esbuild: path.join(repositoryNodeModules, 'esbuild', 'package.json'),
    ws: path.join(repositoryNodeModules, 'ws', 'package.json'),
    'better-sqlite3': path.join(repositoryNodeModules, 'better-sqlite3', 'package.json')
  };
  for (const [name, file] of Object.entries(installedPackages)) {
    const actual = packageVersion(file);
    if (!expected(name) || actual !== expected(name)) {
      fail(`${name} dependency mismatch: lock=${expected(name) || 'missing'} installed=${actual}`);
    }
  }
  const systemPackages = {
    undici: '/usr/share/nodejs/undici/package.json',
    '@fastify/busboy': '/usr/share/nodejs/@fastify/busboy/package.json'
  };
  for (const [name, file] of Object.entries(systemPackages)) {
    const wanted = String(packageMeta.browserlessReleaseBuildDependencies?.[name] || '');
    const actual = packageVersion(file);
    if (!wanted || actual !== wanted) {
      fail(`${name} build dependency mismatch: source=${wanted || 'missing'} installed=${actual}`);
    }
  }
  return { lock, packageMeta };
}

async function buildRelease(options) {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const outputDir = path.resolve(options.outputDir);
  const repositoryNodeModules = path.resolve(options.nodeModulesDir);
  if (!options.outputDir) fail('--output-dir is required');
  const sourceRevision = resolveSourceRevision(repositoryRoot, options.revision);
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length) fail(`output directory is not empty: ${outputDir}`);
  ensureDirectory(outputDir);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grasp-rat-browserless-build.'));
  let keepTemp = Boolean(options.keepArchivedSource);
  try {
    const sourceDir = archiveSource(repositoryRoot, sourceRevision, tempRoot);
    assertBuildDependencies(sourceDir, repositoryNodeModules);
    const sourceCommittedAt = String(run('git', ['show', '-s', '--format=%cI', sourceRevision], { cwd: repositoryRoot })).trim();
    const esbuild = require(path.join(repositoryNodeModules, 'esbuild'));
    const common = {
      absWorkingDir: sourceDir,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: ['node18'],
      sourcemap: false,
      minify: false,
      legalComments: 'eof',
      metafile: true,
      logLevel: 'warning',
      nodePaths: [repositoryNodeModules, '/usr/share/nodejs'],
      external: ['better-sqlite3', 'bufferutil', 'utf-8-validate', './web-panel', './web-panel.js']
    };
    const metafiles = {};
    for (const [entry, output] of Object.entries(RELEASE_ENTRYPOINTS)) {
      const result = await esbuild.build({
        ...common,
        entryPoints: [entry],
        outfile: path.join(outputDir, output)
      });
      metafiles[output] = {
        bytes: fs.statSync(path.join(outputDir, output)).size,
        inputs: Object.keys(result.metafile.inputs || {})
          .map(input => normalizeInput(input, sourceDir, repositoryNodeModules))
          .sort()
      };
    }

    const allowedExternal = new Set([
      ...moduleBuiltin.builtinModules,
      ...moduleBuiltin.builtinModules.map(name => `node:${name}`),
      'better-sqlite3',
      'bufferutil',
      'utf-8-validate',
      './web-panel',
      './web-panel.js'
    ]);
    for (const output of Object.values(RELEASE_ENTRYPOINTS)) {
      const bundledText = fs.readFileSync(path.join(outputDir, output), 'utf8');
      const found = new Set(Array.from(bundledText.matchAll(/require\((['"])([^'"]+)\1\)/g), match => match[2]));
      const unexpected = [...found].filter(name => !allowedExternal.has(name)).sort();
      if (unexpected.length) fail(`${output} has unexpected runtime requires: ${unexpected.join(', ')}`);
      if (found.has('undici') || found.has('@fastify/busboy')) fail(`${output} did not bundle HTTP dependencies`);
    }

    copyFile(path.join(sourceDir, 'src', 'node', 'browserless', 'web-panel.js'), path.join(outputDir, 'web-panel.js'));
    copyFile(path.join(sourceDir, 'dist', 'target-whitelist.json'), path.join(outputDir, 'dist', 'target-whitelist.json'));
    const nativeRoot = path.join(repositoryNodeModules, 'better-sqlite3');
    copyFile(path.join(nativeRoot, 'LICENSE'), path.join(outputDir, 'node_modules', 'better-sqlite3', 'LICENSE'));
    copyFile(path.join(nativeRoot, 'package.json'), path.join(outputDir, 'node_modules', 'better-sqlite3', 'package.json'));
    copyTree(path.join(nativeRoot, 'lib'), path.join(outputDir, 'node_modules', 'better-sqlite3', 'lib'));
    copyFile(
      path.join(nativeRoot, 'build', 'Release', 'better_sqlite3.node'),
      path.join(outputDir, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
      0o555
    );
    for (const name of ['bindings', 'file-uri-to-path']) {
      copyTree(path.join(repositoryNodeModules, name), path.join(outputDir, 'node_modules', name));
    }
    writeText(path.join(outputDir, 'package.json'), JSON.stringify({ private: true, type: 'commonjs' }, null, 2) + '\n');
    writeText(path.join(outputDir, 'release.env'), [
      `GRASP_RAT_BROWSERLESS_REVISION=${sourceRevision.slice(0, 12)}`,
      'GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_FILE=dist/target-whitelist.json',
      `GRASP_RAT_BROWSERLESS_TARGET_WHITELIST_URL=https://raw.githubusercontent.com/ZeroJehovah/grasp-rat-bot/${sourceRevision}/dist/target-whitelist.json`,
      ''
    ].join('\n'));
    copyFile(path.join(sourceDir, 'scripts', 'verify-browserless-release.js'), path.join(outputDir, 'verify-release.cjs'), 0o555);

    for (const executable of ['browserless-runner.cjs', 'benchmark-browserless-hot-path.cjs']) {
      fs.chmodSync(path.join(outputDir, executable), 0o555);
    }
    for (const worker of Object.values(RELEASE_ENTRYPOINTS).filter(value => value.endsWith('.js'))) {
      fs.chmodSync(path.join(outputDir, worker), 0o444);
    }

    const manifest = {
      schemaVersion: 2,
      kind: 'grasp-rat-browserless-release',
      sourceRevision,
      runtimeRevision: sourceRevision.slice(0, 12),
      builtAt: sourceCommittedAt,
      runtime: {
        node: process.version,
        nodeModulesAbi: process.versions.modules,
        platform: process.platform,
        arch: process.arch
      },
      build: {
        source: 'git-object-archive',
        sourceCommittedAt,
        packageLockSha256: sha256File(path.join(sourceDir, 'package-lock.json')),
        esbuild: packageVersion(path.join(repositoryNodeModules, 'esbuild', 'package.json')),
        bundledDependencies: {
          ws: packageVersion(path.join(repositoryNodeModules, 'ws', 'package.json')),
          undici: packageVersion('/usr/share/nodejs/undici/package.json'),
          '@fastify/busboy': packageVersion('/usr/share/nodejs/@fastify/busboy/package.json')
        },
        nativeDependencies: {
          'better-sqlite3': packageVersion(path.join(repositoryNodeModules, 'better-sqlite3', 'package.json')),
          bindings: packageVersion(path.join(repositoryNodeModules, 'bindings', 'package.json')),
          'file-uri-to-path': packageVersion(path.join(repositoryNodeModules, 'file-uri-to-path', 'package.json'))
        },
        optionalExternalModules: ['bufferutil', 'utf-8-validate'],
        preservedModules: ['web-panel.js'],
        metafiles
      },
      entries: RELEASE_ENTRYPOINTS,
      files: fileRecords(outputDir)
    };
    const archivedVerifier = require(path.join(sourceDir, 'scripts', 'verify-browserless-release.js'));
    manifest.artifactDigest = archivedVerifier.calculateArtifactDigest(manifest);
    manifest.releaseId = `${manifest.runtimeRevision}-${manifest.artifactDigest.slice(0, 12)}`;
    writeText(path.join(outputDir, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    chmodDirectoriesReadOnly(outputDir);

    const report = archivedVerifier.verifyRelease(outputDir, {
      requireReadOnly: true,
      requireRuntimeCompatible: true
    });
    return {
      ...report,
      outputDir,
      buildSource: 'git-object-archive',
      sourceCommittedAt,
      archivedSource: keepTemp ? sourceDir : ''
    };
  } catch (error) {
    keepTemp = true;
    error.message = `${error.message} (build workspace preserved at ${tempRoot})`;
    throw error;
  } finally {
    if (!keepTemp) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = await buildRelease(options);
  if (options.json) console.log(JSON.stringify(report));
  else console.log(`Built browserless release ${report.releaseId} from ${report.sourceRevision} at ${report.outputDir}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  RELEASE_ENTRYPOINTS,
  archiveSource,
  buildRelease,
  fileRecords,
  normalizeInput,
  parseArgs,
  resolveSourceRevision
};
