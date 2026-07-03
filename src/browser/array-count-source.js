'use strict';

const { arrayCount } = require('./runtime/array-count');

function indentSource(source, spaces) {
  const prefix = ' '.repeat(spaces);
  return String(source).split('\n').map(line => (line ? prefix + line : line)).join('\n');
}

function arrayCountSource() {
  return `\n${indentSource(arrayCount.toString(), 6)}`;
}

module.exports = { arrayCountSource };
