// Debuffs ofensivos aplicáveis a QUALQUER combatente adversário (inimigos PvE,
// bots de equipe e jogadores remotos): atordoar, congelar, confundir.
// Usa um objeto simples {stunTimer,frozenTimer,confuseTimer} anexado ao alvo —
// mesmo padrão de "timer simples + getter" já usado em Player (rapidTimer etc),
// só que aplicável de forma uniforme a classes que não compartilham herança
// (SmartEnemy, DroneEnemy, GuardianEnemy, TeamBot, RemotePlayer).
//
// Módulo-folha: não importa nada do projeto — pode ser usado livremente por
// enemies.js, network.js, combat.js, player.js e game.js sem risco de ciclo.

function _ensureStatus(target) {
  if (!target._status) target._status = { stunTimer: 0, frozenTimer: 0, confuseTimer: 0 };
  return target._status;
}

// Math.max ao aplicar: reaplicar o mesmo debuff não "reseta para baixo" um
// timer maior já em curso (evita limpar um stun de 3s restantes com um de 1s).
export function applyStun(target, duration) {
  const st = _ensureStatus(target);
  st.stunTimer = Math.max(st.stunTimer, duration);
}
export function applyFreeze(target, duration) {
  const st = _ensureStatus(target);
  st.frozenTimer = Math.max(st.frozenTimer, duration);
}
export function applyConfuse(target, duration) {
  const st = _ensureStatus(target);
  st.confuseTimer = Math.max(st.confuseTimer, duration);
}

export function isStunned(target) { return (target._status?.stunTimer ?? 0) > 0; }
export function isFrozen(target) { return (target._status?.frozenTimer ?? 0) > 0; }
export function isConfused(target) { return (target._status?.confuseTimer ?? 0) > 0; }

// Decrementa os timers — chamar 1x por frame no update() de cada combatente.
export function tickStatus(target, dt) {
  const st = target._status;
  if (!st) return;
  if (st.stunTimer > 0) st.stunTimer -= dt;
  if (st.frozenTimer > 0) st.frozenTimer -= dt;
  if (st.confuseTimer > 0) st.confuseTimer -= dt;
}

// Desvia um ângulo de mira aleatoriamente — usado por inimigos/bots confusos.
// `spread` em radianos (ex.: PI*0.6 ≈ até 108° de erro pra cada lado).
export function confusedAngle(baseAngle, spread = Math.PI * 0.6) {
  return baseAngle + (Math.random() * 2 - 1) * spread;
}

export const STATUS_VISUALS = {
  stun: { color: '#ffe066', label: 'ATORDOADO' },
  freeze: { color: '#88ddff', label: 'CONGELADO' },
  confuse: { color: '#cc66ff', label: 'CONFUSO' },
};

// Desenha um pequeno conjunto de ícones acima da nave indicando os debuffs
// ativos. Função livre parametrizada — sem acoplamento a uma classe específica,
// reaproveitável por SmartEnemy/DroneEnemy/GuardianEnemy/TeamBot/RemotePlayer.
// `iconY`: posição Y absoluta dos ícones (cada chamador ajusta conforme seu
// próprio empilhamento de label/HP bar/lives para não sobrepor nada).
export function drawStatusIcons(ctx, x, iconY, target) {
  const st = target._status;
  if (!st) return;
  const active = [];
  if (st.stunTimer > 0) active.push(STATUS_VISUALS.stun);
  if (st.frozenTimer > 0) active.push(STATUS_VISUALS.freeze);
  if (st.confuseTimer > 0) active.push(STATUS_VISUALS.confuse);
  if (!active.length) return;

  const gap = 16, totalW = (active.length - 1) * gap;
  const baseY = iconY;
  active.forEach((v, i) => {
    const px = x - totalW / 2 + i * gap;
    ctx.save();
    ctx.translate(px, baseY);
    ctx.fillStyle = v.color;
    ctx.shadowColor = v.color; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  });
}
