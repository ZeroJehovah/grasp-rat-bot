'use strict';

function patrolSource() {
  return `const { patrolDirectionCore } = require('./src/browser/runtime/patrol');`;
}

module.exports = {
  patrolSource
};
