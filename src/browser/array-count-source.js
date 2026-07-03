'use strict';

function arrayCountSource() {
  return String.raw`
      function arrayCount(value) {
        return Array.isArray(value) ? value.length : 0;
      }`;
}

module.exports = { arrayCountSource };
