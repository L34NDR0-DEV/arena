'use strict';
const db = require('./db');

const SKIN_PRICE       = 500;
const FREE_SKIN_ID     = 6; // Shadow Roxa — única skin gratuita
const REWARD_BLOCK_SIZE = 5;
const REWARD_AMOUNT     = 10;
const REWARD_MIN_MODES  = 2;

// Máquina de estados: a cada bloco de REWARD_BLOCK_SIZE partidas concluídas
// (vitória/sobrevivência, não-derrota) que cubram pelo menos REWARD_MIN_MODES
// modos diferentes, concede REWARD_AMOUNT créditos. O contador sempre reinicia
// ao completar um bloco de REWARD_BLOCK_SIZE, premiando ou não.
function recordMatchAndMaybeReward(userId, { mode, win }) {
  const user = db.findUserById.get(userId);
  let count = user.reward_progress_count;
  let modes = JSON.parse(user.reward_modes_seen || '[]');
  let rewardGranted = false;

  if (win) {
    count += 1;
    if (!modes.includes(mode)) modes.push(mode);

    if (count >= REWARD_BLOCK_SIZE) {
      if (modes.length >= REWARD_MIN_MODES) {
        db.addCredits.run(REWARD_AMOUNT, userId);
        rewardGranted = true;
      }
      count = 0;
      modes = [];
    }
  }

  db.setRewardState.run(count, JSON.stringify(modes), userId);
  return { rewardGranted, progress: count, modesSeen: modes };
}

module.exports = { SKIN_PRICE, FREE_SKIN_ID, REWARD_BLOCK_SIZE, REWARD_AMOUNT, REWARD_MIN_MODES, recordMatchAndMaybeReward };
