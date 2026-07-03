'use strict';

function recordRuntimeDiagnosticsCore(bot, values = {}) {
  try {
    if (!bot.runtimeDiagnostics || typeof bot.runtimeDiagnostics !== 'object') bot.runtimeDiagnostics = {};
    Object.assign(bot.runtimeDiagnostics, values);
  } catch (_) {}
}

module.exports = { recordRuntimeDiagnosticsCore };
