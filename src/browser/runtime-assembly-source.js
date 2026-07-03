'use strict';

const { browserRuntimeFragments } = require('./runtime-fragments-source');

function renderRuntimeFragments(fragments) {
  return fragments.map(fragment => (typeof fragment === 'function' ? fragment() : fragment)).join('');
}

function browserRuntimeAssemblySource(config) {
  return renderRuntimeFragments(browserRuntimeFragments(config));
}

module.exports = {
  browserRuntimeAssemblySource
};
