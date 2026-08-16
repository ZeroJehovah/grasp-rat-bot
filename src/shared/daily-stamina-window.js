'use strict';

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_STAMINA_EXIT_EXEMPT_MS = 60 * 60 * 1000;

function utc8DayStartMs(value = Date.now()) {
  const timeMs = Number(value);
  const nowMs = Number.isFinite(timeMs) ? timeMs : Date.now();
  return Math.floor((nowMs + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS;
}

function dailyStaminaExitExemptAt(value = Date.now()) {
  const timeMs = Number(value);
  const nowMs = Number.isFinite(timeMs) ? timeMs : Date.now();
  const elapsedMs = nowMs - utc8DayStartMs(nowMs);
  return elapsedMs >= 0 && elapsedMs < DAILY_STAMINA_EXIT_EXEMPT_MS;
}

function effectiveLongStaminaExhaustedWindows(windows, value = Date.now()) {
  const source = Array.isArray(windows) ? windows : [];
  if (!dailyStaminaExitExemptAt(value)) return source.slice();
  return source.filter(windowName => String(windowName || '').toLowerCase() !== '1d');
}

module.exports = {
  DAILY_STAMINA_EXIT_EXEMPT_MS,
  dailyStaminaExitExemptAt,
  effectiveLongStaminaExhaustedWindows,
  utc8DayStartMs
};
