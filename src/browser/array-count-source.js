'use strict';

const { arrayCount } = require('./runtime/array-count');

function indentSource(source, spaces) {
  const prefix = ' '.repeat(spaces);
  return String(source).split('\n').map(line => (line ? prefix + line : line)).join('\n');
}

function bundledArrayCountSource() {
  return "\n      const { arrayCount } = require('./src/browser/runtime/array-count');";
}

function arrayCountSource(options = {}) {
  if (options.bundledRuntime) return bundledArrayCountSource();
  return `\n${indentSource(arrayCount.toString(), 6)}`;
}

module.exports = { arrayCountSource };
