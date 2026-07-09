'use strict';

function normalizeTargetWhitelistName(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .trim();
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

function targetWhitelistNameSet(names = [], maxNames = 100) {
  return new Set(parseTargetWhitelistNames(names, maxNames));
}

function targetIsWhitelisted(target, whitelist = null) {
  if (!target) return false;
  const name = normalizeTargetWhitelistName(target.name);
  if (!name || !whitelist) return false;
  if (typeof whitelist === 'function') return Boolean(whitelist(target));
  if (whitelist instanceof Set) return whitelist.has(name);
  if (Array.isArray(whitelist)) return targetWhitelistNameSet(whitelist).has(name);
  if (whitelist && typeof whitelist === 'object') {
    if (whitelist.nameSet instanceof Set) return whitelist.nameSet.has(name);
    if (Array.isArray(whitelist.names)) return targetWhitelistNameSet(whitelist.names).has(name);
  }
  return false;
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
  targetIsWhitelisted,
  targetWhitelistNameSet,
  deriveTargetWhitelistUrl
};
