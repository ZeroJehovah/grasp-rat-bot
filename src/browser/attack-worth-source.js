'use strict';

function attackWorthSource() {
  return `const { attackWorthTakingCore } = require('./src/browser/runtime/attack-worth');`;
}

module.exports = {
  attackWorthSource
};
