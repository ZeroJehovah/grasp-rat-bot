'use strict';

function runtimeUtilityPreludeSource() {
  return "\n\n      const { safeStringify, safeJsonClone, sanitizeCombatLogIdPart } = require('./src/browser/runtime/runtime-utils');\n      const { arrayCount } = require('./src/browser/runtime/array-count');\n";
}

module.exports = {
  runtimeUtilityPreludeSource
};
