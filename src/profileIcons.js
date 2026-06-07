// Ícones de perfil — ilustrações vetoriais desenhadas em canvas, no mesmo
// estilo neon/arcade do jogo (formas geométricas + brilho), substituindo
// os antigos emojis. Cada entrada define uma cor e uma função de desenho
// que recebe um contexto 2D já centralizado em (0,0) com raio de ~`s`.
//
// IMPORTANTE: a ordem/índice de cada entrada é o valor persistido em
// `profile.profileIcon` (inteiro 0-23, validado no servidor) — não reordenar.

function ring(ctx, s, color) {
  ctx.beginPath(); ctx.arc(0, 0, s * 0.92, 0, Math.PI * 2);
  ctx.strokeStyle = color; ctx.lineWidth = s * 0.07; ctx.globalAlpha = 0.35;
  ctx.stroke(); ctx.globalAlpha = 1;
}

const DEFS = [
  // 0 — Piloto (capacete)
  { color:'#5be8ff', draw(ctx,s,c){
    ctx.beginPath(); ctx.arc(0, s*0.05, s*0.62, Math.PI*0.92, Math.PI*2.08); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s*0.05, -s*0.02, s*0.34, s*0.26, 0, 0, Math.PI*2);
    ctx.fillStyle = '#0a1622'; ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = s*0.06; ctx.stroke();
  }},
  // 1 — Ás (óculos de aviador)
  { color:'#ffcc44', draw(ctx,s,c){
    ctx.lineWidth = s*0.12; ctx.strokeStyle = c;
    ctx.beginPath(); ctx.arc(-s*0.32, 0, s*0.3, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(s*0.32, 0, s*0.3, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s*0.04, 0); ctx.lineTo(s*0.04, 0); ctx.stroke();
    ctx.fillStyle = c; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(-s*0.32, 0, s*0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.32, 0, s*0.3, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }},
  // 2 — Drone/robô
  { color:'#9ad6ff', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.roundRect(-s*0.5, -s*0.4, s, s*0.8, s*0.18); ctx.fill();
    ctx.fillStyle = '#0a1622';
    ctx.beginPath(); ctx.arc(-s*0.22, -s*0.02, s*0.14, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.22, -s*0.02, s*0.14, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = c;
    ctx.fillRect(-s*0.06, s*0.2, s*0.12, s*0.18);
    ctx.beginPath(); ctx.moveTo(0, -s*0.4); ctx.lineTo(0, -s*0.66); ctx.strokeStyle = c; ctx.lineWidth = s*0.08; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -s*0.7, s*0.08, 0, Math.PI*2); ctx.fill();
  }},
  // 3 — Alienígena
  { color:'#b685ff', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, -s*0.05, s*0.46, s*0.62, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#0a1622';
    ctx.beginPath(); ctx.ellipse(-s*0.18, -s*0.1, s*0.13, s*0.2, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s*0.18, -s*0.1, s*0.13, s*0.2, 0.3, 0, Math.PI*2); ctx.fill();
  }},
  // 4 — Raposa (orelhas triangulares)
  { color:'#ff9a4d', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-s*0.5,-s*0.1); ctx.lineTo(-s*0.22,-s*0.66); ctx.lineTo(s*0.02,-s*0.06); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s*0.5,-s*0.1); ctx.lineTo(s*0.22,-s*0.66); ctx.lineTo(-s*0.02,-s*0.06); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, s*0.08, s*0.42, s*0.36, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#0a1622';
    ctx.beginPath(); ctx.moveTo(-s*0.1,s*0.16); ctx.lineTo(s*0.1,s*0.16); ctx.lineTo(0,s*0.32); ctx.closePath(); ctx.fill();
  }},
  // 5 — Felino (orelhas arredondadas + bigodes)
  { color:'#ffd166', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(-s*0.32,-s*0.34, s*0.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.32,-s*0.34, s*0.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, s*0.06, s*0.46, s*0.4, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = s*0.05;
    for (const dx of [-1,1]) {
      ctx.beginPath(); ctx.moveTo(dx*s*0.12, s*0.1); ctx.lineTo(dx*s*0.5, s*0.0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx*s*0.12, s*0.18); ctx.lineTo(dx*s*0.5, s*0.22); ctx.stroke();
    }
  }},
  // 6 — Lobo (focinho alongado)
  { color:'#c7d6e6', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-s*0.46,-s*0.3); ctx.lineTo(-s*0.2,-s*0.6); ctx.lineTo(0,-s*0.22); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s*0.46,-s*0.3); ctx.lineTo(s*0.2,-s*0.6); ctx.lineTo(0,-s*0.22); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s*0.4,-s*0.05); ctx.quadraticCurveTo(0, s*0.5, s*0.4,-s*0.05);
    ctx.quadraticCurveTo(0, s*0.1, -s*0.4,-s*0.05); ctx.closePath(); ctx.fill();
  }},
  // 7 — Águia (formato em V de asas)
  { color:'#7fffb0', draw(ctx,s,c){
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = s*0.1;
    ctx.beginPath();
    ctx.moveTo(-s*0.7, s*0.3); ctx.quadraticCurveTo(-s*0.2,-s*0.5, 0,-s*0.1);
    ctx.quadraticCurveTo(s*0.2,-s*0.5, s*0.7, s*0.3);
    ctx.quadraticCurveTo(0, s*0.05, -s*0.7, s*0.3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-s*0.18, s*0.14, 0, Math.PI*2); ctx.fillStyle = '#0a1622'; ctx.fill();
  }},
  // 8 — Dragão (cabeça com chifres)
  { color:'#ff5577', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-s*0.3,-s*0.5); ctx.lineTo(-s*0.12,-s*0.1); ctx.lineTo(-s*0.4,-s*0.18); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s*0.3,-s*0.5); ctx.lineTo(s*0.12,-s*0.1); ctx.lineTo(s*0.4,-s*0.18); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s*0.4, s*0.0); ctx.lineTo(0,-s*0.3); ctx.lineTo(s*0.4, s*0.0);
    ctx.lineTo(s*0.22, s*0.5); ctx.lineTo(-s*0.22, s*0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff200'; ctx.beginPath(); ctx.arc(-s*0.16, s*0.02, s*0.07, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.16, s*0.02, s*0.07, 0, Math.PI*2); ctx.fill();
  }},
  // 9 — Invasor alienígena (estilo retrô)
  { color:'#9dffb0', draw(ctx,s,c){
    ctx.fillStyle = c;
    const px = s*0.18;
    const cells = [
      [-2,-1],[-1,-2],[0,-2],[1,-2],[2,-1],
      [-2,0],[-1,0],[0,0],[1,0],[2,0],
      [-2,1],[2,1],[-1,2],[1,2],
    ];
    for (const [cx, cy] of cells) ctx.fillRect(cx*px - px/2, cy*px - px/2, px*0.92, px*0.92);
  }},
  // 10 — Foguete
  { color:'#5be8ff', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(0,-s*0.7); ctx.quadraticCurveTo(s*0.34,-s*0.1, s*0.22, s*0.4);
    ctx.lineTo(-s*0.22, s*0.4); ctx.quadraticCurveTo(-s*0.34,-s*0.1, 0,-s*0.7); ctx.fill();
    ctx.fillStyle = '#0a1622'; ctx.beginPath(); ctx.arc(0,-s*0.16, s*0.13, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff9a4d';
    ctx.beginPath(); ctx.moveTo(-s*0.1, s*0.4); ctx.lineTo(0, s*0.74); ctx.lineTo(s*0.1, s*0.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-s*0.22, s*0.18); ctx.lineTo(-s*0.46, s*0.42); ctx.lineTo(-s*0.2, s*0.4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s*0.22, s*0.18); ctx.lineTo(s*0.46, s*0.42); ctx.lineTo(s*0.2, s*0.4); ctx.closePath(); ctx.fill();
  }},
  // 11 — Estrela
  { color:'#ffe066', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = -Math.PI/2 + i * (Math.PI*2/5);
      const a2 = a1 + Math.PI/5;
      const p1x = Math.cos(a1)*s*0.72, p1y = Math.sin(a1)*s*0.72;
      const p2x = Math.cos(a2)*s*0.3,  p2y = Math.sin(a2)*s*0.3;
      if (i === 0) ctx.moveTo(p1x, p1y); else ctx.lineTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
    }
    ctx.closePath(); ctx.fill();
  }},
  // 12 — Caveira
  { color:'#d8e6f2', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0,-s*0.05, s*0.5, Math.PI, 0); ctx.lineTo(s*0.5, s*0.18);
    ctx.quadraticCurveTo(0, s*0.4, -s*0.5, s*0.18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a1622';
    ctx.beginPath(); ctx.arc(-s*0.2,-s*0.06, s*0.14, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.2,-s*0.06, s*0.14, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, s*0.06); ctx.lineTo(s*0.07, s*0.2); ctx.lineTo(-s*0.07, s*0.2); ctx.closePath(); ctx.fill();
  }},
  // 13 — Chama
  { color:'#ff7a3c', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, s*0.7);
    ctx.quadraticCurveTo(-s*0.5, s*0.2, -s*0.2, -s*0.3);
    ctx.quadraticCurveTo(-s*0.1,-s*0.05, 0,-s*0.7);
    ctx.quadraticCurveTo(s*0.1,-s*0.05, s*0.2,-s*0.3);
    ctx.quadraticCurveTo(s*0.5, s*0.2, 0, s*0.7);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.moveTo(0, s*0.42); ctx.quadraticCurveTo(-s*0.2, s*0.1, 0,-s*0.28);
    ctx.quadraticCurveTo(s*0.2, s*0.1, 0, s*0.42); ctx.closePath(); ctx.fill();
  }},
  // 14 — Raio
  { color:'#fff200', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(s*0.18,-s*0.74); ctx.lineTo(-s*0.36, s*0.06); ctx.lineTo(-s*0.04, s*0.06);
    ctx.lineTo(-s*0.18, s*0.74); ctx.lineTo(s*0.36,-s*0.1); ctx.lineTo(s*0.04,-s*0.1);
    ctx.closePath(); ctx.fill();
  }},
  // 15 — Escudo
  { color:'#5be8ff', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(0,-s*0.68); ctx.lineTo(s*0.5,-s*0.4); ctx.lineTo(s*0.5, s*0.06);
    ctx.quadraticCurveTo(s*0.5, s*0.6, 0, s*0.74);
    ctx.quadraticCurveTo(-s*0.5, s*0.6, -s*0.5, s*0.06);
    ctx.lineTo(-s*0.5,-s*0.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a1622';
    ctx.beginPath(); ctx.moveTo(0,-s*0.3); ctx.lineTo(s*0.07,-s*0.04); ctx.lineTo(-s*0.07,-s*0.04); ctx.closePath(); ctx.fill();
    ctx.fillRect(-s*0.06,-s*0.04, s*0.12, s*0.32);
  }},
  // 16 — Alvo (mira)
  { color:'#ff4d6a', draw(ctx,s,c){
    ctx.strokeStyle = c; ctx.lineWidth = s*0.1;
    ctx.beginPath(); ctx.arc(0,0, s*0.7, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0, s*0.4, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0,0, s*0.14, 0, Math.PI*2); ctx.fill();
  }},
  // 17 — Lua crescente
  { color:'#cdb8ff', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0,0, s*0.62, 0, Math.PI*2);
    ctx.arc(s*0.32,-s*0.1, s*0.56, 0, Math.PI*2, true);
    ctx.fill('evenodd');
  }},
  // 18 — Cometa
  { color:'#9ad6ff', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(s*0.22, s*0.22, s*0.26, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(s*0.4, s*0.04);
    ctx.lineTo(-s*0.7,-s*0.6);
    ctx.lineTo(-s*0.34,-s*0.06);
    ctx.lineTo(-s*0.7,-s*0.5);
    ctx.lineTo(s*0.04, s*0.4);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }},
  // 19 — Planeta com anel
  { color:'#ffb157', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0,0, s*0.46, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = s*0.09; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, s*0.82, s*0.26, -0.45, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1;
  }},
  // 20 — Cristal
  { color:'#7fe0ff', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0,-s*0.74); ctx.lineTo(s*0.42,-s*0.16); ctx.lineTo(s*0.24, s*0.66);
    ctx.lineTo(-s*0.24, s*0.66); ctx.lineTo(-s*0.42,-s*0.16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#0a1622'; ctx.lineWidth = s*0.04; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(0,-s*0.74); ctx.lineTo(0, s*0.66); ctx.stroke();
    ctx.globalAlpha = 1;
  }},
  // 21 — Braço cibernético (engrenagem + garra)
  { color:'#a8b4c2', draw(ctx,s,c){
    ctx.strokeStyle = c; ctx.lineWidth = s*0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, s*0.34, Math.PI*1.1, Math.PI*2.5); ctx.stroke();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0,0, s*0.18, 0, Math.PI*2); ctx.fill();
    for (let i=0;i<6;i++){
      const a = i*Math.PI/3;
      ctx.beginPath();
      ctx.arc(Math.cos(a)*s*0.34, Math.sin(a)*s*0.34, s*0.07, 0, Math.PI*2);
      ctx.fill();
    }
  }},
  // 22 — Controle de jogo
  { color:'#7fffb0', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.roundRect(-s*0.62, -s*0.32, s*1.24, s*0.64, s*0.3); ctx.fill();
    ctx.fillStyle = '#0a1622';
    ctx.beginPath(); ctx.arc(s*0.3,-s*0.08, s*0.09, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(s*0.46, s*0.08, s*0.09, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(-s*0.46, -s*0.05, s*0.24, s*0.1);
    ctx.fillRect(-s*0.39, -s*0.12, s*0.1, s*0.24);
  }},
  // 23 — Coroa
  { color:'#ffd166', draw(ctx,s,c){
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(-s*0.5, s*0.32); ctx.lineTo(-s*0.5,-s*0.12); ctx.lineTo(-s*0.22, s*0.1);
    ctx.lineTo(0,-s*0.5); ctx.lineTo(s*0.22, s*0.1); ctx.lineTo(s*0.5,-s*0.12);
    ctx.lineTo(s*0.5, s*0.32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5577';
    ctx.beginPath(); ctx.arc(0,-s*0.46, s*0.07, 0, Math.PI*2); ctx.fill();
  }},
];

export const PROFILE_ICON_DEFS = DEFS;

// Desenha o ícone `id` centralizado em (0,0) num canvas de W×H.
// `ctx` deve estar limpo; a função salva/restaura o estado.
export function drawProfileIcon(ctx, id, W, H) {
  const def = DEFS[id] || DEFS[0];
  const s = Math.min(W, H) * 0.42;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.shadowColor = def.color;
  ctx.shadowBlur = s * 0.5;
  ring(ctx, s, def.color);
  def.draw(ctx, s, def.color);
  ctx.restore();
}
