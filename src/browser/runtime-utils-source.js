'use strict';

const {
  safeStringify,
  safeJsonClone,
  sanitizeCombatLogIdPart
} = require('./runtime/runtime-utils');

function runtimeUtilityPreludeSource() {
  return `

      ${safeStringify.toString()}
`;
}

function runtimeUtilityCloneSource() {
  return `

      ${safeJsonClone.toString()}

      ${sanitizeCombatLogIdPart.toString()}

`;
}

module.exports = {
  runtimeUtilityPreludeSource,
  runtimeUtilityCloneSource
};
