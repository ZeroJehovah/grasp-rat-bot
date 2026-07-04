'use strict';

function runtimeUtilityPreludeSource() {
  return "\n\n      const { safeStringify, safeJsonClone, sanitizeCombatLogIdPart } = require('./src/browser/runtime/runtime-utils');\n";
}

function runtimeUtilityCloneSource() {
  return `\n\n`;
}

module.exports = {
  runtimeUtilityPreludeSource,
  runtimeUtilityCloneSource
};
