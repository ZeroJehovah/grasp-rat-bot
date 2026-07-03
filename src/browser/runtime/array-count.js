'use strict';

function arrayCount(value) {
  return Array.isArray(value) ? value.length : 0;
}

module.exports = {
  arrayCount
};
