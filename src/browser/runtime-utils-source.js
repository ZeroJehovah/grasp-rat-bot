'use strict';

const {
  safeStringify,
  safeJsonClone,
  sanitizeCombatLogIdPart
} = require('./runtime/runtime-utils');

function bundledRuntimeUtilityPreludeSource() {
  return "\n\n      const { safeStringify, safeJsonClone, sanitizeCombatLogIdPart } = require('./src/browser/runtime/runtime-utils');\n";
}

function runtimeUtilityPreludeSource(options = {}) {
  if (options.bundledRuntime) return bundledRuntimeUtilityPreludeSource();
  return `

      ${safeStringify.toString()}
`;
}

function runtimeUtilityCloneSource(options = {}) {
  if (options.bundledRuntime) {
    return `

`;
  }
  return `

      ${safeJsonClone.toString()}

      ${sanitizeCombatLogIdPart.toString()}

`;
}

module.exports = {
  runtimeUtilityPreludeSource,
  runtimeUtilityCloneSource
};
