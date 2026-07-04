'use strict';

const {
  browserRuntimeFragmentEntries
} = require('./runtime-fragment-registry');

function runtimeFragment(name, source) {
  if (typeof name !== 'string' || !name) {
    throw new TypeError('runtime fragment name must be a non-empty string');
  }
  if (source === undefined || source === null) {
    throw new TypeError(`runtime fragment ${name} source is required`);
  }
  return { name, source };
}

function materializeRuntimeFragments(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError('runtime fragment entries must be an array');
  }
  return entries.map(([name, source]) => runtimeFragment(name, source));
}

function browserRuntimeFragments(config) {
  return materializeRuntimeFragments(browserRuntimeFragmentEntries(config));
}

module.exports = {
  runtimeFragment,
  materializeRuntimeFragments,
  browserRuntimeFragmentEntries,
  browserRuntimeFragments
};
