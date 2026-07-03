'use strict';

const { browserBotSource } = require('./bot-source');

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
  return browserBotSource(browserRuntimeConfig(options));
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
  remoteBrowserRuntimeSource
};
