'use strict';

const { staminaExhaustedWindowLabel } = require('../shared/exit-summary');
const { controlLoginSource } = require('./control-login-source');

function controlLoginRuntimeSource() {
  return controlLoginSource({ staminaExhaustedWindowLabel });
}

module.exports = { controlLoginRuntimeSource };
