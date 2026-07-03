'use strict';

function clearPersistentStorageKey(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  clearPersistentStorageKey
};
