'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

let cachedRevision;
let lastResolutionError = '';

function browserlessRuntimeRevision(options = {}) {
  const explicit = String(options.runtimeRevision || process.env.GRASP_RAT_BROWSERLESS_REVISION || '').trim();
  if (explicit) {
    cachedRevision = explicit;
    lastResolutionError = '';
    return explicit;
  }
  if (cachedRevision !== undefined) return cachedRevision;
  try {
    cachedRevision = String(execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000
    })).trim();
    lastResolutionError = '';
  } catch (err) {
    // Do not cache a transient failure. A later canary run in the same long-lived
    // supervisor must be allowed to resolve the deployed revision again.
    lastResolutionError = String(err?.message || err || 'git revision lookup failed').slice(0, 300);
    return 'unknown';
  }
  return cachedRevision || 'unknown';
}

function browserlessRuntimeRevisionStatus() {
  return {
    revision: cachedRevision || 'unknown',
    error: lastResolutionError
  };
}

module.exports = { browserlessRuntimeRevision, browserlessRuntimeRevisionStatus };
