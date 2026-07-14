'use strict';

function normalizeTargetWhitelistName(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .trim();
}

function normalizeTargetWhitelistUserId(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return '';
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? String(number) : '';
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

function parseTargetWhitelistUserIds(payload, maxUserIds = 100) {
  const raw = Array.isArray(payload?.userIds)
    ? payload.userIds
    : Array.isArray(payload?.user_ids)
      ? payload.user_ids
      : Array.isArray(payload?.ids)
        ? payload.ids
        : [];
  const limit = Math.max(0, Math.round(Number(maxUserIds) || 0));
  const userIds = [];
  const seen = new Set();
  for (const item of raw) {
    const userId = normalizeTargetWhitelistUserId(item);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    userIds.push(Number(userId));
    if (limit && userIds.length >= limit) break;
  }
  return userIds;
}

function targetWhitelistUserIdSet(userIds = [], maxUserIds = 100) {
  return new Set(parseTargetWhitelistUserIds({ userIds }, maxUserIds).map(String));
}

function targetWhitelistUserId(target) {
  return normalizeTargetWhitelistUserId(
    target?.userId
      ?? target?.user_id
      ?? target?.targetUserId
      ?? target?.target_user_id
  );
}

function targetIsWhitelisted(target, whitelist = null) {
  if (!target || !whitelist) return false;
  if (typeof whitelist === 'function') return Boolean(whitelist(target));
  const name = normalizeTargetWhitelistName(target.name);
  const userId = targetWhitelistUserId(target);
  if (whitelist instanceof Set) return whitelist.has(name);
  if (Array.isArray(whitelist)) return targetWhitelistNameSet(whitelist).has(name);
  if (whitelist && typeof whitelist === 'object') {
    if (userId && whitelist.userIdSet instanceof Set
      && (whitelist.userIdSet.has(userId) || whitelist.userIdSet.has(Number(userId)))) return true;
    if (userId && Array.isArray(whitelist.userIds) && targetWhitelistUserIdSet(whitelist.userIds).has(userId)) return true;
    if (name && whitelist.nameSet instanceof Set && whitelist.nameSet.has(name)) return true;
    if (name && Array.isArray(whitelist.names) && targetWhitelistNameSet(whitelist.names).has(name)) return true;
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
  normalizeTargetWhitelistUserId,
  parseTargetWhitelistNames,
  parseTargetWhitelistUserIds,
  targetIsWhitelisted,
  targetWhitelistNameSet,
  targetWhitelistUserIdSet,
  deriveTargetWhitelistUrl
};
