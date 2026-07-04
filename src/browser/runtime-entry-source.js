'use strict';

const {
  browserRuntimeSource,
  remoteBrowserRuntimeSource
} = require('./runtime-source');

function remoteRuntimeEntrySource(options = {}) {
  return remoteBrowserRuntimeSource(options);
}

function runtimeEvalEntrySource(options = {}) {
  const directSource = browserRuntimeSource({
    ...options,
    bundledRuntime: true
  });
  return `export default ${directSource};`;
}

module.exports = {
  remoteRuntimeEntrySource,
  runtimeEvalEntrySource
};
