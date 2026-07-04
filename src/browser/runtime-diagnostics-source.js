'use strict';

function runtimeDiagnosticsSource() {
  return "const { recordRuntimeDiagnosticsCore } = require('./src/browser/runtime/runtime-diagnostics');";
}

module.exports = {
  runtimeDiagnosticsSource
};
