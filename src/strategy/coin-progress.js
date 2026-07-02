'use strict';

function coinFailureIgnoreCore(previous = {}, reason = '', nowMs = 0, options = {}) {
  const t = Number(nowMs) || 0;
  const lastAt = Number(previous?.lastAt || 0);
  const decayMs = Number(options.coinFailureDecayMs || 0);
  const count = lastAt && t - lastAt > decayMs ? 1 : Number(previous?.count || 0) + 1;
  const base = reason === 'close' ? options.coinCloseFailureIgnoreMs
    : (reason === 'near' ? options.coinNearFailureIgnoreMs : options.coinNoProgressIgnoreMs);
  const ignoreMs = Math.min(
    Number(options.coinFailureMaxIgnoreMs || 0),
    Math.round(Number(base || 0) * Math.max(1, count))
  );
  const ignoreUntil = t + ignoreMs;
  return { count, reason, lastAt: t, ignoreMs, ignoreUntil };
}

function staleCoinEscapeDirectionCore(action, self, nowMs = 0, options = {}) {
  let awayDx = Math.sign(Number(self?.x) - Number(action?.target?.x)) || -(Number(action?.dx) || 0);
  let awayDy = Math.sign(Number(self?.y) - Number(action?.target?.y)) || -(Number(action?.dy) || 0);
  if (!(awayDx || awayDy)) {
    const phase = Math.floor((Number(nowMs) || 0) / 1000) % 4;
    const pattern = [
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 }
    ][phase];
    awayDx = pattern.dx;
    awayDy = pattern.dy;
  }
  return {
    dx: awayDx,
    dy: awayDy,
    state: {
      id: String(action?.target?.id),
      dx: awayDx,
      dy: awayDy,
      until: (Number(nowMs) || 0) + Number(options.staleCoinEscapeMs || 0)
    }
  };
}

module.exports = {
  coinFailureIgnoreCore,
  staleCoinEscapeDirectionCore
};
