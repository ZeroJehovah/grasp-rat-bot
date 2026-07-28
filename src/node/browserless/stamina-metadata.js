'use strict';

const STAMINA_REMAINING_FIELDS = {
  '5s': [
    'stamina_5s_remaining_milli',
    'stamina_5s_remaining_ms',
    'stamina5sRemainingMilli',
    'stamina5sRemainingMs',
    'stamina5s',
    'stamina_5s',
    'stamina_remaining_ms',
    'staminaRemainingMs',
    'stamina'
  ],
  '1h': [
    'stamina_1h_remaining_milli',
    'stamina_1h_remaining_ms',
    'stamina1hRemainingMilli',
    'stamina1hRemainingMs',
    'stamina1h',
    'stamina_1h'
  ],
  '1d': [
    'stamina_1d_remaining_milli',
    'stamina_1d_remaining_ms',
    'stamina1dRemainingMilli',
    'stamina1dRemainingMs',
    'stamina1d',
    'stamina_1d'
  ]
};

const STAMINA_LIMIT_FIELDS = {
  '5s': [
    'stamina_5s_limit_milli',
    'stamina_5s_limit_ms',
    'stamina5sLimitMilli',
    'stamina5sLimitMs',
    'stamina5sLimit',
    'stamina_5s_limit',
    'stamina_limit_ms',
    'staminaLimitMs',
    'staminaLimit'
  ],
  '1h': [
    'stamina_1h_limit_milli',
    'stamina_1h_limit_ms',
    'stamina1hLimitMilli',
    'stamina1hLimitMs',
    'stamina1hLimit',
    'stamina_1h_limit'
  ],
  '1d': [
    'stamina_1d_limit_milli',
    'stamina_1d_limit_ms',
    'stamina1dLimitMilli',
    'stamina1dLimitMs',
    'stamina1dLimit',
    'stamina_1d_limit'
  ]
};

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumberFromFields(source, fields) {
  if (!source || typeof source !== 'object') return null;
  for (const field of fields || []) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const value = numberOrNull(source[field]);
    if (value !== null) return value;
  }
  return null;
}

function staminaRemainingValue(entity, windowName) {
  return firstNumberFromFields(entity, STAMINA_REMAINING_FIELDS[windowName] || []);
}

function staminaLimitForWindow(entity, windowName) {
  return firstNumberFromFields(entity, STAMINA_LIMIT_FIELDS[windowName] || []);
}

function summarizeStaminaWindow(entity, windowName, options = {}) {
  const remaining = staminaRemainingValue(entity, windowName);
  const explicitLimit = staminaLimitForWindow(entity, windowName);
  const defaultLimit = numberOrNull(options.defaultLimit);
  const limit = explicitLimit !== null
    ? explicitLimit
    : (defaultLimit !== null && defaultLimit > 0 ? defaultLimit : null);
  const fullRatio = Math.max(0, Number(options.staminaFullRatio ?? options.fullRatio ?? 0.98) || 0.98);
  const known = remaining !== null;
  const full = Boolean(known && limit !== null && limit > 0 && remaining >= limit * fullRatio);
  return {
    remaining,
    limit,
    known,
    full,
    fullRatio
  };
}

function hasFull5sStamina(entity, options = {}) {
  const remaining = staminaRemainingValue(entity, '5s');
  if (remaining === null) return false;
  const explicitLimit = staminaLimitForWindow(entity, '5s');
  const defaultLimit = numberOrNull(options.defaultLimit ?? 10000);
  const limit = explicitLimit !== null
    ? explicitLimit
    : (defaultLimit !== null && defaultLimit > 0 ? defaultLimit : null);
  if (limit === null || limit <= 0) return false;
  const fullRatio = Math.max(0, Number(options.staminaFullRatio ?? options.fullRatio ?? 0.98) || 0.98);
  return remaining >= limit * fullRatio;
}

module.exports = {
  hasFull5sStamina,
  staminaLimitForWindow,
  staminaRemainingValue,
  summarizeStaminaWindow
};
