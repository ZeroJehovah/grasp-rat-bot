'use strict';

const { staminaExhaustedWindowLabel } = require('./runtime/exit-summary');
const { controlLoginSource } = require('./control-login-source');

function controlLoginRuntimeSource() {
  return controlLoginSource({ staminaExhaustedWindowLabel });
}

module.exports = { controlLoginRuntimeSource };
