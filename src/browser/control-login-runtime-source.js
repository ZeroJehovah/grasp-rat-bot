'use strict';

const { staminaExhaustedWindowLabel } = require('./runtime/exit-summary');
const { controlLoginSource } = require('./control-login-source');

function bundledControlLoginRuntimeSource() {
  return `const { staminaExhaustedWindowLabel } = require('./src/browser/runtime/exit-summary');

${controlLoginSource()}`;
}

function controlLoginRuntimeSource(options = {}) {
  if (options.bundledRuntime) return bundledControlLoginRuntimeSource();
  return controlLoginSource({ staminaExhaustedWindowLabel });
}

module.exports = {
  bundledControlLoginRuntimeSource,
  controlLoginRuntimeSource
};
