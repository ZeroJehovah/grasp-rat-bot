'use strict';

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function truthyFlag(value) {
  if (value === true) return true;
  if (typeof value === 'string') return /^(?:1|true|yes)$/i.test(value.trim());
  return false;
}

function responseStatus(value) {
  const status = Number(value?.status ?? value?.statusCode ?? NaN);
  return Number.isFinite(status) ? status : 0;
}

function responseExplicitlyFailed(value) {
  if (!isObject(value)) return false;
  const status = responseStatus(value);
  return value.ok === false
    || value.success === false
    || status >= 400
    || Boolean(value.error && value.ok !== true && value.success !== true);
}

function leaveResponseConfirmsExitCore(value) {
  if (!isObject(value)) return false;
  if (responseExplicitlyFailed(value)) return false;
  if (truthyFlag(value.leaveConfirmed) || truthyFlag(value.exitConfirmed)) return true;
  if (isObject(value.result) && leaveResponseConfirmsExitCore(value.result)) return true;
  if (isObject(value.response) && leaveResponseConfirmsExitCore(value.response)) return true;

  const event = stringValue(value.event || value.type || value.action).trim().toLowerCase();
  if (/^(?:left|leave|user-left|left-user)$/.test(event)) return true;
  if (truthyFlag(value.left)) return true;

  const joined = stringValue(value.joined || value.joinState || value.join_state).trim().toLowerCase();
  const mode = stringValue(value.current_join_mode || value.currentJoinMode || value.joinMode || value.join_mode).trim().toLowerCase();
  const responseOk = value.ok === true || value.success === true;
  return Boolean(responseOk && joined === 'userrecordonly' && mode === 'none');
}

function summarizeLeaveResponseCore(value) {
  if (!isObject(value)) return {};
  const out = {
    leaveConfirmed: leaveResponseConfirmsExitCore(value)
  };
  const copyString = (key, sourceKey = key) => {
    if (value[sourceKey] !== undefined && value[sourceKey] !== null) out[key] = stringValue(value[sourceKey]).slice(0, 80);
  };
  const copyRaw = key => {
    if (value[key] !== undefined && value[key] !== null) out[key] = value[key];
  };
  copyRaw('ok');
  copyRaw('success');
  copyString('event');
  copyRaw('left');
  copyString('joined');
  copyString('current_join_mode');
  copyString('life');
  copyString('visible');
  return out;
}

module.exports = {
  leaveResponseConfirmsExitCore,
  summarizeLeaveResponseCore
};
