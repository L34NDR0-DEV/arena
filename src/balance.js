// ── Balanceamento de itens ────────────────────────────────────
// Todas as definições de itens e lógica de sorteio ficam aqui.
// Para ajustar raridade, duração ou poder: edite só este arquivo.

// Categorias visuais para agrupar no HUD e no sorteio
// rarity: 'common' | 'rare' | 'epic' | 'legendary'
// tier:   'instant' | 'usable' | 'harmful'
// life:   tempo (s) que o item fica na arena antes de sumir
//         legendary fica só 5-7s; outros 14-20s

export const ITEM_DEFS = {

  // ── COMUNS — cura e recursos ─────────────────────────────────
  HEALTH:     { color:'#ff3366', glow:'#ff336666', rarity:'common',    label:'HP+',    desc:'+60 Vida',              usable:false, harmful:false, legendary:false },
  HEALTH_BIG: { color:'#ff6699', glow:'#ff669966', rarity:'rare',      label:'HP++',   desc:'+150 Vida',             usable:false, harmful:false, legendary:false },
  SHIELD:     { color:'#00aaee', glow:'#00aaee66', rarity:'common',    label:'ESC',    desc:'+50 Escudo',            usable:false, harmful:false, legendary:false },
  SHIELD_BIG: { color:'#44ccff', glow:'#44ccff66', rarity:'rare',      label:'ESC++',  desc:'+120 Escudo',           usable:false, harmful:false, legendary:false },
  MANA:       { color:'#4488ff', glow:'#4488ff55', rarity:'common',    label:'MP+',    desc:'+60 Mana',              usable:false, harmful:false, legendary:false },
  MANA_FULL:  { color:'#88aaff', glow:'#88aaff55', rarity:'rare',      label:'MP MAX', desc:'Mana cheia',            usable:false, harmful:false, legendary:false },

  // ── USÁVEIS — efeitos temporários ────────────────────────────
  RAPID:      { color:'#ff8800', glow:'#ff880055', rarity:'rare',      label:'RAP',    desc:'Tiro rápido 8s',        usable:true,  harmful:false, legendary:false },
  MULTISHOT:  { color:'#ffaa22', glow:'#ffaa2255', rarity:'epic',      label:'3-WAY',  desc:'Tiro triplo 6s',        usable:true,  harmful:false, legendary:false },
  PIERCING:   { color:'#ff6600', glow:'#ff660055', rarity:'epic',      label:'PIERCE', desc:'Tiro perfura 7s',       usable:true,  harmful:false, legendary:false },
  MAGNET:     { color:'#00ffee', glow:'#00ffee55', rarity:'rare',      label:'MAG',    desc:'Ímã 10s',               usable:true,  harmful:false, legendary:false },
  BOOST:      { color:'#00ff88', glow:'#00ff8855', rarity:'rare',      label:'BOOST',  desc:'Vel +50% 6s',           usable:true,  harmful:false, legendary:false },
  DASH_BOOST: { color:'#00ffaa', glow:'#00ffaa44', rarity:'epic',      label:'DASH+',  desc:'Dash carrega 2x 8s',    usable:true,  harmful:false, legendary:false },
  MINE:       { color:'#ff4400', glow:'#ff440055', rarity:'rare',      label:'MINA',   desc:'Mina de proximidade',   usable:true,  harmful:false, legendary:false },
  NUKE:       { color:'#ff2200', glow:'#ff220077', rarity:'epic',      label:'NUKE',   desc:'Explosão enorme',       usable:true,  harmful:false, legendary:false },
  FREEZE:     { color:'#88ddff', glow:'#88ddff44', rarity:'rare',      label:'FREEZE', desc:'Congela inimigos 4s',   usable:true,  harmful:false, legendary:false },
  REGEN:      { color:'#ff88aa', glow:'#ff88aa44', rarity:'rare',      label:'REGEN',  desc:'Regen HP 8s',           usable:true,  harmful:false, legendary:false },
  SHIELD_AURA:{ color:'#00ccff', glow:'#00ccff44', rarity:'epic',      label:'AURA',   desc:'Escudo regen 8s',       usable:true,  harmful:false, legendary:false },
  OVERCLOCK:  { color:'#ffdd00', glow:'#ffdd0055', rarity:'epic',      label:'OVRCLK', desc:'+100% dano 5s',         usable:true,  harmful:false, legendary:false },
  INVISIBLE:  { color:'#aaaacc', glow:'#aaaacc44', rarity:'epic',      label:'CLOAK',  desc:'Invisível p/ inimigos 5s', usable:true, harmful:false, legendary:false },

  // ── ESPECIAL ─────────────────────────────────────────────────
  MISSILE:    { color:'#ff6600', glow:'#ff660077', rarity:'epic',      label:'MÍSSIL',  desc:'Tiro teleguiado 8s',     usable:true,  harmful:false, legendary:false },

  // ── ITENS DE TIRO — temática arcade ──────────────────────────
  // Cada um altera o comportamento do tiro base da nave por N segundos.
  // Se o jogador pega mais de um, o primeiro coletado é o "padrão ativo".
  LASER:        { color:'#ff0088', glow:'#ff008877', rarity:'rare',      label:'LASER',    desc:'Tiro laser contínuo 7s',        usable:true, harmful:false, legendary:false, weaponType:true },
  SHOTGUN:      { color:'#ff5500', glow:'#ff550077', rarity:'rare',      label:'ESCOPETA', desc:'5 projéteis em cone 7s',         usable:true, harmful:false, legendary:false, weaponType:true },
  SNIPER:       { color:'#00ffcc', glow:'#00ffcc77', rarity:'rare',      label:'SNIPER',   desc:'Tiro único longo alcance 8s',    usable:true, harmful:false, legendary:false, weaponType:true },
  BOUNCER:      { color:'#ffee00', glow:'#ffee0077', rarity:'epic',      label:'RICOCHET', desc:'Balas ricocheteiam 3x — 8s',     usable:true, harmful:false, legendary:false, weaponType:true },
  FLAMETHROWER: { color:'#ff3300', glow:'#ff330077', rarity:'epic',      label:'CHAMAS',   desc:'Cone de fogo contínuo 6s',       usable:true, harmful:false, legendary:false, weaponType:true },
  PLASMA:       { color:'#aa00ff', glow:'#aa00ff77', rarity:'epic',      label:'PLASMA',   desc:'Bola lenta de alta energia 7s',  usable:true, harmful:false, legendary:false, weaponType:true },
  RAILGUN:      { color:'#00ff88', glow:'#00ff8877', rarity:'epic',      label:'RAILGUN',  desc:'Raio atravessa tudo 6s',         usable:true, harmful:false, legendary:false, weaponType:true },
  HOMING:       { color:'#ff44aa', glow:'#ff44aa77', rarity:'epic',      label:'CAÇA',     desc:'Míssil teleguiado múltiplo 8s',  usable:true, harmful:false, legendary:false, weaponType:true },
  BURST:        { color:'#ffbb00', glow:'#ffbb0077', rarity:'rare',      label:'RAJADA',   desc:'3 tiros em rajada 7s',           usable:true, harmful:false, legendary:false, weaponType:true },
  BOOMERANG:    { color:'#00eeff', glow:'#00eeff77', rarity:'epic',      label:'BUMERANG', desc:'Projétil volta para origem 8s',  usable:true, harmful:false, legendary:false, weaponType:true },
  GRAVITY:      { color:'#8844ff', glow:'#8844ff77', rarity:'epic',      label:'GRAVIDADE',desc:'Puxa inimigos ao acertar 7s',    usable:true, harmful:false, legendary:false, weaponType:true },
  EXPLOSIVE:    { color:'#ff6600', glow:'#ff660077', rarity:'rare',      label:'EXPLOSÃO', desc:'Projétil explode ao impacto 7s', usable:true, harmful:false, legendary:false, weaponType:true },
  CHAIN:        { color:'#55aaff', glow:'#55aaff77', rarity:'epic',      label:'CORRENTE', desc:'Raio salta entre inimigos 7s',   usable:true, harmful:false, legendary:false, weaponType:true },
  STORM:        { color:'#ccaaff', glow:'#ccaaff77', rarity:'epic',      label:'TEMPEST',  desc:'Chuva de projéteis 6s',          usable:true, harmful:false, legendary:false, weaponType:true },
  VOID_SHOT:    { color:'#220044', glow:'#44009988', rarity:'legendary', label:'VAZIO',    desc:'Projétil drena vida e mana 5s',  usable:true, harmful:false, legendary:true,  weaponType:true },
  PHOTON:       { color:'#ffffff', glow:'#aaddff88', rarity:'legendary', label:'FÓTON',   desc:'Velocidade da luz, atravessa 5s', usable:true, harmful:false, legendary:true,  weaponType:true },
  DUAL:         { color:'#ff8844', glow:'#ff884477', rarity:'rare',      label:'DUPLO',    desc:'Dois canhões simultâneos 8s',    usable:true, harmful:false, legendary:false, weaponType:true },
  SPREAD:       { color:'#ffcc44', glow:'#ffcc4477', rarity:'rare',      label:'SPREAD',   desc:'7 projéteis em leque 7s',        usable:true, harmful:false, legendary:false, weaponType:true },
  TOXIC:        { color:'#66ff00', glow:'#66ff0077', rarity:'epic',      label:'TÓXICO',   desc:'Nuvem venenosa ao impacto 7s',   usable:true, harmful:false, legendary:false, weaponType:true },
  QUANTUM:      { color:'#ff00ff', glow:'#ff00ff88', rarity:'legendary', label:'QUANTUM',  desc:'Teletransporta bala 3x 6s',      usable:true, harmful:false, legendary:true,  weaponType:true },

  // ── OFENSIVOS — afetam adversários mais próximos ao coletar ──
  // harmful:false pois "quem sofre" é o adversário, não o coletor.
  // DEEP_FREEZE usa nome diferente de FREEZE (que existe como item de área PvE)
  // para não colidir com o sistema applyHarmful que lê a chave do tipo.
  STUN:       { color:'#ffe066', glow:'#ffe06677', rarity:'rare',      label:'STUN',    desc:'Atordoa adversário 3s',  usable:true,  harmful:false, legendary:false },
  DEEP_FREEZE:{ color:'#66ccff', glow:'#66ccff77', rarity:'epic',      label:'CONGELA', desc:'Congela adversário 2.5s',usable:true,  harmful:false, legendary:false },
  CONFUSE:    { color:'#cc66ff', glow:'#cc66ff77', rarity:'epic',      label:'CONFUNDE',desc:'Confunde mira 5s',       usable:true,  harmful:false, legendary:false },

  // ── LENDÁRIOS — somem em 5-7s, muito fortes ──────────────────
  GODMODE:    { color:'#ffd700', glow:'#ffd70099', rarity:'legendary', label:'DEUS',   desc:'Invencível 4s',         usable:true,  harmful:false, legendary:true  },
  NOVA:       { color:'#ff00ff', glow:'#ff00ff77', rarity:'legendary', label:'NOVA',   desc:'Pulso destrói tudo',    usable:true,  harmful:false, legendary:true  },
  VAMPIRO:    { color:'#cc0044', glow:'#cc004477', rarity:'legendary', label:'VAMP',   desc:'Tiro drena HP 6s',      usable:true,  harmful:false, legendary:true  },
  WARP:       { color:'#aa44ff', glow:'#aa44ff77', rarity:'legendary', label:'WARP',   desc:'Teleporta ao cursor',   usable:true,  harmful:false, legendary:true  },

  // ── ITENS DE CARTA (permanentes, modo Cards) ─────────────────
  TOWER_DEPLOY: { color:'#00ddff', glow:'#00ddff77', rarity:'epic', label:'TORRE',     desc:'Coloca torre aliada',   usable:true, harmful:false, legendary:false },
  TRAP_DEPLOY:  { color:'#aa44ff', glow:'#aa44ff77', rarity:'epic', label:'ARMADILHA', desc:'Coloca armadilha',      usable:true, harmful:false, legendary:false },

  // ── MALEFÍCIOS — inimigo pode coletar e usar ──────────────────
  SLOW:       { color:'#cc44aa', glow:'#cc44aa44', rarity:'common',    label:'SLOW',   desc:'-50% Vel 5s',           usable:false, harmful:true,  legendary:false },
  DRAIN:      { color:'#aa2200', glow:'#aa220044', rarity:'common',    label:'DRAIN',  desc:'-30 Mana',              usable:false, harmful:true,  legendary:false },
  BLIND:      { color:'#220044', glow:'#22004444', rarity:'rare',      label:'BLIND',  desc:'Visão turva 4s',        usable:false, harmful:true,  legendary:false },
  POISON:     { color:'#336600', glow:'#33660044', rarity:'rare',      label:'POISON', desc:'-8 HP/s por 5s',        usable:false, harmful:true,  legendary:false },
};

// Tempo de vida na arena por raridade (segundos)
export const ITEM_LIFE = {
  common:    { min:22, max:32 },
  rare:      { min:18, max:28 },
  epic:      { min:15, max:24 },
  legendary: { min:10, max:16 },
};

// ── Pesos de sorteio ──────────────────────────────────────────
// Cada entrada: [tipo, peso_normal, peso_extraSlot]
// extraSlot ativo → mais usáveis e épicos, sem lendários comuns
const SPAWN_TABLE = [
  // comuns
  ['HEALTH',      18, 10],
  ['SHIELD',      14,  8],
  ['MANA',        12,  7],
  // rares instant
  ['HEALTH_BIG',   5,  4],
  ['SHIELD_BIG',   4,  3],
  ['MANA_FULL',    3,  2],
  // rares usable
  ['RAPID',        7, 10],
  ['MAGNET',       6,  9],
  ['BOOST',        6,  9],
  ['MINE',         5,  7],
  ['FREEZE',       5,  7],
  ['REGEN',        4,  6],
  // epics
  ['MISSILE',      3,  5],
  ['STUN',         4,  6],
  ['DEEP_FREEZE',  2,  4],
  ['CONFUSE',      2,  4],
  ['MULTISHOT',    3,  6],
  ['PIERCING',     3,  6],
  ['DASH_BOOST',   2,  5],
  ['NUKE',         2,  4],
  ['SHIELD_AURA',  2,  5],
  ['OVERCLOCK',    2,  4],
  ['INVISIBLE',    2,  4],
  // ── Itens de tiro (weapon types) ─────────────────────────────
  ['LASER',        5,  8],
  ['SHOTGUN',      5,  7],
  ['SNIPER',       4,  6],
  ['BURST',        5,  8],
  ['DUAL',         5,  8],
  ['SPREAD',       5,  7],
  ['BOUNCER',      3,  5],
  ['FLAMETHROWER', 3,  5],
  ['PLASMA',       3,  5],
  ['RAILGUN',      3,  5],
  ['HOMING',       3,  6],
  ['BOOMERANG',    3,  5],
  ['GRAVITY',      2,  4],
  ['EXPLOSIVE',    4,  6],
  ['CHAIN',        2,  4],
  ['STORM',        2,  4],
  ['TOXIC',        2,  4],
  // legendários de tiro
  ['VOID_SHOT',    1,  1],
  ['PHOTON',       1,  1],
  ['QUANTUM',      1,  1],

  // legendarios (raros, nunca boosted)
  ['GODMODE',      1,  1],
  ['NOVA',         1,  1],
  ['VAMPIRO',      1,  1],
  ['WARP',         1,  1],
  // malefícios
  ['SLOW',        10,  5],
  ['DRAIN',        9,  4],
  ['BLIND',        4,  2],
  ['POISON',       3,  2],
];

// Pré-calcula tabelas de sorteio
function _buildTable(colIdx) {
  const table = [];
  let total = 0;
  for (const [type, wNorm, wExtra] of SPAWN_TABLE) {
    const w = colIdx === 0 ? wNorm : wExtra;
    total += w;
    table.push({ type, cumul: total });
  }
  return { table, total };
}
const _tableNormal = _buildTable(0);
const _tableExtra  = _buildTable(1);

export function randomType(extraBoost = false) {
  const { table, total } = extraBoost ? _tableExtra : _tableNormal;
  const r = Math.random() * total;
  for (const entry of table) {
    if (r < entry.cumul) return entry.type;
  }
  return 'HEALTH';
}

// Retorna duração de vida na arena para o item
export function itemLifespan(type) {
  const def = ITEM_DEFS[type];
  if (!def) return 14;
  const range = ITEM_LIFE[def.rarity] || ITEM_LIFE.common;
  return range.min + Math.random() * (range.max - range.min);
}
