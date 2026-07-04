'use strict';

function runtimeUtilityPreludeSource() {
  return "\n\n      const { safeStringify, safeJsonClone, sanitizeCombatLogIdPart } = require('./src/browser/runtime/runtime-utils');\n";
}

module.exports = {
  runtimeUtilityPreludeSource
};
