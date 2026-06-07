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
  BOMB:       { color:'#ff4400', glow:'#ff440055', rarity:'rare',      label:'BOMB',   desc:'Explosão AoE',          usable:true,  harmful:false, legendary:false },
  NUKE:       { color:'#ff2200', glow:'#ff220077', rarity:'epic',      label:'NUKE',   desc:'Explosão enorme',       usable:true,  harmful:false, legendary:false },
  FREEZE:     { color:'#88ddff', glow:'#88ddff44', rarity:'rare',      label:'FREEZE', desc:'Congela inimigos 4s',   usable:true,  harmful:false, legendary:false },
  REGEN:      { color:'#ff88aa', glow:'#ff88aa44', rarity:'rare',      label:'REGEN',  desc:'Regen HP 8s',           usable:true,  harmful:false, legendary:false },
  SHIELD_AURA:{ color:'#00ccff', glow:'#00ccff44', rarity:'epic',      label:'AURA',   desc:'Escudo regen 8s',       usable:true,  harmful:false, legendary:false },
  OVERCLOCK:  { color:'#ffdd00', glow:'#ffdd0055', rarity:'epic',      label:'OVRCLK', desc:'+100% dano 5s',         usable:true,  harmful:false, legendary:false },
  INVISIBLE:  { color:'#aaaacc', glow:'#aaaacc44', rarity:'epic',      label:'CLOAK',  desc:'Invisível p/ inimigos 5s', usable:true, harmful:false, legendary:false },

  // ── ESPECIAL ─────────────────────────────────────────────────
  MISSILE:    { color:'#ff6600', glow:'#ff660077', rarity:'epic',      label:'MÍSSIL',  desc:'3 mísseis teleguiados',  usable:true,  harmful:false, legendary:false },

  // ── LENDÁRIOS — somem em 5-7s, muito fortes ──────────────────
  GODMODE:    { color:'#ffd700', glow:'#ffd70099', rarity:'legendary', label:'DEUS',   desc:'Invencível 4s',         usable:true,  harmful:false, legendary:true  },
  NOVA:       { color:'#ff00ff', glow:'#ff00ff77', rarity:'legendary', label:'NOVA',   desc:'Pulso destrói tudo',    usable:true,  harmful:false, legendary:true  },
  VAMPIRO:    { color:'#cc0044', glow:'#cc004477', rarity:'legendary', label:'VAMP',   desc:'Tiro drena HP 6s',      usable:true,  harmful:false, legendary:true  },
  WARP:       { color:'#aa44ff', glow:'#aa44ff77', rarity:'legendary', label:'WARP',   desc:'Teleporta ao cursor',   usable:true,  harmful:false, legendary:true  },

  // ── MALEFÍCIOS — inimigo pode coletar e usar ──────────────────
  SLOW:       { color:'#cc44aa', glow:'#cc44aa44', rarity:'common',    label:'SLOW',   desc:'-50% Vel 5s',           usable:false, harmful:true,  legendary:false },
  DRAIN:      { color:'#aa2200', glow:'#aa220044', rarity:'common',    label:'DRAIN',  desc:'-30 Mana',              usable:false, harmful:true,  legendary:false },
  BLIND:      { color:'#220044', glow:'#22004444', rarity:'rare',      label:'BLIND',  desc:'Visão turva 4s',        usable:false, harmful:true,  legendary:false },
  POISON:     { color:'#336600', glow:'#33660044', rarity:'rare',      label:'POISON', desc:'-8 HP/s por 5s',        usable:false, harmful:true,  legendary:false },
};

// Tempo de vida na arena por raridade (segundos)
export const ITEM_LIFE = {
  common:    { min:14, max:20 },
  rare:      { min:12, max:18 },
  epic:      { min:10, max:15 },
  legendary: { min:5,  max:7  },
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
  ['BOMB',         5,  7],
  ['FREEZE',       5,  7],
  ['REGEN',        4,  6],
  // epics
  ['MISSILE',      3,  5],
  ['MULTISHOT',    3,  6],
  ['PIERCING',     3,  6],
  ['DASH_BOOST',   2,  5],
  ['NUKE',         2,  4],
  ['SHIELD_AURA',  2,  5],
  ['OVERCLOCK',    2,  4],
  ['INVISIBLE',    2,  4],
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
