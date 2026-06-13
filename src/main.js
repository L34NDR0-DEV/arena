import { SKINS, REWARD_ONLY_SKIN_IDS } from './skins.js';
import { TRAILS } from './trails.js';
import { ARENA_TYPES }    from './arena.js';
import { Game }           from './game.js';
import { CHANGELOG }      from './changelog.js';
import { PROFILE_ICON_DEFS, drawProfileIcon } from './profileIcons.js';
import { startVersionChecker } from './version-check.js';

let game=null, selectedSkin=0, selectedMode='contra1', paused=false;
let pilotName='JOGADOR';

// ── Conta / perfil (autenticação, créditos, skins) ────────────
const SHOP_PRICE = 500;
const economy_FREE_SKIN_ID = 6;
const FIXED_SKIN_PRICES = { 13:550, 14:100, 15:100, 16:100 };
let currentUser = null; // {id,email,displayName,credits,equippedSkin}
let profile     = null; // {user,ownedSkins,equippedSkin,rewardProgress,promo}

// Preço efetivo de uma skin para o piloto atual.
// Prioridade: promo individual > promo global > preço customizado admin > padrão.
function _userPromoActive(){
  const up = profile?.userPromo;
  if (!up) return false;
  if (up.endsAt && Date.now() > new Date(up.endsAt).getTime()) return false;
  return true;
}
function shopPriceFor(skinId){
  // Promo individual do usuário (desconto %)
  if (_userPromoActive()) {
    const up = profile.userPromo;
    if (up.skinIds && up.skinIds.includes(skinId)) {
      const base = profile?.customPrices?.[skinId] ?? SHOP_PRICE;
      return Math.round(base * (1 - (up.discountPct || 0) / 100));
    }
  }
  // Promo global
  const promo = profile?.promo;
  if (promo && promo.skinIds.includes(skinId)) {
    const others = promo.skinIds.filter(id => id !== skinId);
    const owned = shopOwnedSet();
    const hasOther = others.length > 0 && others.every(id => owned.has(id));
    if (!hasOther) return promo.price;
  }
  const custom = profile?.customPrices;
  if (custom && custom[skinId] != null) return custom[skinId];
  if (FIXED_SKIN_PRICES[skinId] != null) return FIXED_SKIN_PRICES[skinId];
  return SHOP_PRICE;
}
function shopIsPromo(skinId){
  if (_userPromoActive() && profile.userPromo.skinIds?.includes(skinId)) return true;
  const promo = profile?.promo;
  if (!promo || !promo.skinIds.includes(skinId)) return false;
  const others = promo.skinIds.filter(id => id !== skinId);
  const owned = shopOwnedSet();
  const hasOther = others.length > 0 && others.every(id => owned.has(id));
  return !hasOther;
}
// Preço efetivo de rastro (considera userPromo)
function trailPriceFor(trailId){
  if (_userPromoActive()) {
    const up = profile.userPromo;
    if (up.trailIds && up.trailIds.includes(trailId)) {
      const trail = TRAILS.find(t => t.id === trailId);
      if (trail) return Math.round(trail.price * (1 - (up.discountPct || 0) / 100));
    }
  }
  const trail = TRAILS.find(t => t.id === trailId);
  return trail ? trail.price : 0;
}
function promoTimeLeftLabel(){
  const promo = profile?.promo;
  if (!promo) return '';
  const ms = promo.endsAt - Date.now();
  if (ms <= 0) return '';
  const days = Math.ceil(ms / 86400000);
  return days <= 1 ? 'Termina hoje!' : `Termina em ${days} dias`;
}
let authMode    = 'login'; // 'login' | 'register'



async function apiFetch(path, opts={}){
  const r = await fetch(path, {
    method: opts.method||'GET',
    headers: opts.body ? {'Content-Type':'application/json'} : undefined,
    credentials: 'same-origin',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  return { ok:r.ok, status:r.status, data };
}

async function refreshProfile(){
  const { ok, data } = await apiFetch('/api/me');
  if (!ok || data?.loggedIn === false) return false;
  profile = data;
  currentUser = data.user;
  selectedSkin = data.equippedSkin ?? economy_FREE_SKIN_ID;
  pilotName = currentUser.displayName.toUpperCase();
  document.getElementById('menu-pilot-name').textContent = pilotName;
  document.getElementById('hud-pname').textContent = pilotName;
  updateCreditsBadge();
  updatePilotIconBtn();
  renderSkinGrid();
  applyModeSlotToggle();
  return true;
}

// O slot de modo "Teste"/"Tower Defense" é compartilhado: enquanto o
// torneio está ativo (até 21/06), esse slot vira "Tower Defense"; quando o
// torneio acaba, o slot volta a ser "Teste" automaticamente — sem precisar
// de ação manual, lendo `profile.tournament.active` vindo do servidor.
function applyModeSlotToggle(){
  const btn   = document.getElementById('mode-slot-teste');
  const icon  = document.getElementById('mode-slot-teste-icon');
  const label = document.getElementById('mode-slot-teste-label');
  if (!btn || !icon || !label) return;
  const tournamentOn = !!(profile && profile.tournament && profile.tournament.active);
  if (tournamentOn) {
    btn.dataset.mode = 'tower_defense';
    btn.classList.add('mode-tower-defense');
    btn.classList.remove('mode-teste');
    icon.innerHTML = '<path d="M12 2 L20 7 L20 14 L12 21 L4 14 L4 7 Z"/><path d="M12 2 L12 21 M4 7 L20 14 M20 7 L4 14" opacity=".55"/><circle cx="12" cy="11" r="2.6" fill="currentColor" stroke="none"/>';
    label.textContent = 'Tower Defense';
  } else {
    btn.dataset.mode = 'teste';
    btn.classList.add('mode-teste');
    btn.classList.remove('mode-tower-defense');
    icon.innerHTML = '<rect x="9" y="2" width="6" height="10" rx="1"/><path d="M7 12 L5 20 M17 12 L19 20"/><line x1="5" y1="20" x2="19" y2="20"/>';
    label.textContent = 'Teste';
  }
  // Se o modo selecionado era o do slot que acabou de mudar, realinha a dica.
  if (selectedMode==='teste' || selectedMode==='tower_defense') {
    selectedMode = btn.dataset.mode;
    document.getElementById('mode-tip').textContent = MODE_TIPS[selectedMode]||'';
  }
  renderModeStatus();
}

// ── Tutorial de boas-vindas — guia do piloto para novos usuários ──
// Mostrado uma única vez por conta. Cada step tem uma função `demo` que
// anima o canvas lateral com cenas interativas (nave, tiro, itens, cartas,
// torres, armadilhas) e move o "dedo virtual" para indicar ações.
const TUTORIAL_STEPS = [
  {
    title: 'Bem-vindo, piloto!',
    text: 'Sou seu instrutor de voo. Essa e sua nave — repare nos motores pulsando na popa. Vou te mostrar tudo que precisa saber antes de entrar na arena.',
    actionHint: null,
    demo: _tutDemoShip,
  },
  {
    title: 'Mover e atirar',
    text: 'Segure o BOTAO DIREITO do mouse: sua nave voa ate o cursor. ESPACO dispara automaticamente. A mira segue o cursor — so apontar.',
    actionHint: 'BOTAO DIREITO — mover | ESPACO — atirar',
    demo: _tutDemoMove,
  },
  {
    title: 'Dash — fuga rapida',
    text: 'Enquanto se move, segure SHIFT para um dash explosivo na direcao do movimento. Essencial para escapar de tiros inimigos.',
    actionHint: 'SHIFT — dash',
    demo: _tutDemoDash,
  },
  {
    title: 'Vida, escudo e mana',
    text: 'Barra VERMELHA = vida. AZUL = escudo (absorve dano primeiro). ROXO = mana — gasta ao mover, recarrega parado.',
    actionHint: null,
    demo: _tutDemoBars,
  },
  {
    title: 'Itens — slots 1 a 5',
    text: 'Itens flutuam pela arena. Apanhe-os e pressione 1-5 para usar: curas, escudos, tiros especiais. O slot X e bonus — guarda um item extra.',
    actionHint: 'Teclas 1 2 3 4 5 — usar item | X — slot bonus',
    demo: _tutDemoItems,
  },
  {
    title: 'Cards of Defense — cartas',
    text: 'No modo Cards, ao completar cada level o jogo PAUSA e 3 cartas aparecem. Clique em uma para escolher — ela vai para seu deck permanente e potencializa sua nave.',
    actionHint: 'Clique na carta para escolher',
    demo: _tutDemoCards,
  },
  {
    title: 'Torres de combate',
    text: 'Carta Torre: coloca uma torre aliada na arena. Clique na carta para ativar o modo de deploy, depois clique no mapa onde quer posicionar. A torre atira automaticamente nos inimigos.',
    actionHint: 'Clique no item > Clique na arena',
    demo: _tutDemoTower,
  },
  {
    title: 'Armadilhas',
    text: 'Carta Armadilha: coloca uma armadilha no chao. Inimigos nao conseguem ver — mas quando pisam, explode em area. Posicione nos caminhos mais movimentados.',
    actionHint: 'Clique no item > Clique na arena',
    demo: _tutDemoTrap,
  },
  {
    title: '9 Vidas',
    text: 'No modo Cards voce tem 9 vidas. Ao morrer ressuscita na arena — mas cada vida perdida reduz seu score final. Sobreviva o maximo que puder!',
    actionHint: null,
    demo: _tutDemoLives,
  },
  {
    title: 'Pronto para decolar!',
    text: 'Ganhe creditos, desbloqueie naves e entre para o ranking global. Agora escolha um modo e inicie sua primeira missao. Boa sorte, piloto!',
    actionHint: null,
    demo: _tutDemoReady,
  },
];

let _tutStep = 0;
let _tutAnim = null; // requestAnimationFrame handle da demo atual
let _tutAnimTime = 0;
let _tutAnimStart = 0;

// ── Helpers do canvas de demo ──────────────────────────────────────────────

function _tutGetCtx(){
  const cv = document.getElementById('tut-demo-canvas');
  return cv ? { cv, ctx: cv.getContext('2d') } : null;
}

function _tutRoundRect(ctx, x, y, w, h, r){
  if(ctx.roundRect){ ctx.roundRect(x,y,w,h,r); return; }
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
}

function _tutClear(ctx, cv){
  ctx.clearRect(0, 0, cv.width, cv.height);
  // Fundo escuro da arena
  ctx.fillStyle = '#07111e';
  ctx.fillRect(0, 0, cv.width, cv.height);
  // Grid sutil
  ctx.strokeStyle = 'rgba(0,200,255,0.05)';
  ctx.lineWidth = 0.5;
  for(let x=0;x<cv.width;x+=28){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,cv.height); ctx.stroke(); }
  for(let y=0;y<cv.height;y+=28){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cv.width,y); ctx.stroke(); }
}

function _tutDrawShipAt(ctx, x, y, angle, scale=1, color='#9966ff'){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  // Corpo da nave
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(14, 14);
  ctx.lineTo(0, 8);
  ctx.lineTo(-14, 14);
  ctx.closePath();
  ctx.fill();
  // Cockpit
  ctx.fillStyle = '#ffffff44';
  ctx.beginPath();
  ctx.ellipse(0, -6, 5, 8, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function _tutDrawBullet(ctx, x, y){
  ctx.fillStyle = '#ffee44';
  ctx.shadowColor = '#ffee44';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function _tutDrawEnemy(ctx, x, y, r=16, color='#44ff88'){
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff33';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function _tutMoveFinger(x, y, tap=false){
  const el = document.getElementById('tut-finger');
  if(!el) return;
  el.style.left = (x-10)+'px';
  el.style.top  = (y-8)+'px';
  el.style.display = 'block';
  if(tap){
    el.classList.add('tut-finger--tap');
    setTimeout(()=>el.classList.remove('tut-finger--tap'), 350);
  }
}

function _tutHideFinger(){
  const el = document.getElementById('tut-finger');
  if(el) el.style.display = 'none';
}

function _tutStopAnim(){
  if(_tutAnim){ cancelAnimationFrame(_tutAnim); _tutAnim = null; }
}

function _tutLoop(fn){
  _tutStopAnim();
  _tutAnimStart = performance.now();
  function tick(ts){
    _tutAnimTime = (ts - _tutAnimStart) / 1000;
    fn(_tutAnimTime);
    _tutAnim = requestAnimationFrame(tick);
  }
  _tutAnim = requestAnimationFrame(tick);
}

// ── Funções de demo por step ───────────────────────────────────────────────

function _tutDemoShip(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  _tutHideFinger();
  const cx=cv.width/2, cy=cv.height/2;
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    // Nave girando suavemente
    _tutDrawShipAt(ctx, cx, cy, Math.sin(t*0.4)*0.3, 1.3, '#9966ff');
    // Partículas de propulsão
    for(let i=0;i<6;i++){
      const ag = (Math.PI/2) + (i-2.5)*0.18 + Math.sin(t*3+i)*0.05;
      const d  = 24 + Math.random()*18;
      const px = cx + Math.cos(ag)*d, py = cy + Math.sin(ag)*d + 20;
      const alf = (0.7 - i*0.08) * Math.abs(Math.sin(t*6+i));
      ctx.globalAlpha = Math.max(0, alf);
      ctx.fillStyle = i%2===0 ? '#9966ff' : '#66aaff';
      ctx.beginPath(); ctx.arc(px, py, 3-i*0.3, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Label
    ctx.fillStyle = '#aaaacc';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Sua nave', cx, cy+55);
  });
}

function _tutDemoMove(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  // Trajeto circular do cursor
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    const ang  = t * 0.8;
    const curX = W/2 + Math.cos(ang)*80;
    const curY = H/2 + Math.sin(ang)*60;
    // Linha pontilhada do cursor ate nave
    const shipAng = Math.atan2(curY - H/2, curX - W/2);
    _tutDrawShipAt(ctx, W/2, H/2, shipAng, 1.1, '#9966ff');
    // Cursor (cursor padrão simulado)
    ctx.strokeStyle = '#00d4ff88';
    ctx.lineWidth = 1;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(W/2, H/2); ctx.lineTo(curX, curY); ctx.stroke();
    ctx.setLineDash([]);
    // Tiro saindo
    const phase = (t*2) % 1;
    const bx = W/2 + Math.cos(shipAng) * (22 + phase*80);
    const by = H/2 + Math.sin(shipAng) * (22 + phase*80);
    if(phase < 0.85) _tutDrawBullet(ctx, bx, by);
    // Mover dedo virtual
    const fx = curX * (cv.getBoundingClientRect().width / W);
    const fy = curY * (cv.getBoundingClientRect().height / H);
    _tutMoveFinger(fx, fy);
  });
}

function _tutDemoDash(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    const cycle = t % 2.5;
    let sx, sy, trail;
    if(cycle < 1.5){
      // movendo normal
      sx = 60 + cycle * 40; sy = H/2;
      trail = 0;
    } else {
      // dash — aceleração
      const dt = cycle - 1.5;
      sx = 100 + dt * 220; sy = H/2;
      trail = dt;
    }
    // Rastro de dash
    if(trail > 0){
      for(let i=0;i<8;i++){
        const tx = sx - i*22*trail; const ty = sy;
        ctx.globalAlpha = (0.5 - i*0.06) * trail;
        ctx.fillStyle = '#44aaff';
        ctx.beginPath(); ctx.arc(tx, ty, 12-i, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    _tutDrawShipAt(ctx, sx, sy, 0, 1.1, '#66aaff');
    // Label SHIFT
    if(cycle >= 1.5){
      ctx.fillStyle = '#00d4ff';
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('SHIFT', W/2, H-20);
    }
    _tutHideFinger();
  });
}

function _tutDemoBars(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  _tutHideFinger();
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    const hp  = 0.5 + Math.sin(t*0.7)*0.35;
    const sh  = 0.7 + Math.sin(t*0.5+1)*0.2;
    const mn  = 0.4 + Math.abs(Math.sin(t*0.4))*0.5;
    const bw=180, bh=14, bx=(W-bw)/2;
    // Vida
    ctx.fillStyle='#1a0808'; ctx.fillRect(bx,60,bw,bh);
    ctx.fillStyle='#ff4455'; ctx.fillRect(bx,60,bw*hp,bh);
    ctx.strokeStyle='#ff4455aa'; ctx.lineWidth=1; ctx.strokeRect(bx,60,bw,bh);
    ctx.fillStyle='#fff'; ctx.font='10px system-ui'; ctx.textAlign='left';
    ctx.fillText('VIDA',bx+4,72);
    // Escudo
    ctx.fillStyle='#08081a'; ctx.fillRect(bx,84,bw,bh);
    ctx.fillStyle='#4488ff'; ctx.fillRect(bx,84,bw*sh,bh);
    ctx.strokeStyle='#4488ffaa'; ctx.lineWidth=1; ctx.strokeRect(bx,84,bw,bh);
    ctx.fillStyle='#fff'; ctx.fillText('ESCUDO',bx+4,96);
    // Mana
    ctx.fillStyle='#0a0818'; ctx.fillRect(bx,108,bw,bh);
    ctx.fillStyle='#aa44ff'; ctx.fillRect(bx,108,bw*mn,bh);
    ctx.strokeStyle='#aa44ffaa'; ctx.lineWidth=1; ctx.strokeRect(bx,108,bw,bh);
    ctx.fillStyle='#fff'; ctx.fillText('MANA',bx+4,120);
    // Nave pequena com seta apontando pro HUD
    _tutDrawShipAt(ctx, W/2, H-60, -Math.PI/2, 0.9, '#9966ff');
    ctx.strokeStyle='#ffffff33'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(W/2,H-75); ctx.lineTo(W/2,130); ctx.stroke();
    ctx.setLineDash([]);
  });
}

function _tutDemoItems(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  const slots = [
    { label:'1', color:'#ff6688', x:30 },
    { label:'2', color:'#44aaff', x:75 },
    { label:'3', color:'#ffcc44', x:120 },
    { label:'4', color:'#44ff88', x:165 },
    { label:'5', color:'#aa44ff', x:210 },
  ];
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    // Item flutuando na arena
    const ix = W/2+Math.cos(t*0.6)*50, iy = 70+Math.sin(t*1.2)*12;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffcc44'; ctx.shadowColor='#ffcc44'; ctx.shadowBlur=14;
    ctx.beginPath(); ctx.arc(ix, iy, 10, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.globalAlpha=1;
    ctx.fillStyle='#fff'; ctx.font='bold 10px system-ui'; ctx.textAlign='center';
    ctx.fillText('★', ix, iy+4);
    // Slots de itens na parte de baixo
    const activeSlot = Math.floor(t/1.8) % slots.length;
    slots.forEach((s,i)=>{
      const active = i===activeSlot;
      ctx.fillStyle = active ? s.color+'cc' : '#11223344';
      ctx.strokeStyle = active ? s.color : s.color+'55';
      ctx.lineWidth = active ? 2 : 1;
      ctx.shadowColor = active ? s.color : 'transparent';
      ctx.shadowBlur = active ? 16 : 0;
      ctx.beginPath();
      _tutRoundRect(ctx, s.x, H-54, 40, 40, 6);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      ctx.fillStyle = active ? '#fff' : s.color+'99';
      ctx.font = (active ? 'bold ' : '') + '11px system-ui';
      ctx.textAlign='center';
      ctx.fillText(s.label, s.x+20, H-28);
    });
    // Dedo apontando para o slot ativo
    const activeS = slots[activeSlot];
    const rect = document.getElementById('tut-demo-canvas')?.getBoundingClientRect();
    if(rect){
      const scaleX = rect.width/W, scaleY = rect.height/H;
      _tutMoveFinger((activeS.x+20)*scaleX, (H-30)*scaleY, true);
    }
    _tutDrawShipAt(ctx, W/2, H/2-10, -Math.PI/2, 0.9, '#9966ff');
  });
}

function _tutDemoCards(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  const cards = [
    { label:'CASCO DE\nFERRO', color:'#00ff88', icon:'shield' },
    { label:'NUCLEO\nVELOZ', color:'#44aaff', icon:'rapid' },
    { label:'TIRO\nVAMPIRO', color:'#ff66aa', icon:'vamp' },
  ];
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    // Overlay escuro como no jogo
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,0,W,H);
    // Titulo "ESCOLHA UMA CARTA"
    ctx.fillStyle = '#00d4ff';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('ESCOLHA UMA CARTA', W/2, 22);
    // 3 cartas
    const cardW=72, cardH=100, gap=8;
    const totalW = 3*cardW + 2*gap;
    const startX = (W-totalW)/2;
    const hoveredIdx = Math.floor((t*0.5) % 3);
    cards.forEach((c,i)=>{
      const cx = startX + i*(cardW+gap);
      const cy = 30;
      const hovered = i===hoveredIdx;
      const cy2 = cy + (hovered ? -6 : 0);
      ctx.fillStyle = hovered ? c.color+'33' : '#0d1e3299';
      ctx.strokeStyle = hovered ? c.color : c.color+'55';
      ctx.lineWidth = hovered ? 2 : 1;
      ctx.shadowColor = hovered ? c.color : 'transparent';
      ctx.shadowBlur = hovered ? 20 : 0;
      ctx.beginPath(); _tutRoundRect(ctx, cx, cy2, cardW, cardH, 8); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      // Icone simples por tipo
      ctx.strokeStyle = c.color; ctx.lineWidth=2; ctx.fillStyle=c.color+'44';
      if(c.icon==='shield'){
        ctx.beginPath(); ctx.moveTo(cx+36,cy2+18); ctx.lineTo(cx+56,cy2+26); ctx.lineTo(cx+56,cy2+46); ctx.lineTo(cx+36,cy2+56); ctx.lineTo(cx+16,cy2+46); ctx.lineTo(cx+16,cy2+26); ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if(c.icon==='rapid'){
        for(let j=0;j<3;j++){ ctx.beginPath(); ctx.moveTo(cx+22+j*8,cy2+20); ctx.lineTo(cx+22+j*8,cy2+50); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(cx+16,cy2+30); ctx.lineTo(cx+56,cy2+30); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(cx+36,cy2+35,14,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.fillStyle=c.color; ctx.fillText('♥', cx+33, cy2+39);
      }
      // Label
      ctx.fillStyle = hovered ? '#fff' : c.color+'cc';
      ctx.font = (hovered?'bold ':'')+'9px system-ui';
      ctx.textAlign='center';
      const lines=c.label.split('\n');
      lines.forEach((l,li)=> ctx.fillText(l, cx+36, cy2+68+li*13));
    });
    // Dedo apontando para a carta em hover
    const hi = hoveredIdx;
    const hcx = startX + hi*(cardW+gap) + cardW/2;
    const hcy = 90;
    const rect = document.getElementById('tut-demo-canvas')?.getBoundingClientRect();
    if(rect){
      const scaleX = rect.width/W, scaleY = rect.height/H;
      _tutMoveFinger(hcx*scaleX, hcy*scaleY, Math.sin(t*3)>0.8);
    }
  });
}

function _tutDemoTower(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    const phase = t % 4;
    // Fase 0-1: click no item do slot
    // Fase 1-3: arrastar e posicionar
    // Fase 3-4: torre atira
    if(phase < 1){
      // Slot de item brilhando
      const px=W/2-30, py=H-54;
      ctx.fillStyle='#00ddff44';
      ctx.strokeStyle='#00ddff';
      ctx.lineWidth=2;
      ctx.shadowColor='#00ddff'; ctx.shadowBlur=16;
      ctx.beginPath(); _tutRoundRect(ctx,px,py,44,44,6); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
      // Icone torre
      ctx.strokeStyle='#00ddff'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(W/2,py+8); ctx.lineTo(W/2,py+36); ctx.stroke();
      ctx.beginPath(); ctx.arc(W/2,py+14,8,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.font='9px system-ui'; ctx.textAlign='center';
      ctx.fillText('TORRE', W/2, py+48);
      const rect = document.getElementById('tut-demo-canvas')?.getBoundingClientRect();
      if(rect) _tutMoveFinger((W/2)*(rect.width/W), (py+22)*(rect.height/H), phase>0.5);
    } else if(phase < 3){
      // Cursor movendo para posicionar
      const progr = (phase-1)/2;
      const tx = 80 + progr*100, ty = 100;
      ctx.strokeStyle='#00ddff66'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.arc(tx,ty,30,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#00ddff22'; ctx.beginPath(); ctx.arc(tx,ty,30,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#00ddff'; ctx.font='10px system-ui'; ctx.textAlign='center';
      ctx.fillText('posicionar aqui', tx, ty+45);
      const rect = document.getElementById('tut-demo-canvas')?.getBoundingClientRect();
      if(rect) _tutMoveFinger(tx*(rect.width/W), ty*(rect.height/H), phase>2.5);
      _tutHideFinger();
      const rect2 = document.getElementById('tut-demo-canvas')?.getBoundingClientRect();
      if(rect2) _tutMoveFinger(tx*(rect2.width/W), ty*(rect2.height/H), phase>2.5);
    } else {
      // Torre disparando
      const tx=80+50, ty=100;
      // Base octagonal da torre
      ctx.fillStyle='#0d1e32'; ctx.strokeStyle='#00ddff'; ctx.lineWidth=2;
      ctx.beginPath();
      for(let i=0;i<8;i++){ const a=i*Math.PI/4; ctx[i?'lineTo':'moveTo'](tx+18*Math.cos(a),ty+18*Math.sin(a)); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Canhao giratório
      const canAng = t*2;
      ctx.strokeStyle='#00ddff'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+Math.cos(canAng)*24,ty+Math.sin(canAng)*24); ctx.stroke();
      // Projetil
      const projPhase=(t*2.5)%1;
      ctx.fillStyle='#00ddff'; ctx.shadowColor='#00ddff'; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.arc(tx+Math.cos(canAng)*(24+projPhase*80),ty+Math.sin(canAng)*(24+projPhase*80),3,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      // Inimigo
      _tutDrawEnemy(ctx, 230, 180, 14, '#44ff88');
      _tutHideFinger();
    }
    _tutDrawShipAt(ctx, W-50, H-50, -Math.PI/2, 0.8, '#9966ff');
  });
}

function _tutDemoTrap(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    const phase = t % 4;
    if(phase < 1.8){
      // Posicionando armadilha
      const progr = Math.min(1, phase/1.5);
      const tx=W/2+20, ty=H/2-10;
      ctx.strokeStyle='#aa44ff66'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.arc(tx,ty,22,0,Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#aa44ff22'; ctx.beginPath(); ctx.arc(tx,ty,22,0,Math.PI*2); ctx.fill();
      if(progr>0.9){
        // Hexagono colocado
        ctx.strokeStyle='#aa44ff'; ctx.lineWidth=2;
        ctx.shadowColor='#aa44ff'; ctx.shadowBlur=10;
        ctx.beginPath();
        for(let i=0;i<6;i++){ const a=i*Math.PI/3-Math.PI/6; ctx[i?'lineTo':'moveTo'](tx+10*Math.cos(a),ty+10*Math.sin(a)); }
        ctx.closePath(); ctx.stroke();
        ctx.shadowBlur=0;
      }
      const rect = document.getElementById('tut-demo-canvas')?.getBoundingClientRect();
      if(rect) _tutMoveFinger(tx*(rect.width/W), ty*(rect.height/H), phase>1.5);
    } else {
      // Inimigo pisando -> explosão
      const ep = (phase-1.8)/2.2;
      const ex = 180-ep*80, ey=H/2-10;
      const tx=W/2+20, ty=H/2-10;
      // Hexagono pulsando
      ctx.strokeStyle='#aa44ff'; ctx.lineWidth=2*(1-ep);
      ctx.beginPath();
      for(let i=0;i<6;i++){ const a=i*Math.PI/3-Math.PI/6; ctx[i?'lineTo':'moveTo'](tx+10*Math.cos(a),ty+10*Math.sin(a)); }
      ctx.closePath(); ctx.stroke();
      if(ep > 0.6){
        // Explosao
        const burst = (ep-0.6)/0.4;
        ctx.strokeStyle=`rgba(170,68,255,${1-burst})`;
        ctx.lineWidth=3;
        ctx.shadowColor='#aa44ff'; ctx.shadowBlur=20*burst;
        for(let i=0;i<8;i++){
          const a=i*Math.PI/4; const d=burst*60;
          ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(tx+Math.cos(a)*d,ty+Math.sin(a)*d); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(tx,ty,burst*50,0,Math.PI*2); ctx.stroke();
        ctx.shadowBlur=0;
      } else {
        _tutDrawEnemy(ctx, ex, ey, 14, '#44ff88');
      }
      _tutHideFinger();
    }
    _tutDrawShipAt(ctx, 40, H-50, -Math.PI/2, 0.8, '#9966ff');
  });
}

function _tutDemoLives(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  _tutHideFinger();
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    const livesLeft = Math.max(0, 9 - Math.floor(t/1.5));
    // HUD de vidas
    ctx.fillStyle='#fff';
    ctx.font='bold 13px system-ui';
    ctx.textAlign='center';
    ctx.fillText('VIDAS', W/2, 30);
    // Corações / circulos
    for(let i=0;i<9;i++){
      const alive = i < livesLeft;
      const lx = (W/2 - 4*22) + i*22, ly=50;
      ctx.fillStyle = alive ? '#ff4466' : '#33333388';
      ctx.strokeStyle = alive ? '#ff4466' : '#55555566';
      ctx.lineWidth=1;
      ctx.shadowColor = alive ? '#ff4466' : 'transparent';
      ctx.shadowBlur = alive ? 10 : 0;
      ctx.beginPath(); ctx.arc(lx,ly,8,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur=0;
    }
    // Nave respawnando
    if(livesLeft > 0){
      const ry = H/2 + Math.sin(t*0.5)*20;
      _tutDrawShipAt(ctx, W/2, ry, 0, 1.1, '#9966ff');
      ctx.fillStyle='#9966ff66'; ctx.font='10px system-ui'; ctx.textAlign='center';
      ctx.fillText('RESPAWN', W/2, H-20);
    } else {
      ctx.fillStyle='#ff4444'; ctx.font='bold 14px system-ui'; ctx.textAlign='center';
      ctx.fillText('GAME OVER', W/2, H/2+40);
      ctx.fillStyle='#aaaacc'; ctx.font='10px system-ui';
      ctx.fillText('Score salvo no ranking', W/2, H/2+58);
    }
  });
}

function _tutDemoReady(){
  const r = _tutGetCtx(); if(!r) return;
  const {cv, ctx} = r;
  const W=cv.width, H=cv.height;
  _tutHideFinger();
  _tutLoop(t=>{
    _tutClear(ctx, cv);
    // Multiplas naves orbitando
    const naves = ['#9966ff','#66aaff','#44ff88','#ffcc44','#ff6688'];
    naves.forEach((c,i)=>{
      const a = t*0.5 + i*(Math.PI*2/naves.length);
      const r = 80;
      const nx = W/2+Math.cos(a)*r, ny=H/2+Math.sin(a)*r;
      _tutDrawShipAt(ctx, nx, ny, a+Math.PI/2, 0.7, c);
    });
    // Texto central
    ctx.fillStyle='#00d4ff';
    ctx.font='bold 14px system-ui';
    ctx.textAlign='center';
    ctx.fillText('BOA SORTE', W/2, H/2-8);
    ctx.fillStyle='#aaaacc'; ctx.font='10px system-ui';
    ctx.fillText('PILOTO!', W/2, H/2+10);
    // Estrelas ao redor
    for(let i=0;i<20;i++){
      const sa=i*Math.PI*2/20+t*0.1;
      const sd=110+Math.sin(t+i)*8;
      const sx=W/2+Math.cos(sa)*sd, sy=H/2+Math.sin(sa)*sd;
      ctx.globalAlpha=0.4+Math.sin(t*2+i)*0.3;
      ctx.fillStyle='#ffffff';
      ctx.fillRect(sx-1,sy-1,2,2);
    }
    ctx.globalAlpha=1;
  });
}

// ── Renderização e controle do tutorial ───────────────────────────────────

function _renderTutorialStep(){
  const step = TUTORIAL_STEPS[_tutStep];
  document.getElementById('tut-step-label').textContent = `PASSO ${_tutStep+1} / ${TUTORIAL_STEPS.length}`;
  document.getElementById('tut-title').textContent = step.title;
  document.getElementById('tut-text').textContent = step.text;
  document.getElementById('tut-next-btn').textContent = (_tutStep === TUTORIAL_STEPS.length-1) ? 'COMECAR' : 'PROXIMO';
  // Hint de acao
  const hintEl = document.getElementById('tut-action-hint');
  if(step.actionHint){
    hintEl.textContent = step.actionHint;
    hintEl.style.display = 'block';
  } else {
    hintEl.style.display = 'none';
  }
  // Dots de progresso
  const dotsEl = document.getElementById('tut-dots');
  dotsEl.innerHTML = '';
  for (let i=0;i<TUTORIAL_STEPS.length;i++){
    const d = document.createElement('div');
    d.className = 'tut-dot' + (i===_tutStep ? ' active' : '');
    dotsEl.appendChild(d);
  }
  // Demo animada
  _tutStopAnim();
  _tutHideFinger();
  if(step.demo) step.demo();
}

window.nextTutorialStep = function(){
  if (_tutStep < TUTORIAL_STEPS.length-1) {
    _tutStep++;
    _renderTutorialStep();
  } else {
    finishTutorial();
  }
};
window.skipTutorial = function(){ finishTutorial(); };

function finishTutorial(){
  _tutStopAnim();
  _tutHideFinger();
  document.getElementById('tutorial-overlay').style.display = 'none';
}

function maybeShowTutorial(){
  if (!profile || profile.tutorialSeen) return;
  // Marca como visto ao EXIBIR: se der F5 no meio, nao reaparece do zero
  profile.tutorialSeen = true;
  if (currentUser) apiFetch('/api/profile/tutorial-seen', { method:'POST' }).catch(()=>{});
  _tutStep = 0;
  _renderTutorialStep();
  document.getElementById('tutorial-overlay').style.display = 'flex';
}

// ── Aviso de novo modo de jogo — exibido quando há um modo recém-lançado
// que o jogador ainda não viu (controlado por NEW_MODE_ANNOUNCEMENTS abaixo
// + lista `seenNewModes` salva localmente por conta).
const NEW_MODE_ANNOUNCEMENTS = [
  {
    id: 'tower_defense_v1',
    mode: 'tower_defense',
    title: 'Torneio Tower Defense chegou!',
    text: 'Um novo modo por tempo limitado: equipes 2x2 online disputam o controle de uma torre central. Destrua a torre do adversário antes que destruam a sua — e quem vencer leva a skin exclusiva "Stealwing"!',
    icon: '<path d="M12 2 L20 7 L20 14 L12 21 L4 14 L4 7 Z"/><path d="M12 2 L12 21 M4 7 L20 14 M20 7 L4 14" opacity=".55"/><circle cx="12" cy="11" r="2.6" fill="currentColor" stroke="none"/>',
  },
];

function _seenNewModesKey(){
  return currentUser ? `arena_seen_new_modes_${currentUser.id}` : null;
}
function _getSeenNewModes(){
  const key = _seenNewModesKey();
  if (!key) return [];
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function _markNewModeSeen(id){
  const key = _seenNewModesKey();
  if (!key) return;
  const seen = _getSeenNewModes();
  if (!seen.includes(id)) { seen.push(id); localStorage.setItem(key, JSON.stringify(seen)); }
}

let _pendingNewModeId = null;
window.closeNewModeAlert = function(){
  document.getElementById('new-mode-overlay').style.display = 'none';
  if (_pendingNewModeId) { _markNewModeSeen(_pendingNewModeId); _pendingNewModeId = null; }
};

function maybeShowNewModeAlert(){
  if (!currentUser) return;
  const seen = _getSeenNewModes();
  // Só anuncia modos que estão de fato disponíveis agora (ex.: torneio ativo)
  const available = NEW_MODE_ANNOUNCEMENTS.find(a => {
    if (seen.includes(a.id)) return false;
    if (a.mode === 'tower_defense') return !!(profile && profile.tournament && profile.tournament.active);
    return true;
  });
  if (!available) return;
  _pendingNewModeId = available.id;
  document.getElementById('nm-title').textContent = available.title;
  document.getElementById('nm-text').textContent = available.text;
  document.getElementById('nm-icon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${available.icon}</svg>`;
  document.getElementById('new-mode-overlay').style.display = 'flex';
}

function updateCreditsBadge(){
  const el = document.getElementById('credits-amount');
  if (el && currentUser) el.textContent = currentUser.credits;
}

// Anima o contador de créditos de `from` até `to` em ~600ms e pulsa o badge.
function animateCreditsGain(from, to) {
  const badgeEl  = document.getElementById('credits-amount');
  const shopEl   = document.getElementById('shop-balance');
  const profileEl= document.getElementById('ps-stat-credits');
  if (!badgeEl) return;

  const duration = 600;
  const start    = performance.now();
  const diff     = to - from;

  function tick(now) {
    const t    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cúbico
    const val  = Math.round(from + diff * ease);
    badgeEl.textContent = val;
    if (shopEl)    shopEl.textContent    = val;
    if (profileEl) profileEl.textContent = val;
    if (t < 1) { requestAnimationFrame(tick); return; }
    // garante valor final exato
    badgeEl.textContent = to;
    if (shopEl)    shopEl.textContent    = to;
    if (profileEl) profileEl.textContent = to;
  }
  requestAnimationFrame(tick);

  // Pulso de brilho no badge do menu
  badgeEl.classList.remove('credits-gain-pulse');
  void badgeEl.offsetWidth;
  badgeEl.classList.add('credits-gain-pulse');
  setTimeout(() => badgeEl.classList.remove('credits-gain-pulse'), 900);
}

function showAuthError(msg){
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideAuthError(){
  document.getElementById('auth-error').style.display='none';
}

const AUTH_ERROR_MESSAGES = {
  invalid_email: 'E-mail inválido.',
  missing_display_name: 'Informe um nome de piloto.',
  weak_password: 'A senha precisa ter pelo menos 6 caracteres.',
  email_taken: 'Este e-mail já está cadastrado.',
  invalid_credentials: 'E-mail ou senha incorretos.',
  invalid_google_token: 'Falha ao verificar conta Google.',
};

window.switchAuthTab = function(mode){
  authMode = mode;
  hideAuthError();
  document.getElementById('auth-tab-login').classList.toggle('active', mode==='login');
  document.getElementById('auth-tab-register').classList.toggle('active', mode==='register');
  document.getElementById('auth-field-name').style.display = mode==='register' ? 'flex' : 'none';
  document.getElementById('auth-submit-btn').textContent = mode==='register'
    ? '►   CRIAR CONTA   ◄' : '►   ENTRAR   ◄';
  document.getElementById('auth-password').setAttribute('autocomplete', mode==='register' ? 'new-password' : 'current-password');
  if (window._showForgotLink) window._showForgotLink(mode === 'login');
};

window.authSubmit = function(ev){
  ev.preventDefault();
  hideAuthError();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const displayName = document.getElementById('auth-name').value.trim();

  const path = authMode==='register' ? '/api/auth/register' : '/api/auth/login';
  const body = authMode==='register' ? { email, password, displayName } : { email, password };

  apiFetch(path, { method:'POST', body }).then(async ({ok, data})=>{
    if (!ok) {
      showAuthError(AUTH_ERROR_MESSAGES[data?.error] || 'Não foi possível continuar. Tente novamente.');
      return;
    }
    await onAuthSuccess();
  });
  return false;
};

window.onGoogleCredential = function(response){
  hideAuthError();
  apiFetch('/api/auth/google', { method:'POST', body:{ idToken: response.credential } }).then(async ({ok, data})=>{
    if (!ok) { showAuthError(AUTH_ERROR_MESSAGES[data?.error] || 'Falha no login com Google.'); return; }
    await onAuthSuccess();
  });
};

async function onAuthSuccess(){
  await refreshProfile();
  loadHistory();
  showScreen('menu');
  maybeShowTutorial();
  if (!profile || profile.tutorialSeen) maybeShowNewModeAlert();
  maybeShowCreditBonus();
}

function maybeShowCreditBonus(){
  if (!currentUser) return;
  const key = 'credit_bonus_pack3_v2';
  if (localStorage.getItem(key)) return;
  // Só mostra para quem tem créditos (já comprou antes)
  if (currentUser.credits <= 0) return;
  localStorage.setItem(key, '1');
  showCreditBonusAnimation();
}

function showCreditBonusAnimation(){
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.85);backdrop-filter:blur(6px);
  `;
  overlay.innerHTML = `
    <div style="
      background:linear-gradient(160deg,#0b1e33,#040c18);
      border:2px solid #ffcc44;border-radius:12px;padding:40px 48px;text-align:center;
      max-width:420px;box-shadow:0 0 60px #ffcc4433;animation:bonusCardIn .4s cubic-bezier(.2,.9,.3,1.3);
    ">
      <div style="font-size:48px;margin-bottom:16px;animation:bonusSpin 1s ease-out;">&#127881;</div>
      <div style="font-family:'Press Start 2P',monospace;font-size:13px;color:#ffcc44;letter-spacing:2px;line-height:1.8;margin-bottom:8px;">
        PRESENTE PARA VOCE!
      </div>
      <div style="font-family:'Press Start 2P',monospace;font-size:10px;color:#7aa0c0;line-height:1.8;margin-bottom:20px;">
        Melhoramos o pacote R$ 3,00<br>
        de 240 para <span style="color:#00d4ff;font-size:13px;">280 CR</span><br>
        <span style="color:#00ffaa;">+40 creditos</span> foram adicionados<br>a sua conta como compensacao!
      </div>
      <div id="bonus-cr-display" style="font-family:'Press Start 2P',monospace;font-size:28px;color:#ffcc44;margin-bottom:24px;text-shadow:0 0 20px #ffcc4466;">
        +40 CR
      </div>
      <button onclick="this.closest('div[style*=fixed]').remove()" style="
        font-family:'Press Start 2P',monospace;font-size:9px;letter-spacing:1px;
        background:linear-gradient(135deg,#ffcc00,#ff8800);color:#1a1100;
        border:none;border-radius:6px;padding:14px 32px;cursor:pointer;
        box-shadow:0 4px 20px #ffcc0044;transition:transform .15s;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        RECEBER AGORA
      </button>
    </div>
    <style>
      @keyframes bonusCardIn{from{opacity:0;transform:scale(.7) translateY(30px)}to{opacity:1;transform:none}}
      @keyframes bonusSpin{0%{transform:rotate(-20deg) scale(0)}60%{transform:rotate(10deg) scale(1.2)}100%{transform:rotate(0) scale(1)}}
    </style>
  `;
  document.body.appendChild(overlay);
  // Pulsa o número de créditos na tela principal junto
  setTimeout(() => {
    const prev = currentUser.credits - 40;
    animateCreditsGain(prev, currentUser.credits);
  }, 600);
}

// Carrega o botão Google Sign-In apenas quando necessário (tela de login).
// Chamada só pelo boot() quando não há sessão ativa — evita requisições
// desnecessárias ao Google e o auto-prompt (One Tap) para usuários já logados.
async function setupGoogleSignIn(){
  const { data } = await apiFetch('/api/config');
  const clientId = data && data.googleClientId;
  if (!clientId) return;
  const area = document.getElementById('google-signin-area');
  area.style.display = 'block';
  const onload = document.createElement('div');
  onload.id = 'g_id_onload';
  onload.dataset.client_id = clientId;
  onload.dataset.callback = 'onGoogleCredential';
  onload.dataset.auto_prompt = 'false'; // nunca dispara One Tap automático
  document.getElementById('g_id_signin_container').appendChild(onload);
  const btn = document.createElement('div');
  btn.className = 'g_id_signin';
  btn.dataset.type = 'standard';
  btn.dataset.theme = 'filled_black';
  btn.dataset.size = 'medium';
  document.getElementById('g_id_signin_container').appendChild(btn);
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true; script.defer = true;
  document.head.appendChild(script);
}
// NÃO chama setupGoogleSignIn() aqui — é chamada pelo boot() apenas se não houver sessão.

const MODE_TIPS={
  contra1: 'CONTRA 1 — 5 VIDAS CADA. QUEM PERDER TODAS PRIMEIRO PERDE!',
  contra2: 'CONTRA 2 — 2 INIMIGOS. MANTENHA DISTÂNCIA.',
  equipe_online: 'EQUIPE ONLINE — PvP em times (até 6, 3x3). Primeira equipe a 200 abates vence!',
  livre:   'LIVRE — SEM TIMER. PRATIQUE À VONTADE.',
  teste:   'TESTE — INIMIGOS NÃO ATACAM.',
  tower_defense: 'TORNEIO TOWER DEFENSE — destrua a torre central para conquistá-la! 2x2 online, vencedores ganham a skin exclusiva "Stealwing".',
  cards: 'CARDS OF DEFENSE — PvE cooperativo até 5. Escolha cartas a cada level, sobreviva com suas 9 vidas!',
};

// ── Status dos modos de jogo (badge perto do nome do piloto) ─────
// Fonte única de verdade: tanto o bloqueio de acesso (selectMode/startGame)
// quanto o painel "Status dos Modos" leem essa lista. O slot dinâmico
// Teste/Tower Defense muda de id conforme `profile.tournament.active`
// (mesma regra usada em applyModeSlotToggle).
function modeStatusEntries(){
  const tournamentOn = !!(profile && profile.tournament && profile.tournament.active);
  return [
    { id:'contra1',       label:'Contra 1',              maintenance:_disabledModes.includes('contra1') },
    { id:'contra2',       label:'Contra 2',              maintenance:_disabledModes.includes('contra2') },
    { id:'equipe_online', label:'Equipe Online',         maintenance:_disabledModes.includes('equipe_online') },
    { id:'livre',         label:'Livre',                 maintenance:_disabledModes.includes('livre') },
    tournamentOn
      ? { id:'tower_defense', label:'Torneio Tower Defense', maintenance:_disabledModes.includes('tower_defense') }
      : { id:'teste',         label:'Teste',                 maintenance:_disabledModes.includes('teste') },
    { id:'cards',         label:'Cards of Defense',      maintenance:_disabledModes.includes('cards') },
  ];
}
function isModeInMaintenance(mode){
  return modeStatusEntries().some(m => m.id===mode && m.maintenance);
}

window.closeMaintenanceAlert = function(){
  document.getElementById('maintenance-overlay').style.display = 'none';
};
function showMaintenanceAlert(mode){
  const entry = modeStatusEntries().find(m => m.id===mode);
  document.getElementById('maint-title').textContent = `${entry ? entry.label : 'Este modo'} — em manutenção`;
  document.getElementById('maint-text').textContent =
    'Estamos fazendo ajustes nesse modo e ele está temporariamente fora do ar — não é possível entrar agora. Volte em breve, logo, logo ele estará de volta!';
  document.getElementById('maintenance-overlay').style.display = 'flex';
}

function renderModeStatus(){
  const entries = modeStatusEntries();
  const dot = document.getElementById('mode-status-dot');
  if (dot) dot.classList.toggle('maint', entries.some(m => m.maintenance));
  const list = document.getElementById('mode-status-list');
  if (!list) return;
  list.innerHTML = entries.map(m => `
    <div class="mode-status-row${m.maintenance ? ' maint' : ''}">
      <span class="mode-status-row-dot"></span>
      <span class="mode-status-row-label">${m.label}</span>
      <span class="mode-status-row-state">${m.maintenance ? 'Em manutenção' : 'Operacional'}</span>
    </div>`).join('');
}
window.openModeStatus = function(){
  renderModeStatus();
  document.getElementById('mode-status-modal').style.display = 'flex';
};
window.closeModeStatus = function(){
  document.getElementById('mode-status-modal').style.display = 'none';
};

// Monta o logo do menu letra a letra — cada caractere ganha um delay
// individual (--i) para que o CSS o "atire" na tela em sequência,
// como se o nome do jogo fosse formado por uma rajada de tiros.
function _buildShotText(container, text, startIndex){
  container.innerHTML='';
  let i=startIndex;
  for(const ch of text){
    const span=document.createElement('span');
    const isSpace = ch === ' ' || ch === ' ';
    span.className='mls-letter'+(isSpace?' is-space':'');
    span.style.setProperty('--i', i);
    span.textContent = isSpace ? ' ' : ch;
    container.appendChild(span);
    i++;
  }
  return i;
}
{
  const mainText='TOWER DEFENSE';
  const next=_buildShotText(document.getElementById('mls-line-main'), mainText, 0);
  _buildShotText(document.getElementById('mls-line-sub'), 'ON THE SPACE', next+2);
}

// ── Copa do Mundo — constantes ──
const COPA_END_TS = new Date('2026-06-10T00:00:00Z').getTime(); // desativado
function _isCopaModeActive() { return Date.now() < COPA_END_TS; }

// Estado compartilhado da animação de fundo (deve vir antes de resizeLoginBg)
const _loginBgState = { copaShips: null, ships: null, stars: null, starsW: 0,
  trophyImg: null, trophyLoaded: false, trophyFailed: false };

// ── Fundo arcade animado na tela de login ─────────────────────
const loginBg=document.getElementById('login-bg-canvas');
function resizeLoginBg(){
  const isMob = window.innerWidth < 760;
  const copa  = _isCopaModeActive();
  const screen = document.getElementById('login-screen');
  if (copa && isMob) {
    screen.classList.add('copa-mobile');
    requestAnimationFrame(() => {
      loginBg.width  = loginBg.offsetWidth  || window.innerWidth;
      loginBg.height = loginBg.offsetHeight || Math.round(window.innerWidth * 0.42);
      _loginBgState.copaShips = null;
    });
  } else {
    screen.classList.remove('copa-mobile');
    loginBg.width  = window.innerWidth;
    loginBg.height = window.innerHeight;
    _loginBgState.copaShips = null;
  }
}
resizeLoginBg(); window.addEventListener('resize',resizeLoginBg);

// ── Música da tela inicial: toca 1 vez por sessão/carregamento ─
(function initLoginMusic(){
  const music = document.getElementById('login-music');
  if (!music) return;
  music.volume = 0.5;
  const FLAG = 'arena_login_music_played';

  function tryPlay(){
    if (sessionStorage.getItem(FLAG)) return cleanup();
    // Não checamos mais se a tela de login está visível: contas com sessão
    // salva pulam direto pro menu (showScreen pausa a música antes do 1º
    // gesto) — bloquear aqui faria a música nunca tocar nesses casos, que
    // são a maioria no Android/desktop (no iPhone a sessão raramente
    // persiste, por isso só lá o piloto sempre passava pela tela de login).
    // music.play() funciona normalmente mesmo após showScreen() pausá-la.
    // Só marca como "tocada" e limpa os listeners se o play() realmente
    // for aceito — navegadores como Chrome/Android podem rejeitar a
    // primeira tentativa (gesto não qualificado); deixamos outros gestos
    // tentarem novamente em vez de desistir após a 1ª rejeição.
    music.play().then(()=>{
      sessionStorage.setItem(FLAG, '1');
      cleanup();
    }).catch(()=>{});
  }
  function cleanup(){
    document.removeEventListener('click', tryPlay);
    document.removeEventListener('keydown', tryPlay);
    document.removeEventListener('touchstart', tryPlay);
    ['auth-tab-login','auth-tab-register','auth-submit-btn'].forEach(id=>{
      const el = document.getElementById(id);
      if (el) el.removeEventListener('click', tryPlay);
    });
  }

  if (sessionStorage.getItem(FLAG)) return;
  // Gatilhos genéricos (cobrem o caso comum: 1º toque/clique em qualquer lugar)
  document.addEventListener('click', tryPlay, { once:true });
  document.addEventListener('keydown', tryPlay, { once:true });
  document.addEventListener('touchstart', tryPlay, { once:true });
  // Gatilhos diretos nos botões de ação da tela de login — em alguns
  // navegadores Android/desktop (Chrome), o autoplay de mídia só é liberado
  // por um gesto "qualificado" (toque/clique direto num elemento interativo
  // como um botão); cliques em campos de texto ou eventos genéricos no
  // documento podem não satisfazer a política de autoplay. Os botões abaixo
  // garantem um gesto inequívoco — sem o `once`, pois `tryPlay` já se
  // autolimpa via `cleanup()`/flag de sessão após a 1ª execução bem-sucedida.
  ['auth-tab-login','auth-tab-register','auth-submit-btn'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', tryPlay);
  });
})();

// ── Gera pontos precisos dos contornos da bandeira do Brasil ──
// Retorna 4 arrays de {x,y}: retângulo, losango, círculo, faixa
function _buildBrazilPaths(cx, cy, fw, fh) {
  // fw = largura total da bandeira, fh = altura total
  const ox = cx - fw/2, oy = cy - fh/2;

  // 1. Retângulo verde — perímetro externo
  const N = 300, greenPts = [];
  for (let i = 0; i < N; i++) {
    const r = i / N;
    if      (r < 0.25) greenPts.push({ x: ox + fw*(r/0.25),  y: oy });
    else if (r < 0.5)  greenPts.push({ x: ox + fw,           y: oy + fh*((r-0.25)/0.25) });
    else if (r < 0.75) greenPts.push({ x: ox + fw*(1-(r-0.5)/0.25), y: oy + fh });
    else               greenPts.push({ x: ox,                y: oy + fh*(1-(r-0.75)/0.25) });
  }

  // 2. Losango amarelo — 4 lados do diamante
  // Proporção real: losango ocupa ~83% largura, ~60% altura
  const lw = fw * 0.83, lh = fh * 0.60;
  const M = 300, yellowPts = [];
  for (let i = 0; i < M; i++) {
    const r = i / M;
    if      (r < 0.25) yellowPts.push({ x: cx - lw/2 + lw/2*(r/0.25),  y: cy - lh/2*(1 - r/0.25) + lh/2*(r/0.25) - lh/2 + lh/2*(r/0.25)*2 });
    else if (r < 0.5)  yellowPts.push({ x: cx + lw/2 - lw/2*((r-0.25)/0.25), y: cy + lh/2*((r-0.25)/0.25) });
    else if (r < 0.75) yellowPts.push({ x: cx - lw/2*((r-0.5)/0.25),   y: cy + lh/2 - lh/2*((r-0.5)/0.25)*2 + lh/2*((r-0.5)/0.25) });
    else               yellowPts.push({ x: cx - lw/2 + lw/2*((r-0.75)/0.25), y: cy - lh/2*((r-0.75)/0.25) });
  }
  // Recalcula losango de forma limpa
  const yPts = [];
  for (let i = 0; i < M; i++) {
    const r = i / M;
    // topo-esquerda → topo-direita → baixo-direita → baixo-esquerda → fecha
    if (r < 0.25) {
      const t2 = r / 0.25;
      yPts.push({ x: cx - lw/2 + lw/2*t2, y: cy - lh/2*t2 + cy - cy + lh/2*(t2-1) + cy - lh/2*(1-t2) });
    }
  }
  // Versão simplificada e correta do losango
  const dPts = [];
  const dN = 320;
  for (let i = 0; i < dN; i++) {
    const r = i / dN;
    let x, y;
    if (r < 0.25) {
      const f = r / 0.25;
      x = cx - lw/2 + (lw/2)*f;
      y = cy           - (lh/2)*f;
    } else if (r < 0.5) {
      const f = (r - 0.25) / 0.25;
      x = cx           + (lw/2)*(1-f);
      y = cy - lh/2    + (lh/2)*f*2 - (lh/2)*(1-f);
    } else if (r < 0.75) {
      const f = (r - 0.5) / 0.25;
      x = cx + lw/2    - (lw/2)*f;
      y = cy           + (lh/2)*f;
    } else {
      const f = (r - 0.75) / 0.25;
      x = cx           - (lw/2)*(1-f);
      y = cy + lh/2    - (lh/2)*f*2 + (lh/2)*(1-f);
    }
    dPts.push({ x, y });
  }

  // Losango correto: 4 vértices + interpolação linear entre eles
  const vTop   = { x: cx,        y: cy - lh/2 };
  const vRight = { x: cx + lw/2, y: cy        };
  const vBot   = { x: cx,        y: cy + lh/2 };
  const vLeft  = { x: cx - lw/2, y: cy        };
  const losVerts = [vTop, vRight, vBot, vLeft];
  const losPts = [];
  const losN = 320;
  for (let i = 0; i < losN; i++) {
    const r = i / losN * 4;
    const si = Math.floor(r) % 4;
    const f  = r - Math.floor(r);
    const a  = losVerts[si], b = losVerts[(si+1)%4];
    losPts.push({ x: a.x + (b.x-a.x)*f, y: a.y + (b.y-a.y)*f });
  }

  // 3. Círculo azul
  const rBlue = fh * 0.255;
  const cPts = [];
  const cN = 280;
  for (let i = 0; i < cN; i++) {
    const a = (i / cN) * Math.PI * 2 - Math.PI/2; // começa no topo
    cPts.push({ x: cx + Math.cos(a)*rBlue, y: cy + Math.sin(a)*rBlue });
  }

  // 4. Faixa branca — arco côncavo levemente inclinado
  // Na bandeira real é uma faixa em arco cruzando o círculo de baixo-esquerda p/ cima-direita
  const fPts = [];
  const fN = 120;
  for (let i = 0; i <= fN; i++) {
    const f = i / fN;
    // Arco suave atravessando o diâmetro do círculo com leve curva
    const ax = cx - rBlue*0.92 + rBlue*1.84*f;
    const ay = cy + rBlue*0.22 - rBlue*0.44*f + Math.sin(f*Math.PI)*rBlue*0.08;
    fPts.push({ x: ax, y: ay });
  }

  return [
    { pts: greenPts, color: '#009c3b' },
    { pts: losPts,   color: '#ffdf00' },
    { pts: cPts,     color: '#002776' },
    { pts: fPts,     color: '#ffffff' },
  ];
}

// ── Desenha a bandeira completa preenchida ────────────────────
function _drawBrazilFlag(ctx, cx, cy, fw, fh, alpha, t) {
  ctx.save();
  ctx.globalAlpha = alpha;

  const ox = cx - fw/2, oy = cy - fh/2;
  const lw = fw * 0.83, lh = fh * 0.60;
  const rBlue = fh * 0.255;

  // Sombra geral
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 18;

  // Retângulo verde
  ctx.fillStyle = '#009c3b';
  ctx.beginPath();
  ctx.roundRect(ox, oy, fw, fh, 6);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Losango amarelo
  ctx.fillStyle = '#ffdf00';
  ctx.shadowColor = '#ffdf00'; ctx.shadowBlur = 12 * (0.5 + 0.5*Math.sin(t*1.5));
  ctx.beginPath();
  ctx.moveTo(cx,          cy - lh/2);
  ctx.lineTo(cx + lw/2,   cy       );
  ctx.lineTo(cx,          cy + lh/2);
  ctx.lineTo(cx - lw/2,   cy       );
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Círculo azul
  ctx.fillStyle = '#002776';
  ctx.shadowColor = '#002776'; ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, rBlue, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Faixa branca (arco)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = fh * 0.045;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(cx - rBlue*0.92, cy + rBlue*0.22);
  ctx.quadraticCurveTo(cx, cy + rBlue*0.36, cx + rBlue*0.92, cy - rBlue*0.22);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Texto "ORDEM E PROGRESSO" na faixa branca — minúsculo e legível
  ctx.save();
  ctx.translate(cx, cy + rBlue*0.07);
  ctx.rotate(-0.06);
  ctx.font = `bold ${Math.max(7, fh*0.038)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#002776';
  ctx.shadowBlur = 0;
  ctx.fillText('ORDEM E PROGRESSO', 0, rBlue*0.07);
  ctx.restore();

  // Estrelas no círculo (padrão simplificado — 5 maiores + campo de 22)
  const starData = [
    // [angulo, dist_r, tamanho] — posições aproximadas do céu do Brasil
    [0.5,  0.55, 0.06],[-0.3, 0.62, 0.05],[1.2,  0.48, 0.055],
    [-1.1, 0.50, 0.05],[2.0,  0.40, 0.05],[-2.2, 0.45, 0.055],
    [0.0,  0.30, 0.04],[0.9,  0.25, 0.04],[-0.6, 0.35, 0.04],
    [1.6,  0.58, 0.04],[-1.7, 0.60, 0.04],[2.5,  0.30, 0.04],
    [-2.8, 0.28, 0.04],[0.3,  0.68, 0.035],[-0.9,0.70, 0.035],
    [1.0,  0.72, 0.035],[-1.4, 0.72, 0.035],[2.2,  0.65, 0.035],
    [-2.5, 0.62, 0.035],[3.0,  0.18, 0.03],[-3.0,0.20, 0.03],
    [0.5,  0.12, 0.05],  // estrela central grande
  ];
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 4;
  for (const [ang, dist, sz] of starData) {
    const sx = cx + Math.cos(ang - Math.PI/2) * dist * rBlue;
    const sy = cy + Math.sin(ang - Math.PI/2) * dist * rBlue - rBlue*0.06;
    const sr = sz * rBlue;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Borda fina dourada
  ctx.strokeStyle = 'rgba(255,220,0,0.35)';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.roundRect(ox, oy, fw, fh, 6);
  ctx.stroke();

  ctx.restore();
}

// ── Desenha o troféu FIFA em canvas ──────────────────────────
function _drawFifaTrophy(ctx, cx, cy, scale, t) {
  ctx.save();
  ctx.translate(cx, cy);
  const s = scale;
  const pulse = 0.92 + 0.08 * Math.sin(t * 1.8);

  // Brilho dourado de fundo
  const gGlow = ctx.createRadialGradient(0, -s*0.2, 0, 0, -s*0.2, s*1.1);
  gGlow.addColorStop(0,   `rgba(255,200,0,${0.18*pulse})`);
  gGlow.addColorStop(0.5, `rgba(200,140,0,${0.08*pulse})`);
  gGlow.addColorStop(1,   'transparent');
  ctx.fillStyle = gGlow;
  ctx.beginPath(); ctx.arc(0, -s*0.1, s*1.1, 0, Math.PI*2); ctx.fill();

  // Gradiente dourado para todo o troféu
  const gold1 = (a) => `rgba(255,215,0,${a})`;
  const gold2 = (a) => `rgba(218,165,32,${a})`;
  const gold3 = (a) => `rgba(139,90,0,${a})`;
  const darkG = (a) => `rgba(80,40,0,${a})`;

  function goldGrad(x0,y0,x1,y1) {
    const g = ctx.createLinearGradient(x0,y0,x1,y1);
    g.addColorStop(0,   gold3(1));
    g.addColorStop(0.2, gold1(1));
    g.addColorStop(0.5, `rgba(255,240,150,1)`);
    g.addColorStop(0.75,gold2(1));
    g.addColorStop(1,   gold3(1));
    return g;
  }

  ctx.shadowColor = 'rgba(255,180,0,0.7)';
  ctx.shadowBlur = 30 * pulse;

  // ── Base (pedestal) ──────────────────────────────────────
  // Base inferior larga
  ctx.fillStyle = goldGrad(-s*0.38, s*0.82, s*0.38, s*0.82);
  ctx.beginPath();
  ctx.moveTo(-s*0.38, s*0.96);
  ctx.lineTo( s*0.38, s*0.96);
  ctx.lineTo( s*0.32, s*0.82);
  ctx.lineTo(-s*0.32, s*0.82);
  ctx.closePath(); ctx.fill();

  // Faixa verde na base
  ctx.fillStyle = '#1a6e2e';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(-s*0.30, s*0.865);
  ctx.lineTo( s*0.30, s*0.865);
  ctx.lineTo( s*0.28, s*0.835);
  ctx.lineTo(-s*0.28, s*0.835);
  ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'rgba(255,180,0,0.7)';
  ctx.shadowBlur = 20 * pulse;

  // Pedestal médio
  ctx.fillStyle = goldGrad(-s*0.26, s*0.82, s*0.26, s*0.82);
  ctx.beginPath();
  ctx.moveTo(-s*0.28, s*0.82);
  ctx.lineTo( s*0.28, s*0.82);
  ctx.lineTo( s*0.18, s*0.68);
  ctx.lineTo(-s*0.18, s*0.68);
  ctx.closePath(); ctx.fill();

  // Coluna central (pescoço)
  ctx.fillStyle = goldGrad(-s*0.10, s*0.38, s*0.10, s*0.38);
  ctx.beginPath();
  ctx.moveTo(-s*0.12, s*0.68);
  ctx.lineTo( s*0.12, s*0.68);
  ctx.lineTo( s*0.08, s*0.35);
  ctx.lineTo(-s*0.08, s*0.35);
  ctx.closePath(); ctx.fill();

  // Nó central (bulbo) — esfera achatada no meio do troféu
  ctx.fillStyle = goldGrad(-s*0.22, s*0.42, s*0.22, s*0.52);
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.ellipse(0, s*0.47, s*0.22, s*0.13, 0, 0, Math.PI*2);
  ctx.fill();

  // ── Copa (parte superior) ─────────────────────────────────
  // Corpo da taça — forma trapezoidal com curva no topo
  ctx.fillStyle = goldGrad(-s*0.42, -s*0.55, s*0.42, s*0.35);
  ctx.shadowBlur = 25 * pulse;
  ctx.beginPath();
  ctx.moveTo(-s*0.08, s*0.35);
  ctx.lineTo(-s*0.32, s*0.10);
  ctx.lineTo(-s*0.42, -s*0.10);
  ctx.lineTo(-s*0.38, -s*0.35);
  ctx.bezierCurveTo(-s*0.35, -s*0.60, -s*0.20, -s*0.68, 0, -s*0.70);
  ctx.bezierCurveTo( s*0.20, -s*0.68,  s*0.35, -s*0.60,  s*0.38, -s*0.35);
  ctx.lineTo( s*0.42, -s*0.10);
  ctx.lineTo( s*0.32,  s*0.10);
  ctx.lineTo( s*0.08,  s*0.35);
  ctx.closePath();
  ctx.fill();

  // Reflexo claro na copa (brilho lateral esquerdo)
  const rfl = ctx.createLinearGradient(-s*0.40, -s*0.20, -s*0.05, s*0.10);
  rfl.addColorStop(0, 'rgba(255,255,200,0.45)');
  rfl.addColorStop(1, 'rgba(255,255,200,0)');
  ctx.fillStyle = rfl;
  ctx.beginPath();
  ctx.moveTo(-s*0.08, s*0.35);
  ctx.lineTo(-s*0.32, s*0.10);
  ctx.lineTo(-s*0.42, -s*0.10);
  ctx.lineTo(-s*0.38, -s*0.35);
  ctx.bezierCurveTo(-s*0.35,-s*0.55,-s*0.18,-s*0.62, 0,-s*0.58);
  ctx.lineTo(-s*0.02, s*0.35);
  ctx.closePath();
  ctx.fill();

  // Globo no topo (esfera com continentes esboçados)
  ctx.fillStyle = goldGrad(-s*0.20, -s*0.92, s*0.20, -s*0.52);
  ctx.shadowBlur = 18 * pulse;
  ctx.beginPath();
  ctx.arc(0, -s*0.72, s*0.20, 0, Math.PI*2);
  ctx.fill();

  // Linhas de latitude/longitude no globo
  ctx.strokeStyle = gold3(0.6);
  ctx.lineWidth = s*0.012;
  ctx.shadowBlur = 0;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -s*0.72, s*0.20, s*0.08 + i*s*0.06, 0, 0, Math.PI*2);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, -s*0.72-s*0.20); ctx.lineTo(0, -s*0.72+s*0.20); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -s*0.72, s*0.10, s*0.20, Math.PI*0.4, 0, Math.PI*2); ctx.stroke();

  // Mãos segurando o globo (simplificado como dois volumes curvos)
  ctx.fillStyle = goldGrad(-s*0.28, -s*0.62, s*0.28, -s*0.48);
  ctx.shadowBlur = 12;
  ctx.shadowColor = 'rgba(255,180,0,0.5)';
  // Mão esquerda
  ctx.beginPath();
  ctx.moveTo(-s*0.18, -s*0.50);
  ctx.bezierCurveTo(-s*0.28, -s*0.54, -s*0.26, -s*0.66, -s*0.15, -s*0.68);
  ctx.bezierCurveTo(-s*0.08, -s*0.70, -s*0.04, -s*0.64, -s*0.06, -s*0.56);
  ctx.closePath(); ctx.fill();
  // Mão direita
  ctx.beginPath();
  ctx.moveTo( s*0.18, -s*0.50);
  ctx.bezierCurveTo( s*0.28, -s*0.54,  s*0.26, -s*0.66,  s*0.15, -s*0.68);
  ctx.bezierCurveTo( s*0.08, -s*0.70,  s*0.04, -s*0.64,  s*0.06, -s*0.56);
  ctx.closePath(); ctx.fill();

  // Linha de borda decorativa na copa
  ctx.strokeStyle = gold1(0.5);
  ctx.lineWidth = s*0.018;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(-s*0.38, -s*0.35);
  ctx.lineTo(-s*0.42, -s*0.10);
  ctx.lineTo(-s*0.32,  s*0.10);
  ctx.moveTo( s*0.38, -s*0.35);
  ctx.lineTo( s*0.42, -s*0.10);
  ctx.lineTo( s*0.32,  s*0.10);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Gera caminhos para as naves: contornos da bandeira lado esquerdo ─
function _buildCopaShipPaths(flagCx, flagCy, fw, fh) {
  const lw = fw * 0.83, lh = fh * 0.60;
  const rBlue = fh * 0.255;
  const N = 280;

  // Retângulo externo
  const ox = flagCx - fw/2, oy = flagCy - fh/2;
  const rectPts = [];
  for (let i = 0; i < N; i++) {
    const r = i / N;
    if      (r < 0.25) rectPts.push({ x: ox + fw*(r/0.25),              y: oy });
    else if (r < 0.5)  rectPts.push({ x: ox + fw,                       y: oy + fh*((r-0.25)/0.25) });
    else if (r < 0.75) rectPts.push({ x: ox + fw*(1-(r-0.5)/0.25),      y: oy + fh });
    else               rectPts.push({ x: ox,                             y: oy + fh*(1-(r-0.75)/0.25) });
  }

  // Losango
  const vT={x:flagCx,y:flagCy-lh/2}, vR={x:flagCx+lw/2,y:flagCy}, vB={x:flagCx,y:flagCy+lh/2}, vL={x:flagCx-lw/2,y:flagCy};
  const losPts = [];
  for (let i = 0; i < N; i++) {
    const r = (i/N)*4, si=Math.floor(r)%4, f=r-Math.floor(r);
    const verts=[vT,vR,vB,vL];
    const a=verts[si], b=verts[(si+1)%4];
    losPts.push({ x: a.x+(b.x-a.x)*f, y: a.y+(b.y-a.y)*f });
  }

  // Círculo azul
  const circPts = [];
  for (let i = 0; i < N; i++) {
    const a = (i/N)*Math.PI*2 - Math.PI/2;
    circPts.push({ x: flagCx+Math.cos(a)*rBlue, y: flagCy+Math.sin(a)*rBlue });
  }

  return [
    { pts: rectPts, color: '#009c3b', label: 'rect'  },
    { pts: losPts,  color: '#ffdf00', label: 'losang' },
    { pts: circPts, color: '#4466ff', label: 'circ'   },
  ];
}

(function animateLoginBg(){
  try {
    const ctx = loginBg.getContext('2d');
    const W = loginBg.width||window.innerWidth, H = loginBg.height||window.innerHeight;
    if (W<2||H<2) { requestAnimationFrame(animateLoginBg); return; }
    const t = Date.now()/1000;

    // ── Fundo ──────────────────────────────────────────────────
    ctx.fillStyle='#020508'; ctx.fillRect(0,0,W,H);
    const gn=ctx.createRadialGradient(W/2,H*0.42,0,W/2,H*0.42,Math.min(W,H)*0.55);
    gn.addColorStop(0,'rgba(0,80,120,0.18)'); gn.addColorStop(0.4,'rgba(0,40,80,0.08)'); gn.addColorStop(1,'transparent');
    ctx.fillStyle=gn; ctx.fillRect(0,0,W,H);

    // Grade neon
    const gs=60, gp=0.3+0.2*Math.sin(t*0.7);
    ctx.strokeStyle='#001428'; ctx.lineWidth=0.6; ctx.globalAlpha=gp;
    for (let x=0;x<W;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for (let y=0;y<H;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.globalAlpha=1;

    // Estrelas
    if (!_loginBgState.stars || _loginBgState.starsW!==W) {
      _loginBgState.starsW=W;
      _loginBgState.stars=Array.from({length:160},()=>({
        x:Math.random()*W,y:Math.random()*H,
        r:Math.random()*1.5+0.2,a:Math.random()*0.6+0.1,
        sp:0.3+Math.random()*1.2,bk:Math.random()*Math.PI*2,px:Math.random()<0.12,
      }));
    }
    for (const s of _loginBgState.stars) {
      const a=s.a*(0.4+0.6*Math.sin(t*s.sp+s.bk));
      ctx.fillStyle=`rgba(140,200,255,${a})`;
      if(s.px) ctx.fillRect(s.x-s.r,s.y-s.r,s.r*2,s.r*2);
      else { ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); }
    }

    // ── Naves passando ────────────────────────────────────────
    if (!_loginBgState.ships) _loginBgState.ships = [];
    const ships = _loginBgState.ships;
    if (Math.random()<0.012 && ships.length<4 && SKINS.length) {
      const dir=Math.random()<0.5?1:-1, depth=0.5+Math.random()*0.9;
      ships.push({ x:dir>0?-70:W+70, y:H*(0.12+Math.random()*0.6), dir, depth,
        speed:(40+Math.random()*70)*dir, skin:SKINS[Math.floor(Math.random()*SKINS.length)],
        bob:Math.random()*Math.PI*2, trail:[] });
    }
    for (let i=ships.length-1;i>=0;i--) {
      const s=ships[i];
      s.x+=s.speed*(1/60);
      const yy=s.y+Math.sin(t*1.6+s.bob)*6, sz=15*s.depth;
      s.trail.push({x:s.x,y:yy}); if(s.trail.length>16) s.trail.shift();
      const hue=s.skin.color||'#5be8ff';
      ctx.save();
      for (let k=0;k<s.trail.length;k++){
        const p=s.trail[k],a=(k/s.trail.length);
        ctx.fillStyle=hue; ctx.globalAlpha=(0.3*s.depth+0.12)*a*0.5;
        ctx.beginPath(); ctx.arc(p.x-s.dir*sz*0.9,p.y,sz*0.32*a,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(s.x,yy); ctx.rotate(s.dir>0?Math.PI/2:-Math.PI/2);
      ctx.globalAlpha=0.18*s.depth;
      ctx.shadowColor=hue; ctx.shadowBlur=14*s.depth;
      s.skin.drawPreview(ctx,(sz*2)/s.skin._size);
      ctx.restore();
      ctx.save();
      ctx.translate(s.x,yy); ctx.rotate(s.dir>0?Math.PI/2:-Math.PI/2);
      ctx.globalCompositeOperation='multiply';
      ctx.globalAlpha=0.55*s.depth+0.25;
      s.skin.drawPreview(ctx,(sz*2)/s.skin._size);
      ctx.restore(); ctx.globalAlpha=1;
      if((s.dir>0&&s.x>W+90)||(s.dir<0&&s.x<-90)) ships.splice(i,1);
    }

    // Scanlines
    ctx.globalAlpha=0.03; ctx.fillStyle='#000';
    for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
    ctx.globalAlpha=1;
  } catch(e) { console.warn('[Login BG]',e); }
  requestAnimationFrame(animateLoginBg);
})();

// ── Skin grid no menu (bloqueada/desbloqueada conforme posse) ─
const grid=document.getElementById('skin-grid');
function renderSkinGrid(){
  const owned = new Set(profile ? profile.ownedSkins : [economy_FREE_SKIN_ID]);
  const equipped = profile ? profile.equippedSkin : economy_FREE_SKIN_ID;
  grid.innerHTML='';
  // Agrupa: equipada primeiro, depois as demais já desbloqueadas (compradas
  // ou ganhas — ficam lado a lado nas primeiras linhas), por fim as bloqueadas.
  // Assim, toda skin nova que o piloto destrava aparece junto das outras já
  // ativas, em vez de espalhada entre as bloqueadas.
  const rank = (s)=> s.id===equipped ? 0 : (owned.has(s.id) ? 1 : 2);
  const ordered = [...SKINS].sort((a,b)=> rank(a)-rank(b));
  ordered.forEach(skin=>{
    const isOwned = owned.has(skin.id);
    const isEquipped = skin.id===equipped;
    if (isEquipped) selectedSkin = skin.id;
    const card=document.createElement('div');
    card.className='skin-card'+(isEquipped?' active':'')+(isOwned?'':' locked');
    card.dataset.id=skin.id;
    const cv=document.createElement('canvas'); cv.width=cv.height=42;
    const cctx=cv.getContext('2d');
    function drawCard(){cctx.clearRect(0,0,42,42);cctx.save();cctx.translate(21,21);skin.drawPreview(cctx,42/skin._size);cctx.restore();}
    if(skin.img){skin.img.onload=drawCard;setTimeout(drawCard,300);}
    drawCard();
    const info=document.createElement('div');
    info.className='skin-info';
    const isRewardOnly = REWARD_ONLY_SKIN_IDS.includes(skin.id);
    info.innerHTML = isOwned
      ? `<div class="skin-name">${skin.name}</div><div class="skin-sub">${skin.color.toUpperCase()}</div>`
      : isRewardOnly
        ? `<div class="skin-name">${skin.name}</div><div class="skin-sub skin-price">EXCLUSIVA</div>`
        : `<div class="skin-name">${skin.name}</div><div class="skin-sub skin-price">${shopPriceFor(skin.id)} CR</div>`;
    card.append(cv,info);
    card.onclick=()=> {
      if (isOwned) return equipSkin(skin.id);
      if (isRewardOnly) return showNotify('Skin exclusiva de evento');
      openShopAt(skin.id);
    };
    grid.appendChild(card);
  });
}

// ── Loja: carrossel de naves (esquerda → direita, vitrine na direita) ──
// ── Ícones de perfil (sistema separado das skins de nave — todo
// jogador escolhe livremente, sem custo nem posse) ────────────
function currentProfileIconId(){
  return profile ? (profile.profileIcon||0) : 0;
}

// Renderiza o ícone (ilustração canvas) dentro de `el`, substituindo
// qualquer conteúdo anterior — usado no botão do piloto e no seletor.
function _renderIconInto(el, iconId, px){
  el.innerHTML = '';
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  cv.style.width = cv.style.height = '100%';
  drawProfileIcon(cv.getContext('2d'), iconId, px, px);
  el.appendChild(cv);
}

function updatePilotIconBtn(){
  const btn = document.getElementById('pilot-icon-btn');
  if (btn) _renderIconInto(btn, currentProfileIconId(), 44);
}

window.openIconPicker = function(){
  if (!currentUser) return;
  const grid = document.getElementById('icon-picker-grid');
  const equipped = currentProfileIconId();
  grid.innerHTML = '';
  PROFILE_ICON_DEFS.forEach((_, idx)=>{
    const item = document.createElement('div');
    item.className = 'icon-picker-item'+(idx===equipped?' active':'');
    item.onclick = ()=> setProfileIcon(idx);
    _renderIconInto(item, idx, 64);
    grid.appendChild(item);
  });
  document.getElementById('icon-picker-overlay').classList.add('show');
};

window.closeIconPicker = function(){
  document.getElementById('icon-picker-overlay').classList.remove('show');
};

window.setProfileIcon = async function(iconId){
  const { ok, data } = await apiFetch('/api/profile/icon', { method:'POST', body:{ iconId } });
  if (ok && data) {
    profile.profileIcon = data.profileIcon;
    updatePilotIconBtn();
    closeIconPicker();
  }
};

window.openNameEdit = function(){
  if (!currentUser) return;
  const input = document.getElementById('name-edit-input');
  input.value = currentUser.displayName || '';
  document.getElementById('name-edit-error').style.display = 'none';
  document.getElementById('name-edit-overlay').classList.add('show');
  input.focus();
};

window.closeNameEdit = function(){
  document.getElementById('name-edit-overlay').classList.remove('show');
};

window.saveNameEdit = async function(){
  const input = document.getElementById('name-edit-input');
  const errorEl = document.getElementById('name-edit-error');
  const displayName = input.value.trim();
  if (!displayName) {
    errorEl.textContent = 'Digite um nome.';
    errorEl.style.display = '';
    return;
  }
  const { ok, data } = await apiFetch('/api/profile/name', { method:'POST', body:{ displayName } });
  if (ok && data) {
    currentUser.displayName = data.displayName;
    pilotName = data.displayName.toUpperCase();
    document.getElementById('menu-pilot-name').textContent = pilotName;
    closeNameEdit();
  } else {
    errorEl.textContent = 'Não foi possível salvar o nome. Tente novamente.';
    errorEl.style.display = '';
  }
};

let shopSelectedId = null;

window.equipSkin = async function(skinId){
  if (!currentUser) return;
  const { ok, data } = await apiFetch('/api/shop/equip', { method:'POST', body:{ skinId } });
  if (ok && data) {
    profile.equippedSkin = data.equippedSkin;
    currentUser.equippedSkin = data.equippedSkin;
    selectedSkin = data.equippedSkin;
    renderSkinGrid();
  }
};

function shopOwnedSet(){
  return new Set(profile ? profile.ownedSkins : [economy_FREE_SKIN_ID]);
}

function shopAvailableSkins(){
  // A vitrine só mostra naves que o piloto ainda não possui — comprar o que já se tem não faz sentido.
  // Skins de recompensa/evento nunca aparecem para compra.
  const owned = shopOwnedSet();
  return SKINS.filter(s=>!owned.has(s.id) && !REWARD_ONLY_SKIN_IDS.includes(s.id));
}

function buildShopTrack(){
  const track = document.getElementById('shop-track');
  track.innerHTML = '';
  const available = shopAvailableSkins();

  if (!available.length) {
    track.innerHTML = `<div class="shop-track-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 16 L7 6 L17 6 L19 16 Z"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></svg>
      <span>Você já desbloqueou todas as naves disponíveis!</span>
    </div>`;
    return;
  }

  const classics = available.filter(s=>!s.isArcade);
  const arcades  = available.filter(s=>s.isArcade);
  let i = 0;

  function appendCard(skin){
    const card = document.createElement('div');
    card.className = 'shop-card' + (skin.id===shopSelectedId ? ' selected' : '');
    card.dataset.id = skin.id;
    card.style.setProperty('--i', i++);
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cctx = cv.getContext('2d');
    function draw(){
      cctx.clearRect(0,0,64,64);
      cctx.save(); cctx.translate(32,32);
      skin.drawPreview(cctx, 64/skin._size);
      cctx.restore();
    }
    if (skin.img){ skin.img.onload=draw; setTimeout(draw,300); }
    draw();
    const name = document.createElement('div');
    name.className = 'shop-card-name';
    name.textContent = skin.name;
    const price = shopPriceFor(skin.id);
    const isPromo = shopIsPromo(skin.id);
    const tag = document.createElement('div');
    tag.className = 'shop-card-tag locked' + (isPromo ? ' promo' : '');
    tag.innerHTML = isPromo
      ? `<span class="shop-card-tag-old">${SHOP_PRICE} CR</span> ${price} CR`
      : `${price} CR`;
    card.append(cv, name, tag);
    if (isPromo) {
      const badge = document.createElement('div');
      badge.className = 'shop-card-promo-badge';
      badge.textContent = 'OFERTA';
      card.appendChild(badge);
    }
    card.onclick = () => selectShopSkin(skin.id);
    track.appendChild(card);
  }

  classics.forEach(appendCard);
  if (classics.length && arcades.length) {
    const divider = document.createElement('div');
    divider.className = 'shop-track-divider';
    divider.innerHTML = '<span>LINHA ARCADE</span>';
    track.appendChild(divider);
  }
  arcades.forEach(appendCard);
}

function drawShopFrame(skin){
  const cv = document.getElementById('shop-skin-canvas');
  const cctx = cv.getContext('2d');
  function draw(){
    cctx.clearRect(0,0,cv.width,cv.height);
    cctx.save();
    cctx.translate(cv.width/2,cv.height/2);
    skin.drawPreview(cctx, cv.width/skin._size);
    cctx.restore();
  }
  if (skin.img){ skin.img.onload=draw; setTimeout(draw,300); }
  draw();
}

window.selectShopSkin = function(skinId){
  const skin = SKINS.find(s=>s.id===skinId);
  if (!skin) return;
  shopSelectedId = skinId;
  const errEl = document.getElementById('shop-error');
  errEl.style.display = 'none';
  errEl.textContent = '';
  const successEl = document.getElementById('shop-success');
  successEl.style.display = 'none';
  successEl.style.animation = 'none';

  document.getElementById('shop-skin-name').textContent = skin.name;
  const statusEl = document.getElementById('shop-skin-status');
  const isPromo = shopIsPromo(skin.id);
  const price = shopPriceFor(skin.id);
  statusEl.textContent = isPromo ? `OFERTA POR TEMPO LIMITADO — ${promoTimeLeftLabel()}` : 'BLOQUEADA';
  statusEl.className = 'shop-frame-status' + (isPromo ? ' promo' : '');
  const priceEl = document.getElementById('shop-skin-price');
  priceEl.style.display = 'block';
  priceEl.innerHTML = isPromo
    ? `<span class="shop-card-tag-old">${SHOP_PRICE} CR</span> ${price} CR`
    : `${price} CR`;
  priceEl.classList.toggle('promo', isPromo);
  document.getElementById('shop-buy-btn').style.display = 'flex';
  document.getElementById('shop-equip-btn').style.display = 'none';
  drawShopFrame(skin);

  // Atualiza destaque na esteira sem reconstruir tudo.
  // Congela animacao nos cards existentes para evitar re-disparo de shopCardIn ao trocar selecao.
  document.querySelectorAll('#shop-track .shop-card').forEach(c=>{
    c.style.animationDuration = '0s';
    c.classList.toggle('selected', Number(c.dataset.id)===skinId);
  });
};


window.openShop = async function(){
  if (!currentUser) return;
  // Atualiza precos/promo antes de mostrar — evita valores stale de sessoes longas
  try {
    const { ok, data } = await apiFetch('/api/me');
    if (ok && data?.loggedIn !== false) {
      if (data.promo        !== undefined) profile.promo        = data.promo;
      if (data.customPrices !== undefined) profile.customPrices = data.customPrices;
      currentUser.credits = data.user?.credits ?? currentUser.credits;
    }
  } catch(e) {}
  document.getElementById('shop-balance').textContent = currentUser.credits;
  updateCreditsBadge();
  switchShopTab('ships');
  buildShopTrack();
  const available = shopAvailableSkins();
  const frame = document.getElementById('shop-frame');
  if (available.length) { frame.style.display = ''; selectShopSkin(available[0].id); }
  else { frame.style.display = 'none'; }
  document.getElementById('shop-modal').style.display='flex';
  const firstId = available[0]?.id;
  if (firstId != null) setTimeout(()=>{
    const card = document.querySelector(`#shop-track .shop-card[data-id="${firstId}"]`);
    if (card) card.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }, 50);
};

window.openShopAt = async function(skinId){
  if (!currentUser) return;
  try {
    const { ok, data } = await apiFetch('/api/me');
    if (ok && data?.loggedIn !== false) {
      if (data.promo        !== undefined) profile.promo        = data.promo;
      if (data.customPrices !== undefined) profile.customPrices = data.customPrices;
      currentUser.credits = data.user?.credits ?? currentUser.credits;
    }
  } catch(e) {}
  document.getElementById('shop-balance').textContent = currentUser.credits;
  updateCreditsBadge();
  switchShopTab('ships');
  buildShopTrack();
  const available = shopAvailableSkins();
  const frame = document.getElementById('shop-frame');
  const target = available.find(s=>s.id===skinId) ? skinId : available[0]?.id;
  if (target!=null) { frame.style.display = ''; selectShopSkin(target); }
  else { frame.style.display = 'none'; }
  document.getElementById('shop-modal').style.display='flex';
  setTimeout(()=>{
    const card = document.querySelector(`#shop-track .shop-card[data-id="${target}"]`);
    if (card) card.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }, 50);
};

window.closeShop = function(){
  _stopTrailFrameAnim();
  document.getElementById('shop-modal').style.display='none';
};

function setBtnLoading(btn, loading){
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

window.equipFromShop = async function(){
  if (shopSelectedId==null) return;
  const btn = document.getElementById('shop-equip-btn');
  if (btn.disabled) return;
  setBtnLoading(btn, true);
  try { await equipSkin(shopSelectedId); }
  finally { setBtnLoading(btn, false); }
};

const SHOP_ERROR_MESSAGES = {
  insufficient_credits: 'Créditos insuficientes!',
  already_owned: 'Você já possui esta skin.',
  rate_limited: 'Muitas tentativas seguidas — aguarde um instante.',
};

window.confirmPurchase = async function(){
  if (shopSelectedId==null) return;
  const btn = document.getElementById('shop-buy-btn');
  if (btn.disabled) return;
  setBtnLoading(btn, true);
  const errEl = document.getElementById('shop-error');
  errEl.style.display = 'none';
  try {
    const purchasedId = shopSelectedId;
    const { ok, data } = await apiFetch('/api/shop/buy', { method:'POST', body:{ skinId: purchasedId } });
    if (ok && data) {
      profile = data;
      currentUser.credits = data.user.credits;
      currentUser.equippedSkin = data.equippedSkin;
      updateCreditsBadge();
      renderSkinGrid();
      document.getElementById('shop-balance').textContent = currentUser.credits;

      // Animação de sucesso: substitui temporariamente o botão "Comprar"
      const skin = SKINS.find(s=>s.id===purchasedId);
      btn.style.display = 'none';
      const successEl = document.getElementById('shop-success');
      successEl.style.animation = 'none';
      void successEl.offsetWidth; // reinicia a animação
      successEl.style.animation = '';
      successEl.style.display = 'flex';
      showNotify(`${skin ? skin.name : 'Skin'} desbloqueada!`);
      setTimeout(()=>{
        successEl.style.display = 'none';
        btn.style.display = '';
        // A nave comprada some da vitrine — seleciona a próxima disponível (se houver).
        buildShopTrack();
        const available = shopAvailableSkins();
        const frame = document.getElementById('shop-frame');
        if (available.length) { frame.style.display = ''; selectShopSkin(available[0].id); }
        else { frame.style.display = 'none'; }
      }, 1400);
      return;
    }
    errEl.textContent = (data && SHOP_ERROR_MESSAGES[data.error]) || 'Não foi possível concluir a compra.';
    errEl.style.display = 'block';
  } finally {
    setBtnLoading(btn, false);
  }
};

// ── Loja: aba de Créditos (compra com dinheiro real via Mercado Pago) ──
let creditPackagesLoaded = false;

window.switchShopTab = function(tab){
  const shipsBtn   = document.getElementById('shop-tab-ships-btn');
  const trailsBtn  = document.getElementById('shop-tab-trails-btn');
  const creditsBtn = document.getElementById('shop-tab-credits-btn');
  const shipsBody   = document.getElementById('shop-tab-ships');
  const trailsBody  = document.getElementById('shop-tab-trails');
  const creditsBody = document.getElementById('shop-tab-credits');
  shipsBtn.classList.toggle('active',   tab === 'ships');
  trailsBtn.classList.toggle('active',  tab === 'trails');
  creditsBtn.classList.toggle('active', tab === 'credits');
  shipsBody.style.display   = tab === 'ships'   ? 'flex'  : 'none';
  trailsBody.style.display  = tab === 'trails'  ? 'block' : 'none';
  creditsBody.style.display = tab === 'credits' ? 'flex'  : 'none';
  if (tab === 'trails') buildTrailsTab();
  if (tab === 'credits' && !creditPackagesLoaded) loadCreditPackages();
};

// ── Loja: aba de Rastros ──────────────────────────────────────
let _trailFrameAnimId = null;
let _trailSelectedId  = 0;

function _stopTrailFrameAnim(){
  if (_trailFrameAnimId) { cancelAnimationFrame(_trailFrameAnimId); _trailFrameAnimId = null; }
}

// Constrói a grade de cards (igual buildShopTrack, mas sem frame inline por card)
function buildTrailsTab(){
  _stopTrailFrameAnim();
  const grid = document.getElementById('shop-trails-grid');
  if (!grid) return;

  const owned    = new Set(profile?.ownedTrails || []);
  const equipped = profile?.equippedTrail ?? 0;
  grid.innerHTML = '';

  // Mostra TODOS os rastros — os possuídos/equipados ficam marcados, mas não somem
  TRAILS.forEach((trail, i) => {
    const isOwned    = trail.free || owned.has(trail.id);
    const isEquipped = equipped === trail.id;
    const isSelected = _trailSelectedId === trail.id;

    const card = document.createElement('div');
    card.className = 'shop-card'
      + (isSelected  ? ' selected'      : '')
      + (isEquipped  ? ' trail-active'  : '');
    card.dataset.id = trail.id;
    card.style.setProperty('--i', i);

    // Miniatura: bolinha colorida com glow (leve, sem animação — rápido)
    const dot = document.createElement('div');
    dot.className = 'trail-dot-preview';
    dot.style.cssText = `
      width:44px;height:44px;border-radius:50%;
      background:radial-gradient(circle at 40% 35%, ${trail.colors[0]}, ${trail.colors[trail.colors.length-1] || trail.colors[0]}88);
      box-shadow:0 0 16px ${trail.glow || trail.colors[0]}88,0 0 4px ${trail.glow || trail.colors[0]};
      flex-shrink:0;
    `;

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-card-name';
    nameEl.textContent = trail.name;

    const tag = document.createElement('div');
    if (isEquipped) {
      tag.className = 'shop-card-tag owned';
      tag.textContent = 'ATIVO';
    } else if (isOwned) {
      tag.className = 'shop-card-tag owned shop-card-tag-action';
      tag.textContent = 'EQUIPAR';
      tag.onclick = (ev) => {
        ev.stopPropagation();
        selectTrail(trail.id, true);
        equipTrail(trail.id);
      };
    } else {
      const effectivePrice = trailPriceFor(trail.id);
      const isUserPromo = _userPromoActive() && profile.userPromo?.trailIds?.includes(trail.id);
      tag.className = 'shop-card-tag locked shop-card-tag-action' + (trail.premium || isUserPromo ? ' promo' : '');
      tag.innerHTML = isUserPromo
        ? `COMPRAR <span class="shop-card-tag-old">${trail.price} CR</span> ${effectivePrice} CR`
        : `COMPRAR ${effectivePrice} CR`;
      tag.onclick = (ev) => {
        ev.stopPropagation();
        selectTrail(trail.id, true);
        confirmTrailPurchase(trail.id);
      };
    }

    const isUserPromoCard = _userPromoActive() && profile.userPromo?.trailIds?.includes(trail.id);
    if ((trail.premium || isUserPromoCard) && !isOwned) {
      const badge = document.createElement('div');
      badge.className = 'shop-card-promo-badge';
      badge.textContent = isUserPromoCard ? 'OFERTA' : 'PREMIUM';
      card.appendChild(badge);
    }

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'shop-card-action';
    if (isEquipped) {
      action.classList.add('equipped');
      action.textContent = 'EQUIPADO';
      action.disabled = true;
    } else if (isOwned) {
      action.classList.add('equip');
      action.textContent = 'EQUIPAR';
      action.onclick = (ev) => {
        ev.stopPropagation();
        selectTrail(trail.id, true);
        equipTrail(trail.id);
      };
    } else {
      const effectivePrice = trailPriceFor(trail.id);
      action.classList.add('buy');
      action.textContent = `COMPRAR ${effectivePrice} CR`;
      action.onclick = (ev) => {
        ev.stopPropagation();
        selectTrail(trail.id, true);
        confirmTrailPurchase(trail.id);
      };
    }

    card.append(dot, nameEl, tag, action);
    card.onclick = () => selectTrail(trail.id);
    grid.appendChild(card);
  });

  // Seleciona: ultimo selecionado (se ainda existe) > equipado > primeiro
  const toSelect = TRAILS.find(t => t.id === _trailSelectedId) ? _trailSelectedId : equipped;
  selectTrail(toSelect, true);
  setTimeout(()=>{
    const card = document.querySelector(`#shop-trails-grid .shop-card[data-id="${toSelect}"]`);
    if (card) card.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }, 50);
}

function selectTrail(trailId, silent = false){
  _trailSelectedId = trailId;
  const trail = TRAILS.find(t => t.id === trailId);
  if (!trail) return;

  const owned    = new Set(profile?.ownedTrails || []);
  const equipped = profile?.equippedTrail ?? 0;
  const isOwned  = trail.free || owned.has(trail.id);
  const isEquipped = equipped === trail.id;

  // Destaque na grade
  document.querySelectorAll('#shop-trails-grid .shop-card').forEach(c => {
    c.classList.toggle('selected', Number(c.dataset.id) === trailId);
  });

  // Frame lateral
  document.getElementById('shop-trail-name').textContent = trail.name;

  const statusEl = document.getElementById('shop-trail-status');
  statusEl.className = 'shop-frame-status' + (trail.premium ? ' promo' : isEquipped ? ' owned' : '');
  statusEl.textContent = trail.premium ? 'RASTRO PREMIUM' : isEquipped ? 'EQUIPADO' : isOwned ? 'POSSUIDO' : 'BLOQUEADO';

  const priceEl = document.getElementById('shop-trail-price');
  if (!isOwned && trail.price > 0) {
    const effectivePrice = trailPriceFor(trail.id);
    const isUserPromo = _userPromoActive() && profile?.userPromo?.trailIds?.includes(trail.id);
    priceEl.style.display = 'block';
    priceEl.innerHTML = isUserPromo
      ? `<span class="shop-card-tag-old">${trail.price} CR</span> ${effectivePrice} CR`
      : `${effectivePrice} CR`;
    priceEl.className = 'skin-price' + (trail.premium || isUserPromo ? ' promo' : '');
  } else {
    priceEl.style.display = 'none';
  }

  document.getElementById('shop-trail-success').style.display = 'none';
  document.getElementById('shop-trail-error').style.display   = 'none';
  document.getElementById('shop-trail-buy-btn').style.display     = (!isOwned) ? 'flex' : 'none';
  document.getElementById('shop-trail-equip-btn').style.display   = (isOwned && !isEquipped) ? 'flex' : 'none';
  document.getElementById('shop-trail-equipped-btn').style.display = isEquipped ? 'flex' : 'none';

  // Botão comprar clicável
  const buyBtn = document.getElementById('shop-trail-buy-btn');
  buyBtn.onclick = () => confirmTrailPurchase(trail.id);

  const equipBtn = document.getElementById('shop-trail-equip-btn');
  equipBtn.onclick = () => equipTrail(trail.id);

  // Preview animado no frame
  _stopTrailFrameAnim();
  const cv = document.getElementById('shop-trail-canvas');
  startTrailFramePreview(cv, trail);
}

function startTrailFramePreview(canvas, trailDef){
  // Para qualquer loop anterior antes de iniciar novo
  _stopTrailFrameAnim();
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let t = 0, points = [];

  if (trailDef.style === 'none') {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(9, 11); ctx.lineTo(-9, 11);
    ctx.closePath();
    ctx.fillStyle = '#aaddff';
    ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
    return;
  }

  function tick(){
    t += 0.035;
    ctx.clearRect(0, 0, W, H);
    const r = Math.min(W, H) * 0.3;
    const cx = W/2 + Math.cos(t) * r;
    const cy = H/2 + Math.sin(t) * r;
    points.push({ x: cx, y: cy, life: 1, maxLife: 1 });
    points = points.filter(p => p.life > 0);
    points.forEach(p => { p.life -= 0.045; });
    // Desenha rastro
    _drawFrameTrailPoints(ctx, points, trailDef);
    // Nave
    const ang = Math.atan2(Math.sin(t + Math.PI/2)*r, Math.cos(t + Math.PI/2)*r);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0,-10); ctx.lineTo(7,9); ctx.lineTo(-7,9);
    ctx.closePath();
    ctx.fillStyle = '#aaddff';
    ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
    _trailFrameAnimId = requestAnimationFrame(tick);
  }
  tick();
}

function _drawFrameTrailPoints(ctx, points, trailDef){
  const colors = trailDef.colors;
  const glow   = trailDef.glow || colors[0];
  points.forEach((p, i) => {
    const a = p.life;
    if (a <= 0) return;
    const sz = a * 9;
    const color = colors[Math.floor((1-a) * (colors.length-1))];
    ctx.save();
    ctx.globalAlpha = a * 0.88;

    if (trailDef.style === 'flame' || trailDef.style === 'comet') {
      const grd = ctx.createRadialGradient(p.x,p.y,0, p.x,p.y,sz*2.5);
      grd.addColorStop(0, color); grd.addColorStop(1,'transparent');
      ctx.shadowColor=glow; ctx.shadowBlur=sz*2;
      ctx.fillStyle=grd;
      ctx.beginPath(); ctx.arc(p.x,p.y,sz*2.5,0,Math.PI*2); ctx.fill();
    } else if (trailDef.style === 'sparkle' || trailDef.style === 'rainbow') {
      const rc = trailDef.style==='rainbow' ? colors[Math.floor(Date.now()/80+i)%colors.length] : color;
      ctx.shadowColor=glow; ctx.shadowBlur=sz*3; ctx.fillStyle=rc;
      const r1=sz*0.9, r2=sz*0.32;
      ctx.beginPath();
      for(let k=0;k<8;k++){
        const ang=(k*Math.PI)/4; const r=k%2===0?r1:r2;
        k===0?ctx.moveTo(p.x+Math.cos(ang)*r,p.y+Math.sin(ang)*r)
             :ctx.lineTo(p.x+Math.cos(ang)*r,p.y+Math.sin(ang)*r);
      }
      ctx.closePath(); ctx.fill();
    } else if (trailDef.style === 'lightning' || trailDef.style === 'plasma') {
      ctx.shadowColor=glow; ctx.shadowBlur=sz*4;
      ctx.strokeStyle=color; ctx.lineWidth=sz*0.5;
      ctx.beginPath();
      ctx.arc(p.x+(Math.random()-.5)*6,p.y+(Math.random()-.5)*6,sz*.7,0,Math.PI*2);
      ctx.stroke();
    } else if (trailDef.style === 'smoke' || trailDef.style === 'tempestade') {
      const grd=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,sz*2);
      grd.addColorStop(0,color+'cc'); grd.addColorStop(1,'transparent');
      ctx.fillStyle=grd;
      ctx.beginPath(); ctx.arc(p.x,p.y,sz*2,0,Math.PI*2); ctx.fill();
    } else if (trailDef.style === 'cosmic') {
      const rc=colors[Math.floor(Date.now()/60+i*2)%colors.length];
      ctx.shadowColor=rc; ctx.shadowBlur=sz*5;
      ctx.strokeStyle=rc; ctx.lineWidth=sz*0.4;
      ctx.beginPath(); ctx.arc(p.x,p.y,sz*1.1,0,Math.PI*2); ctx.stroke();
      const grd2=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,sz*.8);
      grd2.addColorStop(0,'#ffffff'); grd2.addColorStop(.5,rc); grd2.addColorStop(1,'transparent');
      ctx.fillStyle=grd2;
      ctx.beginPath(); ctx.arc(p.x,p.y,sz*.8,0,Math.PI*2); ctx.fill();
    } else {
      ctx.shadowColor=glow; ctx.shadowBlur=sz*2; ctx.fillStyle=color;
      ctx.beginPath(); ctx.arc(p.x,p.y,sz,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
}

async function confirmTrailPurchase(trailId){
  const trail = TRAILS.find(t => t.id === trailId);
  if (!trail) return;
  const buyBtn = document.getElementById('shop-trail-buy-btn');
  const errEl  = document.getElementById('shop-trail-error');
  errEl.style.display = 'none';
  const origText = buyBtn.textContent;
  buyBtn.textContent = '...';
  buyBtn.disabled = true;

  const { ok, data } = await apiFetch('/api/shop/trail/buy', { method:'POST', body:{ trailId } });

  buyBtn.textContent = origText;
  buyBtn.disabled = false;
  if (!ok) {
    if (data?.error === 'already_owned') {
      await equipTrail(trailId);
      return;
    }
    const msg = data?.error === 'already_owned'        ? 'Rastro já possuído'
              : data?.error === 'insufficient_credits' ? 'Créditos insuficientes'
              : (data?.error || 'Erro ao comprar');
    errEl.textContent = msg; errEl.style.display = 'block';
    return;
  }
  currentUser.credits = data.credits;
  profile = data;
  document.getElementById('shop-balance').textContent = data.credits;
  updateCreditsBadge();
  if (!profile.ownedTrails) profile.ownedTrails = [];
  if (!profile.ownedTrails.includes(trailId)) profile.ownedTrails.push(trailId);
  await equipTrail(trailId);
  // Sucesso
  buyBtn.style.display = 'none';
  const successEl = document.getElementById('shop-trail-success');
  successEl.style.display = 'flex';
  successEl.style.animation = 'none';
  void successEl.offsetWidth;
  successEl.style.animation = '';
  showNotify('Rastro desbloqueado e equipado!');
  setTimeout(() => buildTrailsTab(), 400);
}

async function equipTrail(trailId){
  const { ok } = await apiFetch('/api/shop/trail/equip', { method:'POST', body:{ trailId } });
  if (!ok) { showNotify('Erro ao equipar rastro'); return; }
  profile.equippedTrail = trailId;
  if (game && game.player) game.player.equippedTrailId = trailId;
  buildTrailsTab();
}

async function loadCreditPackages(){
  const disabledEl = document.getElementById('shop-credits-disabled');
  const listEl = document.getElementById('shop-credits-packages');
  try {
    const { ok, data } = await apiFetch('/api/payments/packages');
    if (!ok || !data) return;
    creditPackagesLoaded = true;
    if (!data.enabled) {
      disabledEl.style.display = 'block';
      listEl.innerHTML = '';
      return;
    }
    disabledEl.style.display = 'none';
    listEl.innerHTML = '';
    const bestId = data.packages.reduce((best, p) =>
      (!best || p.priceCents > best.priceCents) ? p : best, null)?.id;
    data.packages.forEach(pkg => listEl.appendChild(buildPackageCard(pkg, pkg.id === bestId)));
  } catch {}
}

function buildPackageCard(pkg, isBest){
  const card = document.createElement('div');
  card.className = 'pkg-card' + (isBest ? ' best' : '');
  card.innerHTML = `
    <div class="pkg-card-price">${pkg.label}</div>
    <div class="pkg-card-credits">${pkg.credits} Créditos</div>
    ${pkg.bonus ? `<div class="pkg-card-bonus">+${pkg.bonus} CRÉDITOS DE BÔNUS</div>` : ''}
    <button class="pkg-buy-btn">
      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1.2" y="2.5" width="9.6" height="7" rx="1"/><path d="M1.2 4.6 H10.8"/><path d="M2.6 7.4 H4.6"/></svg>
      PAGAR
    </button>
  `;
  const btn = card.querySelector('button');
  btn.onclick = () => startCheckout(pkg.id, btn);
  return card;
}

async function startCheckout(packageId, btn){
  if (btn.disabled) return;
  setBtnLoading(btn, true);
  try {
    const { ok, data } = await apiFetch('/api/payments/checkout', { method:'POST', body:{ packageId } });
    if (ok && data && data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    showNotify('Não foi possível iniciar o pagamento. Tente novamente.');
  } catch {
    showNotify('Não foi possível iniciar o pagamento. Tente novamente.');
  } finally {
    setBtnLoading(btn, false);
  }
}

async function pollOrderStatus(orderId, attemptsLeft){
  const statusEl = document.getElementById('shop-credits-status');
  try {
    const { ok, data } = await apiFetch('/api/payments/orders/recent');
    if (ok && data) {
      const order = data.orders.find(o => o.id === orderId);
      if (order && order.status === 'approved') {
        statusEl.textContent = 'Pagamento aprovado! Créditos adicionados à sua conta.';
        statusEl.classList.add('success');
        const prevCredits = currentUser.credits;
        await refreshProfile();
        animateCreditsGain(prevCredits, currentUser.credits);
        showNotify('Créditos adicionados com sucesso!');
        return;
      }
      if (order && (order.status === 'rejected' || order.status === 'cancelled')) {
        statusEl.textContent = 'Pagamento não foi concluído. Você pode tentar novamente.';
        return;
      }
    }
  } catch {}
  if (attemptsLeft > 0) {
    setTimeout(() => pollOrderStatus(orderId, attemptsLeft - 1), 2000);
  } else {
    statusEl.textContent = 'Ainda processando seu pagamento — o saldo será atualizado assim que for confirmado.';
  }
}

window.loadMyOrders = async function() {
  const btn  = document.getElementById('shop-orders-btn');
  const area = document.getElementById('shop-receipt-area');
  const list = document.getElementById('shop-orders-list');
  if (!currentUser) return;
  if (btn) btn.disabled = true;
  const { ok, data } = await apiFetch('/api/payments/orders/recent');
  if (btn) btn.disabled = false;
  if (!ok || !data || !data.orders.length) {
    if (list) list.innerHTML = '<p style="font-size:9px;color:#5a7a9a;margin:8px 0;">Nenhum pedido encontrado.</p>';
    if (area) area.style.display = 'block';
    return;
  }
  const statusLabel = { approved: 'Aprovado', pending: 'Aguardando', refunded: 'Reembolsado',
                        rejected: 'Rejeitado', cancelled: 'Cancelado' };
  list.innerHTML = data.orders.map(o => `
    <div class="shop-order-row">
      <div class="shop-order-info">
        <span class="shop-order-id">Pedido #${o.id} &mdash; ${new Date(o.created_at).toLocaleDateString('pt-BR')}</span>
        <span class="shop-order-val">${o.credits_amount} CR &mdash; R$ ${(o.price_cents/100).toFixed(2).replace('.',',')}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <span class="shop-order-status ${o.status}">${statusLabel[o.status] || o.status}</span>
        ${o.status === 'approved' || o.status === 'refunded' ? `
          <button class="shop-receipt-btn" onclick="sendReceipt(${o.id},this)">Comprovante</button>
        ` : ''}
      </div>
    </div>
  `).join('');
  if (area) area.style.display = 'block';
  if (btn) btn.style.display = 'none';
};

window.sendReceipt = async function(orderId, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  const { ok, data } = await apiFetch('/api/payments/receipt', { method: 'POST', body: { orderId } });
  if (ok && data?.sent) {
    btn.textContent = 'Enviado!';
    showNotify('Comprovante enviado para o seu e-mail!');
  } else if (data?.error === 'email_not_configured') {
    btn.textContent = 'Comprovante';
    btn.disabled = false;
    showNotify('Envio de e-mail nao configurado. Contate o suporte.');
  } else {
    btn.textContent = 'Erro';
    setTimeout(() => { btn.textContent = 'Comprovante'; btn.disabled = false; }, 3000);
  }
};

function checkPendingCreditOrder(){
  const params = new URLSearchParams(window.location.search);
  if (params.get('shop') !== 'credits') return;
  const orderId = Number(params.get('order'));
  history.replaceState(null, '', window.location.pathname);
  if (!currentUser) return;
  openShop();
  switchShopTab('credits');
  if (Number.isInteger(orderId)) {
    const statusEl = document.getElementById('shop-credits-status');
    statusEl.classList.remove('success');
    statusEl.textContent = 'Pagamento em processamento...';
    statusEl.style.display = 'block';
    pollOrderStatus(orderId, 3);
  }
}

// ── Arena select ──────────────────────────────────────────────
const arenaSelect=document.getElementById('arena-select');
ARENA_TYPES.forEach(a=>{
  const opt=document.createElement('option');
  opt.value=a.id; opt.textContent=a.label;
  arenaSelect.appendChild(opt);
});

function updateArenaPreview(){
  const cv=document.getElementById('arena-preview-canvas');
  const ctx=cv.getContext('2d');
  const type=arenaSelect.value;
  ctx.clearRect(0,0,cv.width,cv.height);
  const cfgMap={
    nebulosa:[210,70],asteroide:[28,55],vazio:[270,25],pulsar:[175,80],supernova:[12,90],
    cristal:[195,60],tempestade:[255,70],abismo:[290,15],aurora:[145,60],radiacao:[82,80],
    buraconegro:[300,60],neon:[320,75],gelido:[200,50],
  };
  const [hue,sat]=cfgMap[type]||[210,70];
  const g=ctx.createLinearGradient(0,0,cv.width,cv.height);
  g.addColorStop(0,`hsl(${hue},${sat}%,5%)`); g.addColorStop(1,`hsl(${hue},${sat}%,10%)`);
  ctx.fillStyle=g; ctx.fillRect(0,0,cv.width,cv.height);
  // Grade neon
  ctx.strokeStyle=`hsl(${hue},${sat}%,15%)`; ctx.lineWidth=0.5; ctx.globalAlpha=0.6;
  for(let x=0;x<cv.width;x+=16){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,cv.height);ctx.stroke();}
  for(let y=0;y<cv.height;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cv.width,y);ctx.stroke();}
  ctx.globalAlpha=1;
  // Estrelas
  for(let i=0;i<55;i++){
    ctx.fillStyle=`rgba(180,220,255,${Math.random()*.5+.1})`;
    ctx.beginPath();ctx.arc(Math.random()*cv.width,Math.random()*cv.height,Math.random()*1.2+.15,0,Math.PI*2);ctx.fill();
  }
  // Borda
  ctx.strokeStyle=`hsla(${hue},${sat}%,50%,.35)`; ctx.lineWidth=1;
  ctx.strokeRect(1,1,cv.width-2,cv.height-2);
}
updateArenaPreview();
window.updateArenaPreview=updateArenaPreview;
arenaSelect.addEventListener('change',updateArenaPreview);

// ── Histórico ─────────────────────────────────────────────────
function _drawItemIconSmall(ctx, type, color, s) {
  // Miniatura do ícone de item (canvas pequeno)
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.18;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch(type) {
    case 'HEALTH': case 'HEALTH_BIG':
      { const b=s*.28,a=s*.7; ctx.fillRect(-b,-a,b*2,a*2); ctx.fillRect(-a,-b,a*2,b*2); break; }
    case 'SHIELD': case 'SHIELD_BIG': case 'SHIELD_AURA':
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s,-s*.4); ctx.lineTo(s,s*.1); ctx.quadraticCurveTo(s,s*.8,0,s); ctx.quadraticCurveTo(-s,s*.8,-s,s*.1); ctx.lineTo(-s,-s*.4); ctx.closePath(); ctx.fill(); break;
    case 'MANA': case 'MANA_FULL':
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.bezierCurveTo(s*.8,-s*.2,s*.8,s*.5,0,s); ctx.bezierCurveTo(-s*.8,s*.5,-s*.8,-s*.2,0,-s); ctx.closePath(); ctx.fill(); break;
    case 'NUKE':
      ctx.beginPath(); ctx.arc(0,s*.15,s*.6,0,Math.PI*2); ctx.fill(); break;
    case 'MINE':
      ctx.beginPath(); ctx.arc(0,s*.1,s*.5,0,Math.PI*2); ctx.fill();
      for(let i=0;i<6;i++){const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(Math.cos(a)*s*.5,s*.1+Math.sin(a)*s*.5); ctx.lineTo(Math.cos(a)*s*.85,s*.1+Math.sin(a)*s*.85); ctx.stroke();}
      break;
    case 'MISSILE':
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*.3,-s*.2); ctx.lineTo(s*.2,s*.5); ctx.lineTo(-s*.2,s*.5); ctx.lineTo(-s*.3,-s*.2); ctx.closePath(); ctx.fill(); break;
    case 'FREEZE':
      for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.strokeStyle=color;ctx.lineWidth=s*.15;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-s);ctx.stroke();ctx.restore();} break;
    case 'OVERCLOCK':
      ctx.beginPath(); ctx.moveTo(-s*.2,-s); ctx.lineTo(s*.5,0); ctx.lineTo(-s*.1,0); ctx.lineTo(s*.2,s); ctx.lineTo(-s*.5,0); ctx.lineTo(s*.1,0); ctx.closePath(); ctx.fill(); break;
    case 'NOVA':
      for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.beginPath();ctx.moveTo(0,s*.15);ctx.lineTo(s*.18,s*.5);ctx.lineTo(0,s);ctx.lineTo(-s*.18,s*.5);ctx.closePath();ctx.fill();ctx.restore();} break;
    case 'WARP':
      ctx.beginPath(); ctx.arc(0,0,s*.7,0,Math.PI*2); ctx.fillStyle=color+'44'; ctx.fill();
      ctx.beginPath(); ctx.arc(0,0,s*.3,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); break;
    case 'GODMODE':
      for(let i=0;i<8;i++){ctx.save();ctx.rotate(i*Math.PI/4);ctx.beginPath();ctx.moveTo(0,-s*.3);ctx.lineTo(s*.12,-s*.7);ctx.lineTo(0,-s);ctx.lineTo(-s*.12,-s*.7);ctx.closePath();ctx.fill();ctx.restore();} break;
    default:
      ctx.beginPath(); ctx.arc(0,0,s*.55,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function _buildHistoryEntry(e) {
  const el = document.createElement('div');
  el.className = `history-entry ${e.win?'win':'lose'}`;

  // Sumário (sempre visível)
  const summary = document.createElement('div');
  summary.className = 'he-summary';

  // Ícone da nave
  const shipCv = document.createElement('canvas');
  shipCv.className = 'he-ship-icon';
  shipCv.width = shipCv.height = 28;
  summary.appendChild(shipCv);

  const info = document.createElement('div');
  info.className = 'he-info';
  info.innerHTML = `
    <div class="he-top">
      <span class="he-result">${e.win?'VITÓRIA':'DERROTA'} · ${e.mode??''}</span>
      <span class="he-date">${e.date??''}</span>
    </div>
    <div class="he-detail">${e.score??0}pts · ${e.kills??0}kills · ${e.items??0}itens</div>
    <div class="he-ship-name">${e.skinName??'Nave'}</div>
  `;
  summary.appendChild(info);

  const arrow = document.createElement('div');
  arrow.className = 'he-expand-arrow';
  arrow.textContent = '▼';
  summary.appendChild(arrow);
  el.appendChild(summary);

  // Painel expandido
  const panel = document.createElement('div');
  panel.className = 'he-detail-panel';

  // Stats
  const statsRow = document.createElement('div');
  statsRow.className = 'he-stats-row';
  const statsHtml = [
    ['KILLS', e.kills??0],
    ['SCORE', e.score??0],
    ['NV', e.level??1],
    ['ITENS', e.items??0],
  ].map(([l,v])=>`<div class="he-stat-box"><span class="sv">${v}</span><span class="sl">${l}</span></div>`).join('');
  statsRow.innerHTML = statsHtml;
  panel.appendChild(statsRow);

  // Grade de itens coletados
  if (e.itemTypeCounts && Object.keys(e.itemTypeCounts).length > 0) {
    const itemsTitle = document.createElement('div');
    itemsTitle.className = 'he-items-title';
    itemsTitle.textContent = 'ITENS COLETADOS';
    panel.appendChild(itemsTitle);

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'he-items-grid';

    // Ordena por quantidade desc
    const sorted = Object.entries(e.itemTypeCounts).sort((a,b)=>b[1]-a[1]);
    for (const [type, count] of sorted) {
      const chip = document.createElement('div');
      chip.className = 'he-item-chip';

      const icv = document.createElement('canvas');
      icv.width = icv.height = 18;
      const ictx = icv.getContext('2d');
      ictx.translate(9,9);
      // Cor do item
      const itemColors = {
        HEALTH:'#ff3366',HEALTH_BIG:'#ff6699',SHIELD:'#00aaee',SHIELD_BIG:'#44ccff',
        MANA:'#4488ff',MANA_FULL:'#88aaff',RAPID:'#ff8800',MULTISHOT:'#ffaa22',
        PIERCING:'#ff6600',MAGNET:'#00ffee',BOOST:'#00ff88',DASH_BOOST:'#00ffaa',
        MINE:'#ff4400',NUKE:'#ff2200',FREEZE:'#88ddff',REGEN:'#ff88aa',
        SHIELD_AURA:'#00ccff',OVERCLOCK:'#ffdd00',INVISIBLE:'#aaaacc',
        GODMODE:'#ffd700',NOVA:'#ff00ff',VAMPIRO:'#cc0044',WARP:'#aa44ff',
        MISSILE:'#ff6600',SLOW:'#cc44aa',DRAIN:'#aa2200',BLIND:'#6622aa',POISON:'#336600',
      };
      const col = itemColors[type]||'#ffffff';
      ictx.fillStyle = col;
      ictx.strokeStyle = col;
      _drawItemIconSmall(ictx, type, col, 7);

      chip.appendChild(icv);
      const nameSpan = document.createElement('span');
      nameSpan.className = 'he-item-chip-name';
      const itemLabels = {
        HEALTH:'HP+',HEALTH_BIG:'HP++',SHIELD:'Escudo',SHIELD_BIG:'Escudo++',
        MANA:'Mana+',MANA_FULL:'Mana Max',RAPID:'Turbo',MULTISHOT:'3-Way',
        PIERCING:'Pierce',MAGNET:'Ímã',BOOST:'Boost',DASH_BOOST:'Dash+',
        MINE:'Mina',NUKE:'Nuke',FREEZE:'Freeze',REGEN:'Regen',
        SHIELD_AURA:'Aura',OVERCLOCK:'Ovrclk',INVISIBLE:'Cloak',
        GODMODE:'Deus',NOVA:'Nova',VAMPIRO:'Vampiro',WARP:'Warp',
        MISSILE:'Míssil',SLOW:'Slow',DRAIN:'Drain',BLIND:'Cego',POISON:'Veneno',
      };
      nameSpan.textContent = itemLabels[type]||type;
      chip.appendChild(nameSpan);

      const countSpan = document.createElement('span');
      countSpan.className = 'he-item-chip-count';
      countSpan.textContent = `×${count}`;
      chip.appendChild(countSpan);

      itemsGrid.appendChild(chip);
    }
    panel.appendChild(itemsGrid);
  }

  el.appendChild(panel);

  // Toggle expandir
  summary.onclick = () => {
    el.classList.toggle('expanded');
    // Desenha ícone da nave quando expandido (lazy)
    if (el.classList.contains('expanded') && shipCv._drawn) return;
    _drawShipIconOnCanvas(shipCv, e.skinIndex??0);
    shipCv._drawn = true;
  };

  // Desenha ícone da nave pequeno no sumário imediatamente
  _drawShipIconOnCanvas(shipCv, e.skinIndex??0);

  return el;
}

function _drawShipIconOnCanvas(cv, skinIndex) {
  const skin = SKINS[skinIndex] || SKINS[0];
  const ctx = cv.getContext('2d');
  const doDraw = () => {
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.save();
    ctx.translate(cv.width/2, cv.height/2);
    try { skin.drawPreview(ctx, cv.width/skin._size); } catch(e){}
    ctx.restore();
  };
  // Se a imagem ainda não carregou, aguarda o onload antes de desenhar
  if (skin.img && (!skin.img.complete || !skin.img.naturalWidth)) {
    skin.img.addEventListener('load', doDraw, { once: true });
  } else {
    doDraw();
  }
}

// Converte uma linha vinda de GET /api/matches/recent (servidor, sincronizada
// entre dispositivos) no mesmo formato que _buildHistoryEntry espera.
function _historyEntryFromServerRow(r){
  const skin = SKINS.find(s=>s.id===r.skinId);
  let date = '';
  if (r.createdAt) {
    // created_at vem em UTC ("YYYY-MM-DD HH:MM:SS") — converte para hora local.
    const d = new Date(r.createdAt.replace(' ','T')+'Z');
    if (!isNaN(d)) {
      const pad=n=>String(n).padStart(2,'0');
      date = `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return {
    win: !!r.win, mode: r.mode, date,
    score: r.score??0, kills: r.kills??0,
    items: r.items??0,
    itemTypeCounts: r.itemTypeCounts??{},
    skinIndex: r.skinId??0,
    skinName: r.skinName??(skin?.name??'Nave'),
    level: r.level??1,
  };
}
// Histórico de partidas vem do servidor (tabela `matches`, por user_id) —
// assim ele é o mesmo em qualquer dispositivo/navegador onde o piloto entrar.
async function loadHistory(){
  const list=document.getElementById('history-list');
  const countEl=document.getElementById('history-count');
  if(!currentUser){
    list.innerHTML='<div class="history-empty">Faça login para ver seu histórico.</div>';
    countEl.textContent='';
    return;
  }
  const { ok, data } = await apiFetch('/api/matches/recent');
  const rows = (ok && data && Array.isArray(data.matches)) ? data.matches : null;
  list.innerHTML='';
  if(!rows){
    list.innerHTML='<div class="history-empty">Não foi possível carregar o histórico agora.</div>';
    countEl.textContent='';
    return;
  }
  if(!rows.length){list.innerHTML='<div class="history-empty">Sem partidas ainda.</div>';}
  else{
    rows.slice(0,15).forEach(r=>{
      list.appendChild(_buildHistoryEntry(_historyEntryFromServerRow(r)));
    });
  }
  countEl.textContent=`${rows.length} partida(s)`;
}

// ── Telas ──────────────────────────────────────────────────────
function showScreen(name){
  document.getElementById('login-screen').style.display = name==='login'?'flex':'none';
  if (name!=='login') {
    const music = document.getElementById('login-music');
    if (music && !music.paused) music.pause();
  }
  document.getElementById('menu').style.display         = name==='menu' ?'flex':'none';
  document.getElementById('game-canvas').style.display  = name==='game' ?'block':'none';
  document.getElementById('hud').style.display          = name==='game' ?'block':'none';
  document.getElementById('pause').style.display        = 'none';
  document.getElementById('gameover').style.display     = 'none';
}

// Volta ao menu principal sem fazer logout (usado pelo kick de inatividade)
window.exitToMenu=function(){
  if(game){game.destroy();game=null;}
  paused=false;
  showScreen('menu');
};

window.goLoginScreen=async function(){
  if(game){game.destroy();game=null;}
  paused=false;
  await apiFetch('/api/auth/logout', { method:'POST' });
  currentUser=null; profile=null;
  document.getElementById('auth-email').value='';
  document.getElementById('auth-password').value='';
  document.getElementById('auth-name').value='';
  hideAuthError();
  switchAuthTab('login');
  showScreen('login');
};

window.switchChangelogTab=function(tab){
  const isNews = tab==='news';
  document.getElementById('cl-tab-news-btn').classList.toggle('active', isNews);
  document.getElementById('cl-tab-about-btn').classList.toggle('active', !isNews);
  document.getElementById('changelog-list').style.display = isNews ? '' : 'none';
  document.getElementById('changelog-about').style.display = isNews ? 'none' : '';
};

window.openChangelog=function(){
  const list=document.getElementById('changelog-list');
  list.innerHTML=CHANGELOG.map(entry=>`
    <div class="changelog-entry">
      <span class="changelog-version">${entry.version}</span><span class="changelog-date">${entry.date}</span>
      <ul class="changelog-changes">${entry.changes.map(c=>`<li>${c}</li>`).join('')}</ul>
    </div>
  `).join('');
  switchChangelogTab('news');
  document.getElementById('changelog-modal').style.display='flex';
};

window.closeChangelog=function(){
  document.getElementById('changelog-modal').style.display='none';
};

window.openHowToPlay=function(){
  document.getElementById('howtoplay-modal').style.display='flex';
};

window.closeHowToPlay=function(){
  document.getElementById('howtoplay-modal').style.display='none';
};

window.selectMode=function(mode,btn){
  if (_disabledModes.includes(mode) || isModeInMaintenance(mode)) {
    showMaintenanceAlert(mode);
    return;
  }
  selectedMode=mode;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('mode-tip').textContent=MODE_TIPS[mode]||'';
};

// ── Jogo ───────────────────────────────────────────────────────
const canvas=document.getElementById('game-canvas');
function resizeCanvas(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;if(game)game.onResize(canvas.width,canvas.height);}
resizeCanvas(); window.addEventListener('resize',resizeCanvas);

// ── Detecção de dispositivo móvel / orientação / controles touch ──
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer:coarse)').matches);

if (IS_MOBILE) { document.body.classList.add('is-mobile'); window._isMobile = true; }

const orientationWarning = document.getElementById('orientation-warning');
const touchControls      = document.getElementById('touch-controls');

function isPortrait(){ return window.innerHeight > window.innerWidth; }

// Trava a orientação da tela no mobile via Screen Orientation API: menus
// (login/menu) ficam presos no retrato — onde os botões/textos foram
// desenhados — e a partida em si fica presa na paisagem. É "best effort":
// a API exige suporte do navegador (falha silenciosamente no iOS Safari,
// que não a implementa) e, em vários navegadores, só funciona em
// fullscreen — por isso é chamada também ao entrar/sair da partida, perto
// de requestMobileFullscreen/exitMobileFullscreen.
function lockOrientation(orientation){
  if (!IS_MOBILE) return;
  const so = screen.orientation;
  if (so && typeof so.lock === 'function') so.lock(orientation).catch(()=>{});
}

function updateOrientationUI(){
  if (!IS_MOBILE) return;
  const inGame = document.getElementById('game-canvas').style.display !== 'none';
  const portrait = isPortrait();
  const overGameOver = document.getElementById('gameover').style.display !== 'none';
  const overPause = document.getElementById('pause').style.display !== 'none';
  const showControls = inGame && !portrait && !overGameOver && !overPause;
  orientationWarning.classList.toggle('show', inGame && portrait);
  touchControls.classList.toggle('active', showControls);
  if (game) game._touchActive = showControls;
  const hudBottom = document.getElementById('hud-bottom');
  if (hudBottom) hudBottom.style.display = 'none';
}
window.addEventListener('resize', updateOrientationUI);
window.addEventListener('orientationchange', updateOrientationUI);

const _origShowScreen = showScreen;
showScreen = function(name){
  _origShowScreen(name);
  updateOrientationUI();
  lockOrientation(name==='game' ? 'landscape' : 'portrait');
};

// ── Controles touch personalizados (joystick virtual + botões) ──
(function setupTouchControls(){
  if (!IS_MOBILE) return;

  const stickZone = document.getElementById('touch-stick-zone');
  const stickKnob = document.getElementById('touch-stick-knob');
  const btnFire   = document.getElementById('touch-btn-fire');
  const btnDash   = document.getElementById('touch-btn-dash');
  const btnPause  = document.getElementById('touch-btn-pause');
  const slots      = touchControls.querySelectorAll('.touch-slot');
  const touchWsSlots = touchControls.querySelectorAll('#touch-weapon-slots .touch-ws-slot');
  const weaponSlots  = document.querySelectorAll('#weapon-slots .ws-slot');

  btnPause?.addEventListener('touchstart', e => {
    e.preventDefault();
    btnPause.classList.add('pressed');
    window.togglePause?.();
  }, { passive:false });
  btnPause?.addEventListener('touchend', e => {
    e.preventDefault();
    btnPause.classList.remove('pressed');
  }, { passive:false });

  let stickTouchId = null;
  const stickVec = { x:0, y:0, active:false };

  function stickCenter(){
    const r = stickZone.getBoundingClientRect();
    return { cx: r.left + r.width/2, cy: r.top + r.height/2 };
  }
  function stickRadius(){
    const r = stickZone.getBoundingClientRect();
    return Math.max(36, Math.min(r.width, r.height) * 0.47);
  }
  function stickStart(touch){
    if (stickTouchId !== null) return;
    stickTouchId = touch.identifier;
    stickMove(touch);
  }
  function stickMove(touch){
    const { cx, cy } = stickCenter();
    const radius = stickRadius();
    let dx = touch.clientX - cx, dy = touch.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) { dx = dx/dist*radius; dy = dy/dist*radius; }
    stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    stickVec.x = dx / radius;
    stickVec.y = dy / radius;
    stickVec.active = Math.hypot(stickVec.x, stickVec.y) > 0.12;
  }
  function stickEnd(){
    stickTouchId = null;
    stickKnob.style.transform = 'translate(-50%,-50%)';
    stickVec.x = 0; stickVec.y = 0; stickVec.active = false;
  }
  stickZone.addEventListener('touchstart', e=>{
    e.preventDefault();
    for (const t of e.changedTouches) stickStart(t);
  }, { passive:false });
  stickZone.addEventListener('touchmove', e=>{
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stickTouchId) stickMove(t);
  }, { passive:false });
  stickZone.addEventListener('touchend', e=>{
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === stickTouchId) stickEnd();
  }, { passive:false });
  stickZone.addEventListener('touchcancel', stickEnd);

  function bindHold(el, onStart, onEnd){
    el.addEventListener('touchstart', e=>{ e.preventDefault(); el.classList.add('pressed'); onStart(); }, { passive:false });
    el.addEventListener('touchend',   e=>{ e.preventDefault(); el.classList.remove('pressed'); onEnd(); }, { passive:false });
    el.addEventListener('touchcancel',e=>{ e.preventDefault(); el.classList.remove('pressed'); onEnd(); }, { passive:false });
  }

  const touchState = { firing:false, dashing:false };
  // Armazena a última direção do stick para manter a mira ao soltar e atirar
  const lastFireVec = { x:0, y:-1 };
  bindHold(btnFire, ()=>touchState.firing=true,  ()=>touchState.firing=false);
  bindHold(btnDash, ()=>touchState.dashing=true, ()=>touchState.dashing=false);

  const SLOT_CODE = { '1':'Digit1','2':'Digit2','3':'Digit3','4':'Digit4','5':'Digit5','x':'KeyX' };
  function fireKey(type, code){
    window.dispatchEvent(new KeyboardEvent(type, { code, bubbles:true }));
  }
  slots.forEach(slot=>{
    const code = SLOT_CODE[slot.dataset.slot];
    slot.addEventListener('touchstart', e=>{
      e.preventDefault(); slot.classList.add('pressed');
      slot._touchCode = code;
      fireKey('keydown', slot._touchCode);
    }, { passive:false });
    slot.addEventListener('touchend', e=>{
      e.preventDefault(); slot.classList.remove('pressed');
      fireKey('keyup', slot._touchCode || code);
      slot._touchCode = null;
    }, { passive:false });
    slot.addEventListener('touchcancel', e=>{
      slot.classList.remove('pressed');
      fireKey('keyup', slot._touchCode || code);
      slot._touchCode = null;
    });
  });

  const WS_CODES = ['KeyR','KeyT','KeyY','KeyU','KeyI','KeyL'];
  function bindWeaponSlot(slot, code){
    const onPress = (ev)=>{
      ev.preventDefault();
      slot.classList.add('pressed');
      fireKey('keydown', code);
      fireKey('keyup', code);
      setTimeout(()=>slot.classList.remove('pressed'), 120);
    };
    slot.addEventListener('touchstart', onPress, { passive:false });
    slot.addEventListener('click', onPress);
  }
  weaponSlots.forEach((slot, idx) => bindWeaponSlot(slot, WS_CODES[idx]));
  touchWsSlots.forEach((slot, idx) => bindWeaponSlot(slot, WS_CODES[idx]));

  window._touchState = touchState;
  window._touchStick = stickVec;

  // ── Injeta os controles touch no fluxo de input do jogo ──
  // O jogo usa "mira/movimento até o ponteiro do mouse"; no touch, a mira
  // (worldMouseX/Y) segue a mesma direção para onde o jogador está movendo
  // a nave pelo analógico — sem mira automática em inimigos.
  const TOUCH_AIM_DIST = 260;
  const origInput = Game.prototype._input;
  Game.prototype._input = function(){
    const base = origInput.call(this);
    if (!this._touchActive) return base;

    const px = this.player ? this.player.x : base.worldMouseX;
    const py = this.player ? this.player.y : base.worldMouseY;

    // Mira e movimento seguem a mesma direção: o vetor do analógico.
    // Sem o analógico ativo, mantém a direção atual da nave (evita
    // "destravar" a mira para o canto da tela).
    let wmx, wmy, moveTargetX, moveTargetY, holdRight = base.holdRight;
    if (stickVec.active) {
      // Stick ativo: atualiza mira e memória de direção
      lastFireVec.x = stickVec.x;
      lastFireVec.y = stickVec.y;
      wmx = px + stickVec.x * TOUCH_AIM_DIST;
      wmy = py + stickVec.y * TOUCH_AIM_DIST;
      moveTargetX = wmx;
      moveTargetY = wmy;
      holdRight = true;
    } else if (touchState.firing) {
      // Botão de fogo sem stick: aponta na última direção do stick
      wmx = px + lastFireVec.x * TOUCH_AIM_DIST;
      wmy = py + lastFireVec.y * TOUCH_AIM_DIST;
    } else if (this.player) {
      wmx = px + Math.cos(this.player._aimAngle - Math.PI/2) * TOUCH_AIM_DIST;
      wmy = py + Math.sin(this.player._aimAngle - Math.PI/2) * TOUCH_AIM_DIST;
    } else {
      wmx = base.worldMouseX; wmy = base.worldMouseY;
    }

    return {
      shooting:    base.shooting || touchState.firing,
      space:       base.space    || touchState.firing,
      holdRight:   holdRight,
      dash:        base.dash     || touchState.dashing,
      worldMouseX: wmx,
      worldMouseY: wmy,
      moveTargetX: moveTargetX,
      moveTargetY: moveTargetY,
    };
  };
})();

// Tela cheia no mobile ao iniciar partida — esconde as barras do navegador.
// Precisa ser chamada a partir de um gesto do usuário (toque no botão jogar);
// iOS Safari não suporta Fullscreen API em elementos comuns, então falha
// silenciosamente nesse caso (a chamada é apenas "best effort").
function requestMobileFullscreen(){
  if (!IS_MOBILE) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (req) { try { req.call(el); } catch {} }
}
function exitMobileFullscreen(){
  if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (exit) { try { exit.call(document); } catch {} }
}

window.startGame=function(){
  // Trava de segurança — impede entrar num modo em manutenção mesmo que
  // selectedMode tenha ficado "preso" num estado antigo (ex.: torneio
  // encerrou entre a seleção e o clique em JOGAR).
  if (isModeInMaintenance(selectedMode)) { showMaintenanceAlert(selectedMode); return; }
  const diff=document.getElementById('diff-select').value;
  requestMobileFullscreen();
  showScreen('game');
  paused=false;
  if(game)game.destroy();
  game=new Game(canvas,{skinIndex:selectedSkin,playerName:pilotName,profileIcon:(profile?(profile.profileIcon||0):0),equippedTrail:(profile?.equippedTrail||0),mode:selectedMode,difficulty:diff,roomId:'default'});
  game.start();
  window._game=game;
  updateOrientationUI();
};

window.restartGame=function(){document.getElementById('gameover').style.display='none';startGame();};

window.goMenu=function(){
  if(game){game.destroy();game=null;}
  paused=false; showScreen('menu'); loadHistory();
  exitMobileFullscreen();
};

// Botão "X" do lobby/fila online — avisa o servidor para sair da fila
// (libera a vaga para outros jogadores na hora) e volta ao menu.
window.cancelOnlineQueue=function(){
  if (game?.net) {
    if (game.mode==='tower_defense') game.net.tdQueueLeave();
    else game.net.queueLeave();
  }
  goMenu();
};

window.resumeGame=function(){
  document.getElementById('pause').style.display='none';
  paused=false; game?.resume();
  updateOrientationUI();
};

window.surrenderGame=function(){
  document.getElementById('pause').style.display='none';
  paused=false; game?.surrender();
  updateOrientationUI();
};

window.togglePause=function(){
  if(document.getElementById('gameover').style.display!=='none') return;
  if(!game||game.over) return;
  if(paused){resumeGame();}
  else{paused=true;game.pause();document.getElementById('pause').style.display='flex';updateOrientationUI();}
};

// ESC é tratado pelo game.js via window.togglePause

// ── Mudo na tela de pausa ─────────────────────────────────
window.pauseToggleMute=function(){
  const muted=game?._audio?.toggleMute?.();
  const label=document.getElementById('pause-mute-label');
  const waves=document.getElementById('pause-sound-waves');
  if(label) label.textContent = muted ? 'SOM: MUDO' : 'SOM: LIGADO';
  if(waves) waves.style.display = muted ? 'none' : '';
};

// ── Perfil e configurações ────────────────────────────────
// WASD: persistido em localStorage, lido como window._useWASD pelo game.js
window._useWASD = !IS_MOBILE && localStorage.getItem('useWASD')==='1';

function _syncProfileSettingsUI(){
  const wasdBtn=document.getElementById('wasd-toggle');
  if(wasdBtn){
    wasdBtn.textContent=window._useWASD?'ON':'OFF';
    wasdBtn.className='setting-toggle '+(window._useWASD?'on':'off');
  }
  const soundBtn=document.getElementById('sound-toggle');
  const muted=game?._audio?._muted ?? false;
  if(soundBtn){
    soundBtn.textContent=muted?'MUDO':'LIGADO';
    soundBtn.className='setting-toggle '+(muted?'off':'on');
  }
  // Esconde configurações de PC em mobile
  const desktopSettings=document.getElementById('ps-desktop-settings');
  if(desktopSettings) desktopSettings.style.display=IS_MOBILE?'none':'flex';

  // Preenche dados do perfil
  const nameEl=document.getElementById('ps-pilot-name');
  if(nameEl) nameEl.textContent=pilotName||'JOGADOR';
  const emailEl=document.getElementById('ps-pilot-email');
  if(emailEl) emailEl.textContent=currentUser?.email||'';
  const credEl=document.getElementById('ps-stat-credits');
  if(credEl) credEl.textContent=currentUser?.credits??'-';

  // Ícone de perfil no modal
  const iconBtn=document.getElementById('ps-icon-btn');
  if(iconBtn && typeof drawProfileIcon==='function'){
    iconBtn.innerHTML='';
    const c=document.createElement('canvas');
    c.width=40;c.height=40;
    drawProfileIcon(c.getContext('2d'),profile?profile.profileIcon||0:0,40);
    iconBtn.appendChild(c);
  }

  // Estatísticas rápidas do histórico local
  const hist=loadHistory?.[Symbol.toStringTag]!==undefined ? [] : (() => {
    try{ return JSON.parse(localStorage.getItem('arena_history')||'[]'); }catch{return [];}
  })();
  const kills=hist.reduce((s,m)=>s+(m.kills||0),0);
  const killEl=document.getElementById('ps-stat-kills');
  if(killEl) killEl.textContent=kills;
  const matchEl=document.getElementById('ps-stat-matches');
  if(matchEl) matchEl.textContent=hist.length;
}

window.openProfileSettings=function(){
  _syncProfileSettingsUI();
  document.getElementById('profile-settings-overlay').style.display='flex';
};
window.closeProfileSettings=function(){
  document.getElementById('profile-settings-overlay').style.display='none';
};
window.toggleWASD=function(){
  window._useWASD=!window._useWASD;
  localStorage.setItem('useWASD',window._useWASD?'1':'0');
  _syncProfileSettingsUI();
};
window.toggleSoundSetting=function(){
  if(game?._audio) {
    game._audio.toggleMute();
  }
  _syncProfileSettingsUI();
};

window.showGameOver=function(data){
  const go=document.getElementById('gameover');
  go.className=data.win?'win':'lose';
  go.style.display='flex';
  updateOrientationUI();
  go.querySelector('.go-icon-win').style.display=data.win?'block':'none';
  go.querySelector('.go-icon-lose').style.display=data.win?'none':'block';
  document.getElementById('go-result-label').textContent=data.win?'VITÓRIA':'DERROTA';
  if (selectedMode==='equipe_online' && data.teamWinner) {
    const teamLabel = t => t==='red' ? 'Time Vermelho' : 'Time Azul';
    document.getElementById('go-title').textContent = data.win ? 'EQUIPE VENCEDORA!' : 'EQUIPE DERROTADA';
    const ts=data.teamScores||{red:0,blue:0};
    document.getElementById('go-sub').textContent =
      `${teamLabel(data.teamWinner)} venceu por ${ts.red} x ${ts.blue} abates! Você jogou pelo ${teamLabel(data.team)}.`;
  } else if (selectedMode==='tower_defense') {
    const teamLabel = t => t==='red' ? 'Time Vermelho' : 'Time Azul';
    document.getElementById('go-title').textContent = data.win ? 'TORRE CONQUISTADA!' : 'TORRE PERDIDA';
    document.getElementById('go-sub').textContent = data.win
      ? `Seu time destruiu a torre central e venceu o confronto! ${(profile&&profile.tournament&&profile.tournament.active) ? 'Você desbloqueou a skin exclusiva "Stealwing"!' : ''}`
      : `${teamLabel(data.teamWinner)} destruiu a torre central primeiro. Tente novamente na fila do torneio!`;
  } else if (data.mode === 'cards' || selectedMode === 'cards') {
    document.getElementById('go-title').textContent = `LEVEL ${data.level || 1} ATINGIDO`;
    document.getElementById('go-sub').textContent =
      `Vidas restantes: ${data.livesLeft ?? 0} | Abates: ${data.kills} | Cartas: ${(data.cardsUsed||'').split(',').filter(Boolean).length}`;
    // Recarrega mini-ranking após partida
    loadCardsMiniRanking();
  } else {
    document.getElementById('go-title').textContent=data.win?'MISSÃO CUMPRIDA':'NAVE DESTRUÍDA';
    document.getElementById('go-sub').textContent=data.win?'Você dominou a arena.':'Suas vidas acabaram.';
  }
  document.getElementById('go-kills').textContent=data.kills;
  document.getElementById('go-score').textContent=data.score;
  document.getElementById('go-items').textContent=data.items;

  // Vidas no Contra1
  const livesEl=document.getElementById('go-lives');
  if(selectedMode==='contra1'&&data.playerLives!==undefined){
    livesEl.style.display='flex';
    const max=5;
    const pDots=document.getElementById('go-player-dots');
    const eDots=document.getElementById('go-enemy-dots');
    pDots.innerHTML=''; eDots.innerHTML='';
    for(let i=0;i<max;i++){
      const dp=document.createElement('div');
      dp.className='go-live-dot '+(i<data.playerLives?'filled-player':'empty');
      pDots.appendChild(dp);
      const de=document.createElement('div');
      de.className='go-live-dot '+(i<data.enemyLives?'filled-enemy':'empty');
      eDots.appendChild(de);
    }
  } else { livesEl.style.display='none'; }

  // O resultado é gravado no servidor (tabela `matches`, por user_id) — assim
  // o histórico aparece igual em qualquer dispositivo onde o piloto entrar.
  if (currentUser) {
    apiFetch('/api/matches', { method:'POST', body:{
      mode: selectedMode, difficulty: document.getElementById('diff-select').value,
      win: !!data.win, score: data.score, kills: data.kills, skinId: data.skinIndex??selectedSkin,
      items: data.items, itemTypeCounts: data.itemTypeCounts??{},
      skinName: data.skinName??(SKINS[selectedSkin]?.name??'Nave'),
      level: data.level??1,
    }}).then(({ok, data:res})=>{
      if (!ok || !res) return;
      const prevCredits = currentUser.credits;
      currentUser.credits = res.creditsBalance;
      if (res.creditsBalance > prevCredits) {
        animateCreditsGain(prevCredits, res.creditsBalance);
      } else {
        updateCreditsBadge();
      }
      if (res.rewardGranted) showNotify('+10 Créditos! Recompensa de partidas concedida.');
      loadHistory();
    });
  }
};

// Icones SVG para as cartas de jogo (sem emojis)
const CARD_ICONS = {
  "iron_hull": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6L12 2z\"/></svg>",
  "shield_wall": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6L12 2z\"/><line x1=\"12\" y1=\"8\" x2=\"12\" y2=\"16\"/><line x1=\"8\" y1=\"12\" x2=\"16\" y2=\"12\"/></svg>",
  "rapid_core": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><polygon points=\"13,2 3,14 12,14 11,22 21,10 12,10\"/></svg>",
  "adrenaline": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M5 12h14M15 8l4 4-4 4\"/><path d=\"M3 8l4 4-4 4\"/></svg>",
  "mana_surge": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><ellipse cx=\"12\" cy=\"12\" rx=\"8\" ry=\"10\"/><path d=\"M12 6v12M8 9l4-3 4 3M8 15l4 3 4-3\"/></svg>",
  "vampire_shot": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 9V3M12 21v-6M3 12h6M21 12h-6\"/></svg>",
  "lucky_drop": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><polygon points=\"12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26\"/></svg>",
  "multi_barrel": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><rect x=\"3\" y=\"10\" width=\"14\" height=\"4\" rx=\"1\"/><rect x=\"3\" y=\"5\" width=\"14\" height=\"3\" rx=\"1\"/><rect x=\"3\" y=\"16\" width=\"14\" height=\"3\" rx=\"1\"/><line x1=\"17\" y1=\"12\" x2=\"21\" y2=\"12\"/><line x1=\"17\" y1=\"6.5\" x2=\"21\" y2=\"6.5\"/><line x1=\"17\" y1=\"17.5\" x2=\"21\" y2=\"17.5\"/></svg>",
  "magnet_field": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M6 3h4v10a2 2 0 0 0 4 0V3h4v10a6 6 0 0 1-12 0V3z\"/></svg>",
  "burst_dash": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3\"/></svg>",
  "rapid_charge": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 3\"/><polygon points=\"14,2 10,6 14,6\"/></svg>",
  "freeze_core": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"22\"/><line x1=\"2\" y1=\"12\" x2=\"22\" y2=\"12\"/><line x1=\"4.93\" y1=\"4.93\" x2=\"19.07\" y2=\"19.07\"/><line x1=\"19.07\" y1=\"4.93\" x2=\"4.93\" y2=\"19.07\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/></svg>",
  "nova_core": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M5 19l2.5-2.5M16.5 7.5L19 5\"/><circle cx=\"12\" cy=\"12\" r=\"7\" stroke-dasharray=\"3 2\"/></svg>",
  "shield_charge": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6L12 2z\"/><polyline points=\"9,12 11,14 15,10\"/></svg>",
  "regen_core": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M12 21.7C7 19.3 3 15.3 3 10.5A6 6 0 0 1 12 5a6 6 0 0 1 9 5.5c0 4.8-4 8.8-9 11.2z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"15\"/><line x1=\"9\" y1=\"12\" x2=\"15\" y2=\"12\"/></svg>",
  "tower_card": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><rect x=\"8\" y=\"12\" width=\"8\" height=\"9\"/><rect x=\"6\" y=\"9\" width=\"12\" height=\"4\"/><rect x=\"9\" y=\"3\" width=\"6\" height=\"7\"/><line x1=\"8\" y1=\"3\" x2=\"8\" y2=\"9\"/><line x1=\"16\" y1=\"3\" x2=\"16\" y2=\"9\"/></svg>",
  "trap_card": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><polygon points=\"12,3 20,18 4,18\"/><line x1=\"12\" y1=\"10\" x2=\"12\" y2=\"14\"/><circle cx=\"12\" cy=\"16\" r=\"0.8\" fill=\"currentColor\"/></svg>",
  "glass_cannon": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><line x1=\"4\" y1=\"20\" x2=\"20\" y2=\"4\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\" stroke-dasharray=\"2 2\"/></svg>",
  "cursed_engine": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v4M12 18v4M2 12h4M18 12h4\"/><line x1=\"5\" y1=\"5\" x2=\"8\" y2=\"8\" stroke-dasharray=\"2 1\"/><line x1=\"16\" y1=\"16\" x2=\"19\" y2=\"19\" stroke-dasharray=\"2 1\"/></svg>",
  "blind_fire": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><line x1=\"2\" y1=\"2\" x2=\"22\" y2=\"22\"/><path d=\"M6.7 6.7C5 8 4 10 4 12s2 6 8 6 8-4 8-6\"/></svg>",
  "berserker": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M13 2L3 14h9l-1 8 10-12h-9l1-8z\"/><line x1=\"19\" y1=\"3\" x2=\"21\" y2=\"5\"/></svg>",
  "power_surge": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><polygon points=\"13,2 3,14 12,14 11,22 21,10 12,10\"/></svg>",
  "life_weave": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"15\"/><line x1=\"9\" y1=\"12\" x2=\"15\" y2=\"12\"/></svg>",
  "speed_overclock": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><polyline points=\"12,6 12,12 16,14\"/><line x1=\"16\" y1=\"3\" x2=\"20\" y2=\"7\"/><line x1=\"8\" y1=\"3\" x2=\"4\" y2=\"7\"/></svg>",
  "fortify": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"><path d=\"M12 22V12M12 12L7 7M12 12l5-5\"/><rect x=\"3\" y=\"3\" width=\"6\" height=\"6\" rx=\"1\"/><rect x=\"15\" y=\"3\" width=\"6\" height=\"6\" rx=\"1\"/><rect x=\"9\" y=\"15\" width=\"6\" height=\"6\" rx=\"1\"/></svg>"
};

const CARDS_CATALOG = {
  iron_hull:       { name:'Casco de Ferro',        desc:['HP+100','HP+180','HP+280'],             rarity:'positive' },
  shield_wall:     { name:'Muralha de Escudo',     desc:['Escudo+80','Escudo+150','Escudo+250'],  rarity:'positive' },
  rapid_core:      { name:'Nucleo Veloz',          desc:['-20% CD tiro','-35% CD','-50% CD'],    rarity:'positive' },
  adrenaline:      { name:'Adrenalina',            desc:['+25% vel','+40% vel','+60% vel'],      rarity:'positive' },
  mana_surge:      { name:'Surto de Mana',         desc:['+30 mana','+60 mana','+100 mana'],     rarity:'positive' },
  vampire_shot:    { name:'Tiro Vampiro',          desc:['15% lifesteal','25%','40%'],            rarity:'positive' },
  lucky_drop:      { name:'Drop Sortudo',          desc:['+40% raro','+65%','sempre raro'],      rarity:'positive' },
  multi_barrel:    { name:'Canhao Multiplo',       desc:['Tiro duplo','Tiro triplo','Tiro quad'], rarity:'positive' },
  magnet_field:    { name:'Campo Magnetico',       desc:['Raio 2x','Raio 3x','Raio 4x'],         rarity:'positive' },
  burst_dash:      { name:'Dash Explosivo',        desc:['+40 dano','+80 dano','+120+stun'],     rarity:'positive' },
  rapid_charge:    { name:'Recarga Rapida',        desc:['RAPID 8s','12s','16s'],                rarity:'positive' },
  freeze_core:     { name:'Nucleo de Gelo',        desc:['FREEZE 4s','7s','10s+area'],           rarity:'positive' },
  nova_core:       { name:'Nucleo Nova',           desc:['NOVA slot','NOVA+','NOVA area total'],  rarity:'positive' },
  shield_charge:   { name:'Carga de Escudo',       desc:['SHIELD+120','SHIELD+200','SHIELD+300'], rarity:'positive' },
  regen_core:      { name:'Recarga de Vida',       desc:['REGEN 8s','REGEN 10s','REGEN 14s'],    rarity:'positive' },
  tower_card:      { name:'Torre de Combate',      desc:['Torre aliada','Torre+','Torre++'],      rarity:'positive' },
  trap_card:       { name:'Armadilha',             desc:['200 dano r160','300 r180','400 r280'],  rarity:'positive' },
  glass_cannon:    { name:'Canhao de Vidro',       desc:['-30% HP +60% dano','',''],             rarity:'negative' },
  cursed_engine:   { name:'Motor Amaldicado',      desc:['-20% vel +80% dano','',''],            rarity:'negative' },
  blind_fire:      { name:'Tiro as Cegas',         desc:['Spread +45% dano','',''],              rarity:'negative' },
  berserker:       { name:'Berserker',             desc:['+50% dano <30% HP','',''],             rarity:'neutral'  },
  power_surge:     { name:'Surto de Poder',        desc:['+25% dano geral','',''],               rarity:'positive' },
  life_weave:      { name:'Teia de Vida',          desc:['+20% HP/escudo','',''],                rarity:'positive' },
  speed_overclock: { name:'Velocidade Maxima',     desc:['+20% vel geral','',''],                rarity:'positive' },
  fortify:         { name:'Fortalecer Estruturas', desc:['Torres/armad. +50/100%','',''],         rarity:'positive' },
};

window.showCardsOverlay = function(ev) {
  const overlay = document.getElementById('cards-overlay');
  if (!overlay) return;
  const grid = overlay.querySelector('.cards-grid');
  if (!grid) return;

  // Atualiza o level badge
  const badge = overlay.querySelector('.cards-level-badge');
  const lvNum = ev.cardLevel ?? ev.level;
  if (badge) badge.textContent = lvNum === 0 ? 'BUILD INICIAL' : `LEVEL ${lvNum || 1}`;

  // Renderiza as 3 cartas
  grid.innerHTML = '';
  const options = ev.options || [];
  options.forEach((opt, i) => {
    const cat    = CARDS_CATALOG[opt.id] || { name: opt.id, desc:['','',''], rarity:'positive' };
    const iconSvg= CARD_ICONS[opt.id] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
    const lv     = opt.level || 1;
    const descText = cat.desc[lv - 1] || cat.desc[0] || '';
    const isReturn = opt.returned;
    const isUpgrade = lv > 1 && !isReturn;
    const div = document.createElement('div');
    div.className = `card-choice card-rarity-${cat.rarity}`;
    div.style.animationDelay = `${i * 0.15}s`;
    div.innerHTML = `
      ${isReturn ? '<span class="card-returning-badge">VOLTOU</span>' : ''}
      ${isUpgrade ? '<span class="card-upgrade-badge">UPGRADE</span>' : ''}
      <div class="card-icon">${iconSvg}</div>
      <div class="card-name">${cat.name}</div>
      <div class="card-desc">${descText}</div>
      <div class="card-level-badge">Lv ${lv}</div>
    `;
    div.addEventListener('click', () => window._cardChoose(opt.id));
    grid.appendChild(div);
  });

  overlay.classList.add('show');

  // Anima a barra de timer de 40s
  const fill = overlay.querySelector('.cards-timer-fill');
  const timerText = overlay.querySelector('.cards-timer-text');
  if (fill) { fill.style.transition='none'; fill.style.width='100%'; }
  const CARD_TIMEOUT = 40000;
  const timerStart = Date.now();
  if (window._cardsTimerRaf) cancelAnimationFrame(window._cardsTimerRaf);
  function tickTimer() {
    const elapsed = Date.now() - timerStart;
    const pct = Math.max(0, 1 - elapsed / CARD_TIMEOUT);
    if (fill) fill.style.width = (pct * 100) + '%';
    if (timerText) timerText.textContent = Math.ceil(pct * 40) + 's';
    if (pct > 0) window._cardsTimerRaf = requestAnimationFrame(tickTimer);
  }
  requestAnimationFrame(tickTimer);

  // Força escolha aleatória ao expirar
  if (window._cardsOverlayTimer) clearTimeout(window._cardsOverlayTimer);
  window._cardsOverlayTimer = setTimeout(() => {
    if (options.length) window._cardChoose(options[0].id);
  }, CARD_TIMEOUT);
};

window.hideCardsOverlay = function() {
  const overlay = document.getElementById('cards-overlay');
  if (overlay) overlay.classList.remove('show');
  if (window._cardsOverlayTimer) { clearTimeout(window._cardsOverlayTimer); window._cardsOverlayTimer=null; }
  if (window._cardsTimerRaf) { cancelAnimationFrame(window._cardsTimerRaf); window._cardsTimerRaf=null; }
};

window._cardChoose = function(cardId) {
  window._game?.cardChoose(cardId);
  window.hideCardsOverlay();
};

// Mini-ranking ao vivo
async function loadCardsMiniRanking() {
  const el = document.getElementById('cards-mini-ranking');
  if (!el) return;
  try {
    const res = await fetch('/api/cards/ranking');
    if (!res.ok) return;
    const { data } = await res.json();
    if (!data || !data.length) { el.innerHTML = '<div style="color:#556;font-size:10px;text-align:center">Sem dados ainda</div>'; return; }
    el.innerHTML = data.slice(0, 5).map((r, i) => `
      <div class="cmr-row">
        <span class="cmr-pos">#${i+1}</span>
        <span class="cmr-name">${r.display_name||r.email||'Piloto'}</span>
        <span class="cmr-score">${r.score}</span>
        <span class="cmr-level">Lv${r.level}</span>
      </div>`).join('');
  } catch(e) { /* ignora erros de rede */ }
}

// Polling: atualiza mini-ranking a cada 30s quando estiver na tela de seleção
let _cardsMiniRankingInterval = null;
function startCardsMiniRankingPolling() {
  loadCardsMiniRanking();
  if (!_cardsMiniRankingInterval) {
    _cardsMiniRankingInterval = setInterval(loadCardsMiniRanking, 30000);
  }
}

// Modal de ranking completo
window.showCardsRankingModal = async function() {
  const modal = document.getElementById('cards-ranking-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  const tbody = modal.querySelector('.crm-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#556">Carregando...</td></tr>';
  try {
    const res = await fetch('/api/cards/ranking');
    const { data } = await res.json();
    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#556">Nenhum resultado ainda</td></tr>';
      return;
    }
    tbody.innerHTML = data.map((r, i) => `
      <tr>
        <td>#${i+1}</td>
        <td>${r.display_name||r.email||'Piloto'}</td>
        <td>${r.score}</td>
        <td>Lv${r.level}</td>
      </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#f44">Erro ao carregar</td></tr>';
  }
};

window.closeCardsRankingModal = function() {
  const modal = document.getElementById('cards-ranking-modal');
  if (modal) modal.style.display = 'none';
};

// Inicia o polling quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
  startVersionChecker();
  startCardsMiniRankingPolling();
});

// ── Carta de revelação da skin de recompensa do torneio (Stealwing) ──
window.closeSkinReveal=function(ev){
  if (ev && ev.target && ev.target.closest && ev.target.closest('#sr-card') && !ev.target.closest('.sr-card-front')) return;
  const el=document.getElementById('skin-reveal');
  el.style.display='none';
  el.classList.remove('show');
};
function showSkinRevealCard(skinName){
  const skin = SKINS.find(s=>s.name===skinName) || SKINS.find(s=>REWARD_ONLY_SKIN_IDS?.includes(s.id));
  if (!skin) return;
  const el = document.getElementById('skin-reveal');
  const card = document.getElementById('sr-card');
  document.getElementById('sr-skin-name').textContent = skin.name;
  // Reinicia as animações de flip/brilho
  card.style.animation='none';
  card.querySelectorAll('.sr-card-face').forEach(f=>{ f.style.animation='none'; });
  card.querySelectorAll('.sr-card-shine').forEach(s=>{ s.style.animation='none'; });
  void card.offsetWidth;
  card.style.animation='';
  card.querySelectorAll('.sr-card-face').forEach(f=>{ f.style.animation=''; });
  card.querySelectorAll('.sr-card-shine').forEach(s=>{ s.style.animation=''; });

  el.style.display='flex';
  el.classList.add('show');

  const cv = document.getElementById('sr-skin-canvas');
  const cctx = cv.getContext('2d');
  function draw(){
    cctx.clearRect(0,0,cv.width,cv.height);
    cctx.save();
    cctx.translate(cv.width/2,cv.height/2);
    skin.drawPreview(cctx, cv.width/skin._size);
    cctx.restore();
  }
  if (skin.img){ skin.img.onload=draw; setTimeout(draw,300); }
  draw();
}
window._showSkinReveal = showSkinRevealCard;

// ── Promoção de Skins — aparece a cada 20 sessões ─────────────────────────
// Mostra 3 cartas sequenciais com skins aleatórias disponíveis para compra.
const SKIN_PROMO_KEY       = 'skin_promo_session_count';
const SKIN_PROMO_SEEN_KEY  = 'skin_promo_seen_ids';
const SKIN_PROMO_INTERVAL  = 20;

function _skinPromoPrice(skin) {
  // Usa exatamente a mesma lógica de shopPriceFor — fonte única de verdade
  return shopPriceFor(skin.id);
}

function _skinPromoNextBatch() {
  // Skins disponíveis para compra (não possui, não é reward-only, não é gratuita)
  const owned    = profile?.ownedSkins || [];
  const EXCL     = [economy_FREE_SKIN_ID, ...REWARD_ONLY_SKIN_IDS]; // gratuita + reward-only
  const available = SKINS.filter(s => !owned.includes(s.id) && !EXCL.includes(s.id));
  if (available.length === 0) return [];

  // Evita repetir skins já vistas em sessões anteriores (reseta quando esgotar)
  let seen = JSON.parse(localStorage.getItem(SKIN_PROMO_SEEN_KEY) || '[]');
  let pool = available.filter(s => !seen.includes(s.id));
  if (pool.length < 3) { seen = []; pool = available; }

  // Seleciona 3 aleatórias
  const picked = [];
  const copy   = [...pool];
  for (let i = 0; i < 3 && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  seen = [...seen, ...picked.map(s => s.id)];
  localStorage.setItem(SKIN_PROMO_SEEN_KEY, JSON.stringify(seen));
  return picked;
}

function maybeShowSkinPromo() {
  if (!profile || !currentUser) return;
  const owned = profile.ownedSkins || [];
  const EXCL  = [economy_FREE_SKIN_ID, ...REWARD_ONLY_SKIN_IDS];
  const hasUnowned = SKINS.some(s => !owned.includes(s.id) && !EXCL.includes(s.id));
  if (!hasUnowned) return; // já tem tudo

  const key   = `${SKIN_PROMO_KEY}_${currentUser.id}`;
  const count = (parseInt(localStorage.getItem(key)) || 0) + 1;
  localStorage.setItem(key, count);
  if (count % SKIN_PROMO_INTERVAL !== 1) return; // só na 1ª, 21ª, 41ª... sessão

  const batch = _skinPromoNextBatch();
  if (batch.length === 0) return;
  _showSkinPromoOverlay(batch);
}

function _showSkinPromoOverlay(skins) {
  document.getElementById('skin-promo-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'skin-promo-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;
    align-items:center;justify-content:flex-start;
    background:rgba(2,5,13,.92);backdrop-filter:blur(8px);
    animation:srFadeIn .3s ease both;
    padding:16px 12px 20px;box-sizing:border-box;
    overflow-y:auto;overflow-x:hidden;
  `;

  overlay.innerHTML = `
    <div style="text-align:center;margin-bottom:16px;flex-shrink:0;width:100%;">
      <div style="font-family:'Press Start 2P',monospace;font-size:7px;
        color:#9b5cff;letter-spacing:2px;border:1px solid #9b5cff33;
        border-radius:3px;padding:4px 12px;display:inline-block;margin-bottom:10px;">
        PILOTOS DISPONIVEIS
      </div>
      <div style="font-family:'Press Start 2P',monospace;font-size:clamp(9px,2.5vw,13px);
        color:#fff;letter-spacing:1px;line-height:1.6;">
        NOVAS NAVES NA LOJA
      </div>
      <div style="font-size:10px;color:#4a7a9a;margin-top:5px;letter-spacing:.5px;">
        Customize sua nave com skins exclusivas
      </div>
    </div>
    <div id="skin-promo-cards" style="
      display:flex;gap:12px;flex-wrap:wrap;
      justify-content:center;align-items:flex-start;
      width:100%;max-width:680px;
    "></div>
    <button onclick="document.getElementById('skin-promo-overlay').remove()" style="
      flex-shrink:0;margin-top:20px;
      font-family:'Press Start 2P',monospace;font-size:7px;
      letter-spacing:1px;background:transparent;color:#4a7a9a;
      border:1px solid #2a4a6a;border-radius:6px;padding:10px 24px;
      cursor:pointer;transition:.15s;
    " onmouseover="this.style.color='#9b5cff';this.style.borderColor='#9b5cff44'"
       onmouseout="this.style.color='#4a7a9a';this.style.borderColor='#2a4a6a'">
      AGORA NAO
    </button>
  `;
  document.body.appendChild(overlay);

  const container = document.getElementById('skin-promo-cards');
  skins.forEach((skin, i) => {
    const price   = _skinPromoPrice(skin);
    const credits = currentUser?.credits ?? 0;
    const canBuy  = credits >= price;
    const owned   = (profile?.ownedSkins || []).includes(skin.id);

    const card = document.createElement('div');
    card.style.cssText = `
      background:linear-gradient(160deg,#0e0a1a,#08060f);
      border:1px solid #9b5cff22;border-radius:12px;
      padding:16px 12px 14px;text-align:center;
      width:clamp(140px,42vw,200px);flex-shrink:1;
      box-shadow:0 0 24px #9b5cff0a;
      display:flex;flex-direction:column;align-items:center;
      animation:bonusCardIn .4s cubic-bezier(.2,.9,.3,1.3) both;
      animation-delay:${i * 0.12}s;
    `;

    const badge = document.createElement('div');
    badge.style.cssText = `font-family:'Press Start 2P',monospace;font-size:6px;
      color:#9b5cff;letter-spacing:2px;border:1px solid #9b5cff33;
      border-radius:3px;padding:3px 8px;display:inline-block;margin-bottom:8px;`;
    badge.textContent = 'SKIN';

    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 120;
    cv.style.cssText = 'display:block;margin:0 auto 10px;width:clamp(80px,28vw,120px);height:clamp(80px,28vw,120px);';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `font-family:'Press Start 2P',monospace;font-size:clamp(6px,1.8vw,8px);
      color:#fff;letter-spacing:.5px;margin-bottom:6px;line-height:1.7;
      word-break:break-word;width:100%;`;
    nameEl.textContent = skin.name;

    const priceEl = document.createElement('div');
    priceEl.style.cssText = `font-family:'Press Start 2P',monospace;font-size:clamp(9px,2.8vw,13px);
      color:#ff8c00;margin-bottom:12px;text-shadow:0 0 10px #ff8c0066;`;
    priceEl.textContent = `${price} CR`;

    const btn = document.createElement('button');
    const btnLabel = owned ? 'POSSUIDA' : canBuy ? 'COMPRAR' : 'VER NA LOJA';
    // Estilo igual ao #shop-buy-btn da loja (dourado pulsante)
    btn.style.cssText = `
      position:relative;overflow:hidden;
      font-family:'Press Start 2P',monospace;font-size:clamp(6px,1.8vw,8px);letter-spacing:.5px;
      width:100%;padding:10px 6px;border-radius:6px;cursor:pointer;
      border:none;transition:transform .15s,box-shadow .15s,filter .15s;
      ${owned
        ? 'background:#0d2035;color:#4a8aaa;cursor:default;'
        : canBuy
          ? `background:linear-gradient(90deg,#ffaa00,#ffe34d,#ffaa00);background-size:220% 100%;
             color:#1a1100;font-weight:800;
             animation:shopBuyGradient 3s linear infinite,shopBuyPulse 2s ease-in-out infinite;`
          : `background:linear-gradient(90deg,#0050a0,#00aaff,#0050a0);background-size:220% 100%;
             color:#020a14;font-weight:800;
             animation:shopBuyGradient 3s linear infinite;`
      }
    `;
    btn.textContent = btnLabel;
    if (owned) btn.disabled = true;
    if (!owned) {
      btn.onmouseover = () => { btn.style.filter='brightness(1.12)'; btn.style.transform='translateY(-1px)'; };
      btn.onmouseout  = () => { btn.style.filter=''; btn.style.transform=''; };
    }

    btn.onclick = async () => {
      if (owned) return;
      if (canBuy) {
        btn.textContent = '...';
        btn.disabled = true;
        btn.style.animation = 'none';
        try {
          const { ok: bought, data: bdata } = await apiFetch('/api/shop/buy', { method:'POST', body:{ skinId: skin.id } });
          if (!bought) throw new Error(bdata?.error || 'Erro');
          currentUser = bdata.user || currentUser;
          profile = { ...profile, ownedSkins: bdata.ownedSkins || profile.ownedSkins };
          updateCreditsBadge();
          animateCreditsGain(currentUser.credits + price, currentUser.credits);
          btn.textContent = 'COMPRADA!';
          btn.style.background = 'linear-gradient(135deg,#00ffaa,#00cc88)';
          btn.style.color = '#020a14';
          card.style.borderColor = '#00ffaa44';
          card.style.boxShadow = '0 0 30px #00ffaa0a';
        } catch(e) {
          btn.textContent = 'ERRO';
          btn.disabled = false;
        }
      } else {
        document.getElementById('skin-promo-overlay').remove();
        openShopAt(skin.id);
      }
    };

    card.appendChild(badge);
    card.appendChild(cv);
    card.appendChild(nameEl);
    card.appendChild(priceEl);
    card.appendChild(btn);
    container.appendChild(card);

    // Desenha a skin — aguarda imagem carregar igual às demais telas do jogo
    const drawPromo = () => {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.save();
      ctx.translate(cv.width / 2, cv.height / 2);
      try { skin.drawPreview(ctx, cv.width / skin._size); } catch(e) {}
      ctx.restore();
    };
    if (skin.img) { skin.img.onload = drawPromo; setTimeout(drawPromo, 300); }
    drawPromo();
  });
}

function showNotify(text){
  const el=document.getElementById('notify');
  if(!el) return;
  const div=document.createElement('div');
  div.className='notify-item';
  div.textContent=text;
  el.appendChild(div);
  setTimeout(()=>div.remove(),4000);
}

// ── Sistema de Manutenção / Graceful Shutdown ─────────────────────────────
// Verifica o status do servidor a cada 30s e exibe banner ou overlay conforme a fase.
let _maintPhase = 'off';
let _maintCountdownInterval = null;

function _maintBanner() { return document.getElementById('maint-banner'); }

function _showMaintBanner(minutesLeft) {
  let banner = _maintBanner();
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'maint-banner';
    document.body.appendChild(banner);
  }
  // Atualiza o countdown sem recriar o banner inteiro
  const countdown = banner.querySelector('#maint-countdown');
  if (countdown) { countdown.textContent = minutesLeft !== null ? `${minutesLeft} min` : '—'; return; }

  banner.innerHTML = `
    <div class="maint-banner-inner">
      <div class="maint-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <path d="M14.7 6.3a4 4 0 0 1-5.7 5.7L4 17l3 3 5-5a4 4 0 0 1 5.7-5.7l-2.5 2.5-2-2 2.5-2.5z"/>
        </svg>
      </div>
      <div class="maint-banner-text">
        <span class="maint-banner-title">MANUTENCAO PROGRAMADA</span>
        <span class="maint-banner-sub">Termine sua partida. O servidor sera reiniciado em <strong id="maint-countdown">${minutesLeft !== null ? minutesLeft + ' min' : '—'}</strong></span>
      </div>
    </div>
  `;
}

function _showMaintLocked() {
  let banner = _maintBanner();
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'maint-banner';
    document.body.appendChild(banner);
  }
  banner.className = 'maint-banner-locked';
  banner.innerHTML = `
    <div class="maint-banner-inner">
      <div class="maint-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <div class="maint-banner-text">
        <span class="maint-banner-title">NOVAS PARTIDAS BLOQUEADAS</span>
        <span class="maint-banner-sub">Manutencao em andamento. Termine sua partida atual e aguarde a reabertura.</span>
      </div>
    </div>
  `;
}

function _hideMaintBanner() {
  const b = _maintBanner();
  if (b) { b.classList.add('maint-banner-hide'); setTimeout(() => b.remove(), 500); }
  if (_maintCountdownInterval) { clearInterval(_maintCountdownInterval); _maintCountdownInterval = null; }
}

// Modos desativados pelo admin — atualizado a cada poll de status
let _disabledModes = [];

function _applyDisabledModes(modes) {
  _disabledModes = modes || [];
  document.querySelectorAll('.mode-btn').forEach(btn => {
    const mode = btn.dataset.mode || btn.getAttribute('onclick')?.match(/selectMode\('([^']+)'/)?.[1];
    if (!mode) return;
    btn.classList.toggle('mode-disabled-admin', _disabledModes.includes(mode));
  });
  // Atualiza o painel de status dos modos (dot + lista)
  renderModeStatus();
}

async function _checkMaintenanceStatus() {
  try {
    const res  = await fetch('/api/server/status');
    const data = await res.json();
    const phase = data.phase;

    // Atualiza modos desativados independentemente da fase
    _applyDisabledModes(data.disabledModes || []);

    if (phase === _maintPhase) {
      // Só atualiza o countdown sem redesenhar
      if (phase === 'warning') _showMaintBanner(data.minutesLeft);
      return;
    }
    const prevPhase = _maintPhase;
    _maintPhase = phase;

    if (phase === 'off') {
      _hideMaintBanner();
      if (prevPhase === 'locked' || prevPhase === 'draining') location.reload();
    } else if (phase === 'warning') {
      _showMaintBanner(data.minutesLeft);
      // Heartbeat local: conta regressiva no próprio client
      if (_maintCountdownInterval) clearInterval(_maintCountdownInterval);
      _maintCountdownInterval = setInterval(() => {
        const c = document.getElementById('maint-countdown');
        if (!c) return;
        const cur = parseInt(c.textContent) || 0;
        if (cur > 0) c.textContent = (cur - 1) + ' min';
      }, 60000);
    } else if (phase === 'locked' || phase === 'draining') {
      _showMaintLocked();
      // Avisa quem está na tela de login
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen && loginScreen.style.display !== 'none') {
        const overlay = document.getElementById('maintenance-overlay');
        if (overlay && overlay.style.display === 'none') {
          document.getElementById('maint-title').textContent = 'Servidor em manutencao';
          document.getElementById('maint-text').textContent  =
            'O servidor esta temporariamente indisponivel para manutencao. Voltaremos em breve!';
          overlay.style.display = 'flex';
        }
      }
    }

    // Reporta ao servidor se está em partida ativa
    if (currentUser) {
      const inMatch = !!document.getElementById('game-canvas') &&
                      document.getElementById('game-canvas').style.display !== 'none';
      fetch('/api/server/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inMatch }),
      }).catch(() => {});
    }
  } catch(e) { /* servidor offline — ignora */ }
}

window.checkMaintenanceNow = _checkMaintenanceStatus;

// Verifica a cada 30s
setInterval(_checkMaintenanceStatus, 30000);
// Primeira verificação após 3s do boot
setTimeout(_checkMaintenanceStatus, 3000);

// Trata mensagem WebSocket de partida bloqueada
window._handleMaintenanceLocked = function(status) {
  _maintPhase = status.phase || 'locked';
  _showMaintLocked();
  // Mostra overlay do estilo nm-card igual ao de manutenção de modo
  const overlay = document.getElementById('maintenance-overlay');
  if (overlay) {
    document.getElementById('maint-title').textContent = 'Manutencao em andamento';
    document.getElementById('maint-text').textContent  =
      'Novas partidas estao bloqueadas. Aguarde a reabertura do servidor para jogar novamente.';
    overlay.style.display = 'flex';
  }
};

// Trata mudanças aplicadas pelo admin em tempo real via WebSocket
window._handleAdminUpdate = function(msg) {
  if (!currentUser) return;
  if (msg.kind === 'credits') {
    const prev = currentUser.credits ?? 0;
    currentUser.credits = msg.credits;
    updateCreditsBadge();
    // Animação de ganho/perda de créditos igual à da loja
    if (msg.credits !== prev) animateCreditsGain(prev, msg.credits);
  } else if (msg.kind === 'skins') {
    if (profile) profile.ownedSkins = msg.skins;
  } else if (msg.kind === 'blocked' && msg.blocked) {
    // Conta bloqueada: desconecta e volta ao login com aviso
    showNotify('Sua conta foi suspensa pelo administrador.');
    setTimeout(() => {
      if (typeof net !== 'undefined') { try { net.disconnect(); } catch(e){} }
      showScreen('login');
    }, 2000);
  }
};

// Recebe promoção individual enviada pelo admin via WebSocket
window._handleUserPromo = function(promo) {
  if (profile) profile.userPromo = promo || null;
  showNotify(promo ? 'Voce recebeu uma oferta exclusiva! Abra a loja.' : 'Sua promocao expirou.');
  const shopOpen = document.getElementById('shop-modal')?.style.display !== 'none';
  if (shopOpen) { buildShopTrack(); buildTrailsTab(); }
};

// Atualiza promo em tempo real quando o admin altera (broadcast para todos)
window._handlePromoUpdate = function(promo) {
  if (profile) profile.promo = promo || null;
  // Se a loja estiver aberta, reconstrói o carrossel de naves
  const shopOpen = document.getElementById('shop-modal')?.style.display !== 'none';
  if (shopOpen) buildShopTrack();
};

// Atualiza preços customizados em tempo real quando o admin altera
window._handlePricesUpdate = function(prices) {
  if (profile) profile.customPrices = prices || {};
  const shopOpen = document.getElementById('shop-modal')?.style.display !== 'none';
  if (shopOpen) buildShopTrack();
};

// ── Inicialização: tenta sessão existente, senão mostra tela de login ──
// setupGoogleSignIn() só é chamada aqui, quando não há sessão, para evitar
// requisições desnecessárias ao Google e o One Tap automático para logados.
(async function boot(){
  const hasSession = await refreshProfile();
  if (hasSession) {
    loadHistory();
    showScreen('menu');
    checkPendingCreditOrder();
    maybeShowTutorial();
    if (!profile || profile.tutorialSeen) {
      maybeShowNewModeAlert();
      // Promo de skins: só mostra se não há tutorial nem modo novo pendente
      if (profile?.tutorialSeen) setTimeout(maybeShowSkinPromo, 1200);
    }
  } else {
    showScreen('login');
    setupGoogleSignIn();
  }
})();

// ── Canvas de fundo animado para lobby e match-loading ─────────
(function initQueueCanvas(){
  function makeStars(n){ return Array.from({length:n},()=>({
    x:Math.random()*2000, y:Math.random()*1200,
    r:Math.random()*1.4+0.3, s:Math.random()*0.4+0.1,
    o:Math.random()
  }));}
  function animateBg(canvas, accentColor){
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const stars=makeStars(180);
    let raf=null;
    function resize(){ canvas.width=window.innerWidth; canvas.height=window.innerHeight; }
    resize();
    window.addEventListener('resize',resize);
    function frame(){
      const W=canvas.width, H=canvas.height;
      ctx.clearRect(0,0,W,H);
      for(const s of stars){
        s.x-=s.s; if(s.x<0) s.x=W;
        s.o+=0.02; if(s.o>Math.PI*2) s.o=0;
        const a=0.35+0.35*Math.sin(s.o);
        ctx.globalAlpha=a;
        ctx.fillStyle='#ffffff';
        ctx.beginPath(); ctx.arc(s.x/2000*W, s.y/1200*H, s.r, 0, Math.PI*2); ctx.fill();
      }
      // grade de pontos
      ctx.globalAlpha=0.06;
      ctx.fillStyle=accentColor;
      const gs=60;
      for(let x=0;x<W;x+=gs) for(let y=0;y<H;y+=gs){
        ctx.beginPath(); ctx.arc(x,y,1,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
      raf=requestAnimationFrame(frame);
    }
    frame();
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('resize',resize); };
  }
  animateBg(document.getElementById('tl-bg-canvas'),'#9b5cff');
  animateBg(document.getElementById('ml-bg-canvas'),'#4da6ff');
})();
