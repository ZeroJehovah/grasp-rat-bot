'use strict';

const PLAYER_PROFIT_SCORE_MIN_DROP = 50;
const PLAYER_PROFIT_SCORE_DROP_STEP = 2;
const PLAYER_PROFIT_SCORE_PERCENT_STEP = 1;
const PLAYER_PROFIT_SCORE_MAX_PERCENT = 300;

function playerProfitScoreMultiplierCore(drop) {
  const value = Number(drop);
  if (!Number.isFinite(value) || value < PLAYER_PROFIT_SCORE_MIN_DROP) return 1;
  const completedSteps = Math.floor(
    (value - PLAYER_PROFIT_SCORE_MIN_DROP) / PLAYER_PROFIT_SCORE_DROP_STEP
  );
  const percent = Math.min(
    PLAYER_PROFIT_SCORE_MAX_PERCENT,
    100 + completedSteps * PLAYER_PROFIT_SCORE_PERCENT_STEP
  );
  return percent / 100;
}

module.exports = {
  PLAYER_PROFIT_SCORE_DROP_STEP,
  PLAYER_PROFIT_SCORE_MAX_PERCENT,
  PLAYER_PROFIT_SCORE_MIN_DROP,
  PLAYER_PROFIT_SCORE_PERCENT_STEP,
  playerProfitScoreMultiplierCore
};
