'use strict';

function safeStringify(value) {
  const seen = new WeakSet();
  try {
    const text = JSON.stringify(value, function (_key, item) {
      if (typeof item === 'bigint') return String(item);
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    });
    return String(text || '');
  } catch (err) {
    try {
      return JSON.stringify({ error: err?.message || String(err) });
    } catch (_) {
      return '{"error":"stringify failed"}';
    }
  }
}

function safeJsonClone(value) {
  try {
    return JSON.parse(safeStringify(value));
  } catch (_) {
    return null;
  }
}

function sanitizeCombatLogIdPart(value, fallback = 'unknown') {
  const text = String(value || fallback)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return text || fallback;
}

module.exports = {
  safeStringify,
  safeJsonClone,
  sanitizeCombatLogIdPart
};
