'use strict';

function runtimeDiagnosticsSource() {
  return String.raw`
  function recordRuntimeDiagnostics(values = {}) {
    try {
      if (!bot.runtimeDiagnostics || typeof bot.runtimeDiagnostics !== 'object') bot.runtimeDiagnostics = {};
      Object.assign(bot.runtimeDiagnostics, values);
    } catch (_) {}
  }`;
}

module.exports = { runtimeDiagnosticsSource };
