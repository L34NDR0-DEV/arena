'use strict';
const db = require('./db');

const SKIN_PRICE       = 500;
const FREE_SKIN_ID     = 6; // Shadow Roxa — única skin gratuita

// Promoção por tempo limitado: Ponta BR (id 1) e Alien Disc (id 5) saem por
// metade do preço durante 10 dias — mas o piloto só pode aproveitar a oferta
// em UMA das duas (escolha exclusiva, para incentivar a decisão rápida).
const PROMO_SKIN_IDS   = [1, 5];
const PROMO_PRICE      = 250;
const PROMO_STARTS_AT  = Date.parse('2026-06-07T00:00:00Z');
const PROMO_ENDS_AT    = PROMO_STARTS_AT + 10 * 24 * 60 * 60 * 1000;

function isPromoActive(now = Date.now()) {
  return now >= PROMO_STARTS_AT && now < PROMO_ENDS_AT;
}

// Preço efetivo de uma skin para um usuário: aplica o preço promocional
// somente se a skin está na promoção, a janela está ativa, e o usuário ainda
// não possui a outra skin do par (a oferta vale para uma única escolha).
function skinPriceFor(skinId, ownedSkinIds) {
  if (PROMO_SKIN_IDS.includes(skinId) && isPromoActive()) {
    const otherId = PROMO_SKIN_IDS.find(id => id !== skinId);
    if (!ownedSkinIds.includes(otherId)) return PROMO_PRICE;
  }
  return SKIN_PRICE;
}
const REWARD_BLOCK_SIZE = 5;
const REWARD_AMOUNT     = 10;
const REWARD_MIN_MODES  = 2;

// Antifraude: limite generoso de partidas vencidas contabilizáveis para a
// recompensa por hora. Jogadores legítimos dificilmente chegam perto disso —
// serve para barrar scripts/automação tentando forçar créditos em loop.
const REWARD_HOUR_WINDOW_MS = 60 * 60 * 1000;
const REWARD_HOUR_MAX       = 30;

// Máquina de estados: a cada bloco de REWARD_BLOCK_SIZE partidas concluídas
// (vitória/sobrevivência, não-derrota) que cubram pelo menos REWARD_MIN_MODES
// modos diferentes, concede REWARD_AMOUNT créditos. O contador sempre reinicia
// ao completar um bloco de REWARD_BLOCK_SIZE, premiando ou não.
function recordMatchAndMaybeReward(userId, { mode, win }) {
  const user = db.findUserById.get(userId);
  let count = user.reward_progress_count;
  let modes = JSON.parse(user.reward_modes_seen || '[]');
  let rewardGranted = false;

  // Janela de controle horário — reseta quando expira.
  const now = Date.now();
  let hourCount = user.reward_hour_count || 0;
  let hourStarted = user.reward_hour_started ? Date.parse(user.reward_hour_started + 'Z') : null;
  if (!hourStarted || (now - hourStarted) > REWARD_HOUR_WINDOW_MS) {
    hourCount = 0;
    hourStarted = now;
  }

  if (win) {
    const overHourLimit = hourCount >= REWARD_HOUR_MAX;
    if (overHourLimit) {
      console.warn(`[ANTIFRAUDE] usuário ${userId} atingiu o limite horário de partidas para recompensa (${REWARD_HOUR_MAX}/h)`);
    } else {
      hourCount += 1;
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
  }

  db.setRewardState.run(count, JSON.stringify(modes), userId);
  db.setRewardHourState.run(hourCount, new Date(hourStarted).toISOString().slice(0, 19).replace('T', ' '), userId);
  return { rewardGranted, progress: count, modesSeen: modes };
}

module.exports = {
  SKIN_PRICE, FREE_SKIN_ID, REWARD_BLOCK_SIZE, REWARD_AMOUNT, REWARD_MIN_MODES, recordMatchAndMaybeReward,
  PROMO_SKIN_IDS, PROMO_PRICE, PROMO_STARTS_AT, PROMO_ENDS_AT, isPromoActive, skinPriceFor,
};
