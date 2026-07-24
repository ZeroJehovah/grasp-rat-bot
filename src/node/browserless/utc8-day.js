'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

function utc8DayKey(ms = Date.now()) {
  return new Date(Number(ms) + UTC8_OFFSET_MS).toISOString().slice(0, 10);
}

function utc8DayStartMs(ms = Date.now()) {
  return Math.floor((Number(ms) + UTC8_OFFSET_MS) / DAY_MS) * DAY_MS - UTC8_OFFSET_MS;
}

module.exports = {
  DAY_MS,
  UTC8_OFFSET_MS,
  utc8DayKey,
  utc8DayStartMs
};
