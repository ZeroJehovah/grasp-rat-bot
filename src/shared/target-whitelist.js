'use strict';

function normalizeTargetWhitelistName(value) {
  return String(value ?? '').trim();
}

function parseTargetWhitelistNames(payload, maxNames = 100) {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.names)
      ? payload.names
      : Array.isArray(payload?.usernames)
        ? payload.usernames
        : [];
  const limit = Math.max(0, Math.round(Number(maxNames) || 0));
  const names = [];
  const seen = new Set();
  for (const item of raw) {
    const name = normalizeTargetWhitelistName(item);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (limit && names.length >= limit) break;
  }
  return names;
}

function deriveTargetWhitelistUrl(sourceUrl, configuredUrl = '') {
  const explicit = String(configuredUrl || '').trim();
  if (explicit) return explicit;
  const source = String(sourceUrl || '').trim();
  if (!source) return '';
  try {
    const url = new URL(source);
    url.pathname = url.pathname.replace(/[^/]*$/, 'target-whitelist.json');
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch (_) {
    return source.replace(/[^/?#]*([?#].*)?$/, 'target-whitelist.json');
  }
}

module.exports = {
  normalizeTargetWhitelistName,
  parseTargetWhitelistNames,
  deriveTargetWhitelistUrl
};
