'use strict';

const { browserRuntimeFragmentEntries } = require('./runtime-fragment-registry');

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

function browserRuntimeSource(options = {}) {
  return wrapBrowserRuntimeIife(browserRuntimeBodySource(options));
}

function browserRuntimeBodySource(options = {}) {
  return renderRuntimeFragments(browserRuntimeFragments(browserRuntimeConfig(options)));
}

function runtimeFragment(name, source) {
  if (typeof name !== 'string' || !name) {
    throw new TypeError('runtime fragment name must be a non-empty string');
  }
  if (source === undefined || source === null) {
    throw new TypeError(`runtime fragment ${name} source is required`);
  }
  return { name, source };
}

function materializeRuntimeFragments(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('runtime fragment entries must be an array');
  }
  return entries.map(([name, source]) => runtimeFragment(name, source));
}

function browserRuntimeFragments(config) {
  return materializeRuntimeFragments(browserRuntimeFragmentEntries(config));
}

function remoteBrowserRuntimeSource(options = {}) {
  return browserRuntimeSource({
    dryRun: false,
    once: false,
    statusEvery: options.statusEvery,
    version: options.version,
    bundledRuntime: true
  });
}

module.exports = {
  browserRuntimeConfig,
  browserRuntimeBodySource,
  browserRuntimeSource,
  browserRuntimeFragments,
  materializeRuntimeFragments,
  remoteBrowserRuntimeSource,
  renderRuntimeFragment,
  renderRuntimeFragments,
  runtimeFragment,
  wrapBrowserRuntimeIife
};

function wrapBrowserRuntimeIife(source) {
  return `
(() => {${source}
	})()
`;
}

function renderRuntimeFragment(fragment) {
  if (!fragment || typeof fragment !== 'object' || typeof fragment.name !== 'string' || !fragment.name || !Object.prototype.hasOwnProperty.call(fragment, 'source')) {
    throw new TypeError('runtime fragment must be a named object with source');
  }
  const source = fragment.source;
  return typeof source === 'function' ? source() : source;
}

function renderRuntimeFragments(fragments) {
  if (!Array.isArray(fragments)) {
    throw new TypeError('runtime fragments must be an array');
  }
  return fragments.map(renderRuntimeFragment).join('\n\n');
}
