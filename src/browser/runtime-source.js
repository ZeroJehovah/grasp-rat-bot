'use strict';

const { browserRuntimeFragments } = require('./runtime-fragments-source');

function browserRuntimeConfig(options = {}) {
  const config = {
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

function browserRuntimeSource(options = {}) {
  return renderRuntimeFragments(browserRuntimeFragments(browserRuntimeConfig(options)));
}

function remoteBrowserRuntimeSource(options = {}) {
  return browserRuntimeSource({
    dryRun: false,
    once: false,
    statusEvery: options.statusEvery,
    version: options.version
  });
}

module.exports = {
  browserRuntimeConfig,
  browserRuntimeSource,
  remoteBrowserRuntimeSource,
  renderRuntimeFragment,
  renderRuntimeFragments
};

function renderRuntimeFragment(fragment) {
  const source = fragment && typeof fragment === 'object' && Object.prototype.hasOwnProperty.call(fragment, 'source')
    ? fragment.source
    : fragment;
  return typeof source === 'function' ? source() : source;
}

function renderRuntimeFragments(fragments) {
  return fragments.map(renderRuntimeFragment).join('');
}
