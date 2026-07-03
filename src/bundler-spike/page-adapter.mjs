'use strict';

const EMPTY_OBJECT = Object.freeze({});

function asObject(value, fallback = EMPTY_OBJECT) {
  if (value && (typeof value === 'object' || typeof value === 'function')) return value;
  return fallback;
}

function resolvePageGlobal(fallback = EMPTY_OBJECT) {
  if (typeof window !== 'undefined' && asObject(window, null)) return window;
  if (typeof globalThis !== 'undefined' && asObject(globalThis, null)) return globalThis;
  return asObject(fallback);
}

function readPageGlobal(key, fallback = undefined, root = resolvePageGlobal()) {
  if (typeof key !== 'string' || key.length === 0) return fallback;
  const source = asObject(root);
  if (!Object.prototype.hasOwnProperty.call(source, key)) return fallback;
  return source[key];
}

function installPageGlobal(key, value, root = resolvePageGlobal()) {
  if (typeof key !== 'string' || key.length === 0) return false;
  const target = asObject(root, null);
  if (!target) return false;
  target[key] = value;
  return true;
}

function readPageLocalStorageJson(key, fallback = null, root = resolvePageGlobal()) {
  if (typeof key !== 'string' || key.length === 0) return fallback;
  const source = asObject(root, null);
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

export {
  resolvePageGlobal,
  readPageGlobal,
  installPageGlobal,
  readPageLocalStorageJson
};
