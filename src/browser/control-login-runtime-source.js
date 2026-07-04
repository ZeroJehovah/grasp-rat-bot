'use strict';

const { controlLoginSource } = require('./control-login-source');

function controlLoginRuntimeSource() {
  return controlLoginSource();
}

module.exports = {
  controlLoginRuntimeSource
};
