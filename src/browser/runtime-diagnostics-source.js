'use strict';

function runtimeDiagnosticsInlineSource() {
  return String.raw`
  function recordRuntimeDiagnostics(values = {}) {
    try {
      if (!bot.runtimeDiagnostics || typeof bot.runtimeDiagnostics !== 'object') bot.runtimeDiagnostics = {};
      Object.assign(bot.runtimeDiagnostics, values);
    } catch (_) {}
  }`;
}

function bundledRuntimeDiagnosticsSource() {
  return `const { recordRuntimeDiagnosticsCore } = require('./src/browser/runtime/runtime-diagnostics');

  function recordRuntimeDiagnostics(values = {}) {
    return recordRuntimeDiagnosticsCore(bot, values);
  }`;
}

function runtimeDiagnosticsSource(options = {}) {
  if (options.bundledRuntime) return bundledRuntimeDiagnosticsSource();
  return runtimeDiagnosticsInlineSource();
}

module.exports = {
  runtimeDiagnosticsInlineSource,
  bundledRuntimeDiagnosticsSource,
  runtimeDiagnosticsSource
};
