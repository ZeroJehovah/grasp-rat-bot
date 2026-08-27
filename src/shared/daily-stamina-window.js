'use strict';

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_STAMINA_EXIT_EXEMPT_MS = 60 * 60 * 1000;
// The 5s stamina bucket caps any 5000ms window at 10000 milli, so 1d stamina
// cannot drain faster than 2 milli/ms. Keep a 2x margin plus a fixed allowance
// for clock skew and burst accounting.
const MAX_DAILY_STAMINA_SPEND_PER_MS = 4;
const DAILY_STAMINA_SPEND_ALLOWANCE_MS = 60 * 1000;

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

function maxPlausibleDailyStaminaSpentMs(elapsedMs) {
  const elapsed = Number(elapsedMs);
  const bounded = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
  return bounded * MAX_DAILY_STAMINA_SPEND_PER_MS + DAILY_STAMINA_SPEND_ALLOWANCE_MS;
}

// The server refreshes native 1d stamina a short moment after the UTC+8 day
// boundary. A sample taken in that gap still carries the previous day's nearly
// exhausted remaining; seeding the new day's segment with one of them makes the
// refreshed value look like a mid-day death refill. Such a sample is identified
// by a gap larger than the day could physically have consumed so far, so a
// delayed refresh observation or a stale cached self is caught the same way.
function isPreviousDayStaminaCarryover({ remaining, limit, sampleAtMs } = {}) {
  const remainingMs = Number(remaining);
  const limitMs = Number(limit);
  const sampleMs = Number(sampleAtMs);
  if (!Number.isFinite(remainingMs) || !Number.isFinite(limitMs) || !Number.isFinite(sampleMs)) return false;
  if (!(limitMs > 0) || remainingMs >= limitMs) return false;
  const elapsedMs = sampleMs - utc8DayStartMs(sampleMs);
  return limitMs - remainingMs > maxPlausibleDailyStaminaSpentMs(elapsedMs);
}

module.exports = {
  DAILY_STAMINA_EXIT_EXEMPT_MS,
  DAILY_STAMINA_SPEND_ALLOWANCE_MS,
  MAX_DAILY_STAMINA_SPEND_PER_MS,
  dailyStaminaExitExemptAt,
  effectiveLongStaminaExhaustedWindows,
  isPreviousDayStaminaCarryover,
  maxPlausibleDailyStaminaSpentMs,
  utc8DayStartMs
};
