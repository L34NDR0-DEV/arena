'use strict';
const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const SKIN_PRICE       = 500;
const FREE_SKIN_ID     = 6; // Shadow Roxa — única skin gratuita

// Promoção padrão de código — pode ser sobrescrita pelo admin via shop-config.json
let PROMO_SKIN_IDS  = [1, 5];
let PROMO_PRICE     = 250;
let PROMO_STARTS_AT = Date.parse('2026-06-07T00:00:00Z');
let PROMO_ENDS_AT   = PROMO_STARTS_AT + 10 * 24 * 60 * 60 * 1000;

// Preços customizados pelo admin (sobrescrevem CUSTOM_SKIN_PRICES)
let _adminPrices = {};

function isPromoActive(now = Date.now()) {
  return now >= PROMO_STARTS_AT && now < PROMO_ENDS_AT;
}

// Chamado pelo api.js quando o admin salva configurações da loja
function applyAdminPrices(prices) {
  _adminPrices = prices || {};
}

function applyAdminPromo(promo) {
  if (!promo || !promo.skinIds || !promo.skinIds.length || !promo.price) {
    // Sem promoção ativa — desabilita passando intervalo no passado
    PROMO_SKIN_IDS  = [];
    PROMO_PRICE     = 0;
    PROMO_STARTS_AT = 0;
    PROMO_ENDS_AT   = 0;
    return;
  }
  PROMO_SKIN_IDS  = promo.skinIds;
  PROMO_PRICE     = promo.price;
  PROMO_STARTS_AT = promo.startsAt ? Date.parse(promo.startsAt) : Date.now();
  PROMO_ENDS_AT   = promo.endsAt   ? Date.parse(promo.endsAt)   : Date.now() + 1;
}

// Carrega shop-config.json na inicialização para que os preços admin
// sejam respeitados imediatamente ao reiniciar o servidor.
try {
  const cfgPath = path.join(__dirname, '..', 'shop-config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (cfg.prices) applyAdminPrices(cfg.prices);
    if (cfg.promo)  applyAdminPromo(cfg.promo);
  }
} catch(e) {}

// Torneio "Tower Defense": modo online por tempo limitado, ativo até
// 21/06/2026 — depois desse prazo o modo desaparece da seleção (mas o
// código permanece, pronto para reativação futura) e o modo "Teste" volta
// a ocupar o mesmo slot no menu.
const MAX_SKIN_ID          = 16;
const REWARD_ONLY_SKIN_IDS = [4];
const TOURNAMENT_SKIN_ID   = 4; // "Stealwing" — recompensa exclusiva do torneio
const TOURNAMENT_STARTS_AT = Date.parse('2026-06-07T00:00:00Z');
const TOURNAMENT_ENDS_AT   = Date.parse('2026-06-21T23:59:59Z');

function isTournamentActive(now = Date.now()) {
  return now >= TOURNAMENT_STARTS_AT && now < TOURNAMENT_ENDS_AT;
}

// Preços fixos e permanentes para skins específicas (fora do preço-padrão de
// SKIN_PRICE e da promoção por tempo limitado) — ex.: skins "Arcade" mais
// simples saem mais baratas, e a "Amarela" é uma opção intermediária/premium.
const CUSTOM_SKIN_PRICES = {
  13: 550, // Amarela — equivalente ao pacote de R$10 (550 créditos)
  14: 100, // Arcade Branca — equivalente ao pacote de R$1 (100 créditos)
  15: 100, // Arcade Vermelha — equivalente ao pacote de R$1 (100 créditos)
  16: 100, // Gioloff Purple — UFO roxo econômico
};

// Preço efetivo de uma skin: promo admin > promo código > preço admin > preço fixo > padrão
function skinPriceFor(skinId, ownedSkinIds) {
  if (PROMO_SKIN_IDS.includes(skinId) && isPromoActive()) {
    // Promoção exclusiva: só vale se o usuário não tiver outra skin da mesma promo
    const others = PROMO_SKIN_IDS.filter(id => id !== skinId);
    const hasOther = others.length > 0 && others.every(id => ownedSkinIds.includes(id));
    if (!hasOther) return PROMO_PRICE;
  }
  if (_adminPrices[skinId] != null)        return _adminPrices[skinId];
  if (CUSTOM_SKIN_PRICES[skinId] != null)  return CUSTOM_SKIN_PRICES[skinId];
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
  let hourStarted = user.reward_hour_started ? Date.parse(user.reward_hour_started.replace(' ', 'T') + 'Z') : null;
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

// Getters para que módulos que importam antes de applyAdminPromo ser chamado
// sempre leiam os valores atuais (exportar primitivos congela o valor no require).
function getPromoSkinIds()  { return PROMO_SKIN_IDS; }
function getPromoPrice()    { return PROMO_PRICE; }
function getPromoStartsAt() { return PROMO_STARTS_AT; }
function getPromoEndsAt()   { return PROMO_ENDS_AT; }

module.exports = {
  SKIN_PRICE, FREE_SKIN_ID, REWARD_BLOCK_SIZE, REWARD_AMOUNT, REWARD_MIN_MODES, recordMatchAndMaybeReward,
  // Manter exports diretos para compatibilidade com código que já usa economy.PROMO_*
  get PROMO_SKIN_IDS()  { return PROMO_SKIN_IDS; },
  get PROMO_PRICE()     { return PROMO_PRICE; },
  get PROMO_STARTS_AT() { return PROMO_STARTS_AT; },
  get PROMO_ENDS_AT()   { return PROMO_ENDS_AT; },
  isPromoActive, skinPriceFor,
  getPromoSkinIds, getPromoPrice, getPromoStartsAt, getPromoEndsAt,
  MAX_SKIN_ID, REWARD_ONLY_SKIN_IDS, TOURNAMENT_SKIN_ID, TOURNAMENT_STARTS_AT, TOURNAMENT_ENDS_AT, isTournamentActive,
  applyAdminPrices, applyAdminPromo,
};
