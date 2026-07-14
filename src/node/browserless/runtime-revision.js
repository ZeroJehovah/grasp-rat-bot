'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let cachedRevision;
let lastResolutionError = '';
let lastResolutionSource = '';

function repositoryGitDir(root) {
  const dotGit = path.join(root, '.git');
  const stat = fs.statSync(dotGit);
  if (stat.isDirectory()) return dotGit;
  const pointer = fs.readFileSync(dotGit, 'utf8').trim();
  const match = pointer.match(/^gitdir:\s*(.+)$/i);
  if (!match) throw new Error('unsupported .git pointer');
  return path.resolve(root, match[1]);
}

function revisionFromGitMetadata(root) {
  const gitDir = repositoryGitDir(root);
  const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
  if (/^[0-9a-f]{12,40}$/i.test(head)) return head.slice(0, 12);
  const match = head.match(/^ref:\s*(.+)$/i);
  if (!match) throw new Error('unsupported Git HEAD format');
  const ref = match[1].trim();
  try {
    const value = fs.readFileSync(path.join(gitDir, ref), 'utf8').trim();
    if (/^[0-9a-f]{12,40}$/i.test(value)) return value.slice(0, 12);
  } catch (_) {}
  const packed = fs.readFileSync(path.join(gitDir, 'packed-refs'), 'utf8');
  for (const line of packed.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || line.startsWith('^')) continue;
    const [hash, packedRef] = line.trim().split(/\s+/, 2);
    if (packedRef === ref && /^[0-9a-f]{12,40}$/i.test(hash)) return hash.slice(0, 12);
  }
  throw new Error(`Git ref not found: ${ref}`);
}

function resolveRepositoryRevision(options = {}) {
  const root = path.resolve(options.root || path.resolve(__dirname, '../../..'));
  try {
    return { revision: revisionFromGitMetadata(root), source: 'git-metadata', error: '' };
  } catch (metadataError) {
    try {
      const revision = String(execFileSync('git', [
        '-c', `safe.directory=${root}`,
        'rev-parse', '--short=12', 'HEAD'
      ], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 2000
      })).trim();
      return { revision, source: 'git-command', error: '' };
    } catch (gitError) {
      return {
        revision: 'unknown',
        source: 'unresolved',
        error: `${metadataError?.message || metadataError}; ${gitError?.message || gitError}`.slice(0, 300)
      };
    }
  }
}

function browserlessRuntimeRevision(options = {}) {
  const explicit = String(options.runtimeRevision || process.env.GRASP_RAT_BROWSERLESS_REVISION || '').trim();
  if (explicit) {
    cachedRevision = explicit;
    lastResolutionError = '';
    lastResolutionSource = options.runtimeRevision ? 'explicit-option' : 'environment';
    return explicit;
  }
  if (cachedRevision !== undefined) return cachedRevision;
  const resolved = resolveRepositoryRevision(options);
  if (resolved.revision === 'unknown') {
    // Do not cache a transient failure. A later canary run in the same long-lived
    // supervisor must be allowed to resolve the deployed revision again.
    lastResolutionError = resolved.error;
    lastResolutionSource = resolved.source;
    return 'unknown';
  }
  cachedRevision = resolved.revision;
  lastResolutionError = '';
  lastResolutionSource = resolved.source;
  return cachedRevision || 'unknown';
}

function browserlessRuntimeRevisionStatus() {
  return {
    revision: cachedRevision || 'unknown',
    source: lastResolutionSource || 'unresolved',
    error: lastResolutionError
  };
}

module.exports = {
  browserlessRuntimeRevision,
  browserlessRuntimeRevisionStatus,
  resolveRepositoryRevision,
  revisionFromGitMetadata
};
