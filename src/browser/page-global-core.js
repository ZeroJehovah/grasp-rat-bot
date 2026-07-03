'use strict';

function pageGlobalObject(value) {
  return value && (typeof value === 'object' || typeof value === 'function')
    ? value
    : null;
}

function resolvePageGlobal(fallback = {}) {
  if (typeof window !== 'undefined' && pageGlobalObject(window)) return window;
  if (typeof globalThis !== 'undefined' && pageGlobalObject(globalThis)) return globalThis;
  return pageGlobalObject(fallback) || {};
}

function readPageGlobal(key, fallback = undefined, root = resolvePageGlobal()) {
  if (typeof key !== 'string' || key.length === 0) return fallback;
  const source = pageGlobalObject(root) || resolvePageGlobal();
  if (!Object.prototype.hasOwnProperty.call(source, key)) return fallback;
  return source[key];
}

function installPageGlobal(key, value, root = resolvePageGlobal()) {
  if (typeof key !== 'string' || key.length === 0) return false;
  const target = pageGlobalObject(root) || resolvePageGlobal();
  if (!target) return false;
  target[key] = value;
  return true;
}

function readPageLocalStorageJson(key, fallback = null, root = resolvePageGlobal()) {
  if (typeof key !== 'string' || key.length === 0) return fallback;
  const source = pageGlobalObject(root) || resolvePageGlobal();
  const storage = source && source.localStorage;
  if (!storage || typeof storage.getItem !== 'function') return fallback;
  let raw;
  try {
    raw = storage.getItem(key);
  } catch (err) {
    return fallback;
  }
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function browserPageGlobalSource() {
  return [
    pageGlobalObject.toString(),
    resolvePageGlobal.toString(),
    readPageGlobal.toString(),
    installPageGlobal.toString(),
    readPageLocalStorageJson.toString()
  ].join('\n\n');
}

module.exports = {
  pageGlobalObject,
  resolvePageGlobal,
  readPageGlobal,
  installPageGlobal,
  readPageLocalStorageJson,
  browserPageGlobalSource
};
