'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

let cachedRevision;

function browserlessRuntimeRevision(options = {}) {
  const explicit = String(options.runtimeRevision || process.env.GRASP_RAT_BROWSERLESS_REVISION || '').trim();
  if (explicit) return explicit;
  if (cachedRevision !== undefined) return cachedRevision;
  try {
    cachedRevision = String(execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000
    })).trim();
  } catch (_) {
    cachedRevision = 'unknown';
  }
  return cachedRevision;
}

module.exports = { browserlessRuntimeRevision };
