// Jogador: Espaço atira, segurar direito move, mana para locomoção, barra de vida na nave.
import { SKINS }            from './skins.js';
import { TRAILS }           from './trails.js';
import { ARENA_W, ARENA_H } from './arena.js';
import { Inventory }         from './items.js';

// ── Rastro visual da nave ──────────────────────────────────────────
function spawnTrailPoint(trail, x, y) {
  trail.push({ x, y, life: 1, maxLife: 1 });
}
function updateTrail(trail, dt) {
  const decay = 3.2; // duração ~0.31s
  for (const p of trail) p.life -= decay * dt;
  return trail.filter(p => p.life > 0);
}
function drawTrail(ctx, trail, trailDef) {
  if (!trailDef || trailDef.style === 'none' || !trail.length) return;
  const colors = trailDef.colors;
  const glow   = trailDef.glow || colors[0];

  ctx.save();
  ctx.shadowBlur = 0;

  for (let i = 0; i < trail.length; i++) {
    const p    = trail[i];
    const t    = p.life / p.maxLife; // 1 → 0 (novo → velho)
    const size = t * 7;
    const alpha = t * 0.75;
    if (alpha <= 0 || size <= 0) continue;

    // Cor interpolada pelo índice ao longo do rastro
    const colorIdx = Math.floor((1 - t) * (colors.length - 1));
    const color = colors[Math.min(colorIdx, colors.length - 1)];

    ctx.globalAlpha = alpha;

    if (trailDef.style === 'flame') {
      ctx.shadowColor = glow;
      ctx.shadowBlur  = size * 2;
      ctx.fillStyle   = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    } else if (trailDef.style === 'sparkle') {
      ctx.shadowColor = glow;
      ctx.shadowBlur  = size * 3;
      ctx.fillStyle   = color;
      // Estrela de 4 pontas
      const r1 = size, r2 = size * 0.35;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const r = k % 2 === 0 ? r1 : r2;
        k === 0 ? ctx.moveTo(p.x + Math.cos(a)*r, p.y + Math.sin(a)*r)
                : ctx.lineTo(p.x + Math.cos(a)*r, p.y + Math.sin(a)*r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (trailDef.style === 'lightning') {
      ctx.strokeStyle = color;
      ctx.lineWidth   = size * 0.6;
      ctx.shadowColor = glow;
      ctx.shadowBlur  = size * 4;
      const jitter = (1 - t) * 4;
      ctx.beginPath();
      ctx.arc(p.x + (Math.random()-0.5)*jitter, p.y + (Math.random()-0.5)*jitter,
              size * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (trailDef.style === 'smoke') {
      ctx.fillStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur  = size;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 1.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (trailDef.style === 'rainbow') {
      // Cicla pelas cores do arco-iris ao longo do tempo global
      const rc = colors[Math.floor(Date.now() / 80 + i) % colors.length];
      ctx.shadowColor = rc;
      ctx.shadowBlur  = size * 3;
      ctx.fillStyle   = rc;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else if (trailDef.style === 'plasma') {
      // Anel duplo pulsante
      ctx.shadowColor = glow;
      ctx.shadowBlur  = size * 4;
      ctx.strokeStyle = color;
      ctx.lineWidth   = size * 0.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = colors[(colorIdx + 1) % colors.length];
      ctx.lineWidth   = size * 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    } else if (trailDef.style === 'comet') {
      // Calda alongada com gradiente
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2.2);
      grd.addColorStop(0, color);
      grd.addColorStop(0.5, colors[1] || color);
      grd.addColorStop(1, 'transparent');
      ctx.shadowColor = glow;
      ctx.shadowBlur  = size * 3;
      ctx.fillStyle   = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (trailDef.style === 'cosmic') {
      // Ultra: fenda com aneis e faiscas multicoloridas
      const rc = colors[Math.floor(Date.now() / 60 + i * 2) % colors.length];
      ctx.shadowColor = rc;
      ctx.shadowBlur  = size * 5;
      // Anel externo
      ctx.strokeStyle = rc;
      ctx.lineWidth   = size * 0.35;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 1.1, 0, Math.PI * 2);
      ctx.stroke();
      // Nucleo brilhante
      const grd2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 0.7);
      grd2.addColorStop(0, '#ffffff');
      grd2.addColorStop(0.4, rc);
      grd2.addColorStop(1, 'transparent');
      ctx.fillStyle = grd2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

function colorWithAlpha(color, alpha) {
  if (typeof color !== 'string') return `rgba(255,255,255,${alpha})`;
  const raw = color.trim().replace('#', '');
  if (raw.length === 3 || raw.length === 6) {
    const full = raw.length === 3
      ? raw.split('').map(c => c + c).join('')
      : raw;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

function drawTintedSkin(ctx, skin, scale, color) {
  const img = skin?.img;
  if (!img?.complete || !img.naturalWidth || typeof document === 'undefined') {
    skin?.draw?.(ctx, scale);
    return;
  }
  const size = Math.ceil((skin._size ?? 72) * scale);
  const canvas = drawTintedSkin._canvas || (drawTintedSkin._canvas = document.createElement('canvas'));
  const g = canvas.getContext('2d');
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  g.clearRect(0, 0, size, size);
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'source-over';
  ctx.drawImage(canvas, -size/2, -size/2, size, size);
}

const SPEED       = 220;
const DASH_SPEED  = 1100; // mais rápido = teleporta bem mais longe
const DASH_DUR    = 0.28; // dura mais
const DASH_CD     = 1.4;
const HP_MAX      = 400;
const SHIELD_MAX  = 300; // dobrado — mas absorção em colisão é 50% menos efetiva
const MANA_MAX    = 100;
const MANA_REGEN  = 18;         // mana/s recuperada parado
const MANA_MOVE   = 6;          // mana/s gasta ao mover
const MANA_DASH   = 14;         // mana gasta por dash
const SHOOT_CD    = 0.28;       // recarga base do tiro
const REBUILD_DUR = 10;         // segundos reconstruindo

// ── Combustão na popa — estilo arcade: núcleo alongado + faíscas ──
// `angle` aqui é sempre o ângulo de VOO da nave (para onde o bico aponta),
// não o ângulo de mira — a chama sai pela popa, ou seja, na direção oposta.
function spawnFlameAt(flames, ex, ey, angle, intensity, flameColors=null) {
  const colors = flameColors || ['#ffffeb', '#ffb840', '#ff3000'];
  const back = angle + Math.PI;
  // Núcleo: poucas partículas grandes, alongadas no eixo da popa — dão o
  // efeito de "jato" contínuo em vez de uma bolha de fumaça.
  const coreCount = 1 + Math.ceil(intensity);
  for (let i = 0; i < coreCount; i++) {
    const spread = (Math.random()-0.5)*0.16;
    const fa  = back + spread;
    const sp  = 105 + Math.random()*75;
    const life = 0.08 + Math.random()*0.07;
    flames.push({
      kind:'core',
      x:ex+(Math.random()-.5)*2, y:ey+(Math.random()-.5)*2,
      vx:Math.cos(fa)*sp, vy:Math.sin(fa)*sp,
      angle: fa,
      colors,
      life, maxLife:life, size:4+intensity*7+Math.random()*2, flicker:Math.random(),
    });
  }
  // Faíscas: partículas pequenas e rápidas, espalhadas em leque — dão
  // sensação de velocidade arcade ("estrelas" saindo do motor).
  const sparkCount = Math.ceil(intensity * 3);
  for (let i = 0; i < sparkCount; i++) {
    const spread = (Math.random()-0.5)*0.9;
    const fa  = back + spread;
    const sp  = 140 + Math.random()*160;
    const life = 0.12 + Math.random()*0.16;
    flames.push({
      kind:'spark',
      x:ex+(Math.random()-.5)*3, y:ey+(Math.random()-.5)*3,
      vx:Math.cos(fa)*sp, vy:Math.sin(fa)*sp,
      angle: fa,
      colors,
      life, maxLife:life, size:1+Math.random()*2, flicker:Math.random(),
    });
  }
}
function updateFlames(flames, dt) {
  for (const f of flames) { f.x+=f.vx*dt; f.y+=f.vy*dt; f.vx*=(1-4*dt); f.vy*=(1-4*dt); f.life-=dt; }
  return flames.filter(f=>f.life>0);
}
function drawFlames(ctx, flames) {
  for (const f of flames) {
    const colors = f.colors || ['#ffffeb', '#ffb840', '#ff3000'];
    const light = colors[0] || '#ffffeb';
    const mid   = colors[1] || light;
    const dark  = colors[2] || mid;
    const t=f.life/f.maxLife;
    const fk=0.7+0.3*Math.sin(f.flicker*40+Date.now()*0.03);
    ctx.save(); ctx.globalAlpha=Math.min(1,t*1.3)*fk;
    if (f.kind==='spark') {
      // Faísca: traço curto na direção do movimento — reforça sensação de jato.
      const len=f.size*3*t+2;
      ctx.translate(f.x,f.y); ctx.rotate(f.angle);
      const g=ctx.createLinearGradient(0,0,-len,0);
      g.addColorStop(0,colorWithAlpha(light,0.95)); g.addColorStop(1,colorWithAlpha(dark,0));
      ctx.strokeStyle=g; ctx.lineWidth=f.size*t+0.6; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-len,0); ctx.stroke();
    } else {
      // Núcleo: gota alongada na direção da popa — gradiente quente→frio.
      const len=f.size*(1.8+t), wid=f.size*t*0.85;
      ctx.translate(f.x,f.y); ctx.rotate(f.angle);
      const g=ctx.createLinearGradient(0,0,-len,0);
      g.addColorStop(0,colorWithAlpha(light,1));
      g.addColorStop(0.28,colorWithAlpha(light,0.95));
      g.addColorStop(0.6,colorWithAlpha(mid,0.8));
      g.addColorStop(1,colorWithAlpha(dark,0));
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.ellipse(-len*0.5,0,len*0.5,wid,0,0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }
}
function drawAlienThruster(ctx, ex, ey, age) {
  for (let i=0;i<3;i++) {
    const p=((age*2+i/3)%1), r=6+p*18, a=(1-p)*0.7;
    ctx.save(); ctx.strokeStyle=`rgba(170,80,255,${a})`; ctx.lineWidth=2; ctx.shadowColor='#aa44ff'; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.arc(ex,ey,r,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
}

// ── Estilhaços: grade de recortes com estilo por skin ────────
// style 0=grade normal, 1=espiral, 2=radial rápido, 3=ondas, 4=caos, 5=vórtice, 6=chuva
function _shardStyle(style, lx, ly, sz) {
  const dist = Math.hypot(lx, ly);
  const baseAngle = Math.atan2(ly, lx);
  switch (style) {
    case 1: { // espiral — gira ao sair
      const spiral = baseAngle + dist/sz*Math.PI;
      return { vx: Math.cos(spiral)*(80+dist*2), vy: Math.sin(spiral)*(80+dist*2), vr: 4*(lx>0?1:-1) };
    }
    case 2: { // radial rápido — tudo explode para fora veloz
      const a = baseAngle + (Math.random()-0.5)*0.4;
      return { vx: Math.cos(a)*(140+dist*3), vy: Math.sin(a)*(140+dist*3), vr: (Math.random()-0.5)*9 };
    }
    case 3: { // ondas — fragmentos sobem/descem em camadas
      const wave = Math.sin(lx/sz*Math.PI*2)*120;
      return { vx: (lx/sz)*90 + (Math.random()-0.5)*40, vy: wave + (Math.random()-0.5)*60, vr: (Math.random()-0.5)*6 };
    }
    case 4: { // caos total
      const ca = Math.random()*Math.PI*2;
      return { vx: Math.cos(ca)*(50+Math.random()*200), vy: Math.sin(ca)*(50+Math.random()*200), vr: (Math.random()-0.5)*12 };
    }
    case 5: { // vórtice — gira em torno do centro enquanto expande
      const perp = baseAngle + Math.PI/2;
      return { vx: Math.cos(perp)*90 + Math.cos(baseAngle)*60, vy: Math.sin(perp)*90 + Math.sin(baseAngle)*60, vr: 6*(Math.sin(baseAngle)>0?1:-1) };
    }
    case 6: { // chuva — cai para baixo com espalhamento lateral
      return { vx: (Math.random()-0.5)*120, vy: 80 + Math.random()*160, vr: (Math.random()-0.5)*7 };
    }
    default: { // grade normal
      const a = baseAngle + (Math.random()-0.5)*0.8;
      return { vx: Math.cos(a)*(70+dist*1.6+Math.random()*90), vy: Math.sin(a)*(70+dist*1.6+Math.random()*90), vr: (Math.random()-0.5)*5 };
    }
  }
}

// skinId → estilo de estilhaço (0-6)
const SKIN_SHARD_STYLE = [0, 3, 1, 2, 5, 4, 6];

function createShards(skin, originX, originY, angle=0) {
  const shards = [];
  const COLS = 7, ROWS = 7;
  const sz = skin._size ?? 72;
  const style = SKIN_SHARD_STYLE[skin.id] ?? 0;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const rotateVec = (x, y) => ({ x:x*ca - y*sa, y:x*sa + y*ca });

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const lx = (col / COLS - 0.5 + 0.5/COLS) * sz;
      const ly = (row / ROWS - 0.5 + 0.5/ROWS) * sz;
      const dist = Math.hypot(lx, ly);
      if (dist > sz * 0.64) continue;

      const { vx, vy, vr } = _shardStyle(style, lx, ly, sz);
      const pos = rotateVec(lx, ly);
      const vel = rotateVec(vx, vy);
      shards.push({
        wx: originX + pos.x,
        wy: originY + pos.y,
        vx:vel.x, vy:vel.y, rot: angle + (Math.random()-0.5)*0.25, targetRot:angle, vr,
        lx, ly,
        sx: col*(sz/COLS), sy: row*(sz/ROWS),
        sw: sz/COLS, sh: sz/ROWS,
        hw: sz/COLS/2, hh: sz/ROWS/2,
        scale:1,
        delay:Math.min(0.55, dist/(sz*1.55) + Math.random()*0.18),
        img: skin.img,
      });
    }
  }
  return shards;
}

// ── Mira espiral ─────────────────────────────────────────────
export function drawCrosshair(ctx, wx, wy, age) {
  const t=age*3, R=16;
  ctx.save(); ctx.translate(wx,wy);

  ctx.save(); ctx.rotate(t*0.7);
  ctx.strokeStyle='rgba(0,200,240,0.7)'; ctx.lineWidth=1; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();

  ctx.save(); ctx.rotate(-t*0.4);
  ctx.strokeStyle='rgba(0,200,240,0.3)'; ctx.lineWidth=0.8; ctx.setLineDash([3,6]);
  ctx.beginPath(); ctx.arc(0,0,R+5,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();

  const cl=8, gap=3;
  ctx.strokeStyle='rgba(0,220,255,0.9)'; ctx.lineWidth=1.2; ctx.shadowColor='#00c8f0'; ctx.shadowBlur=6;
  ctx.beginPath();
  ctx.moveTo(-cl-gap,0); ctx.lineTo(-gap,0); ctx.moveTo(gap,0); ctx.lineTo(cl+gap,0);
  ctx.moveTo(0,-cl-gap); ctx.lineTo(0,-gap); ctx.moveTo(0,gap); ctx.lineTo(0,cl+gap);
  ctx.stroke();

  ctx.fillStyle='#ffffff'; ctx.shadowBlur=8;
  ctx.beginPath(); ctx.arc(0,0,1.5,0,Math.PI*2); ctx.fill();

  ctx.beginPath(); ctx.shadowBlur=0; ctx.strokeStyle='rgba(0,200,240,0.2)'; ctx.lineWidth=0.7;
  for (let i=0;i<60;i++){const a=(i/60)*Math.PI*4+t*0.5,sr=(i/60)*R*0.7;if(i===0)ctx.moveTo(Math.cos(a)*sr,Math.sin(a)*sr);else ctx.lineTo(Math.cos(a)*sr,Math.sin(a)*sr);}
  ctx.stroke();
  ctx.restore();
}

// ── Indicador de alvo travado (auto-mira no modo touch) ──────
// Mira em "cantos" girando ao redor do alvo, em dourado/vermelho para
// destacar do crosshair ciano de mira livre — comunica "travado" vs "livre".
export function drawTargetLock(ctx, wx, wy, age) {
  const t=age*2.4, R=22;
  ctx.save(); ctx.translate(wx,wy);

  ctx.strokeStyle='rgba(255,77,106,0.85)'; ctx.lineWidth=2; ctx.lineCap='round';
  ctx.shadowColor='#ff4d6a'; ctx.shadowBlur=8;
  const cl=9;
  for (let i=0;i<4;i++){
    ctx.save(); ctx.rotate(t*0.6 + i*Math.PI/2);
    ctx.beginPath();
    ctx.moveTo(R-cl, -R); ctx.lineTo(R, -R); ctx.lineTo(R, -R+cl);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save(); ctx.rotate(-t*0.5);
  ctx.strokeStyle='rgba(255,204,68,0.55)'; ctx.lineWidth=1; ctx.setLineDash([4,5]);
  ctx.beginPath(); ctx.arc(0,0,R-7,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();

  ctx.fillStyle='#ffcc44'; ctx.shadowColor='#ffcc44'; ctx.shadowBlur=8;
  ctx.beginPath(); ctx.arc(0,0,2,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

export class Player {
  constructor({ x, y, skinIndex=0, name='Jogador' }) {
    this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.r=38; this.angle=-Math.PI/2;
    this.skinIndex=skinIndex;
    this.skin=SKINS[skinIndex]||SKINS[0];
    this.name=name;

    this.hp=HP_MAX; this.maxHp=HP_MAX;
    this.shield=0; this.maxShield=SHIELD_MAX;
    this.mana=MANA_MAX; this.maxMana=MANA_MAX;
    this.xp=0; this.level=1; this.xpToNext=100;
    this.levelUpEnabled=true; // desativado no Contra1 (partida curta, 1 inimigo)
    this.score=0; this.kills=0; this.itemsCollected=0;
    this.team=null; // atribuído no modo "Equipe Online" (PvP em times)
    this.itemTypeCounts={}; // { 'HEALTH': 3, 'MINE': 1, ... }

    this.activeWeaponType = null;
    this.weaponSlots = [null,null,null,null,null]; // slots R T Y U I
    this.extraWeaponSlot = null;                   // slot extra L
    this.activeWeaponSlot = -1;
    this._weaponCooldowns = {};

    this.shootCd=0; this.dashCd=0; this.dashTimer=0;
    this.dashDx=0; this.dashDy=0; this.dashing=false; this.invincible=0;
    this.magnetTimer=0; this.rapidTimer=0;
    this.boostTimer=0; this.freezeTimer=0;
    this.slowTimer=0; this.blindTimer=0;
    // novos timers
    this.multishotTimer=0; this.piercingTimer=0; this.dashBoostTimer=0;
    this.regenTimer=0;     this.shieldAuraTimer=0; this.overclockTimer=0;
    this.invisibleTimer=0; this.godmodeTimer=0;    this.vampireTimer=0;
    this.poisonTimer=0;    this.missileTimer=0;
    this.inventory = new Inventory();

    this._holdMove=false; this._moving=false;
    this._targetX=x; this._targetY=y;

    this.flames=[]; this._alienAngle=0; this._age=0; this._aimAngle=-Math.PI/2;
    this.trail=[]; this._trailTimer=0; this.equippedTrailId=0;
    this.dashGhosts=[]; this._dashGhostTimer=0;
    this._recoil=0; this._recoilDx=0; this._recoilDy=0;

    // Sistema de descarte por inatividade de inventário
    // 90s sem usar item → descarta 1; 60s de intervalo entre descartes
    this._idleItemTimer = 90;
    this._idleCooldown  = 0;
    this._ejectAnim     = [];
    this._pendingEject  = null;

    // Estado de morte e reconstrução
    this.dead=false;
    this.rebuilding=false;
    this.rebuildTimer=0;
    this.shards=[];
    this._shardX=x; this._shardY=y;
    this._explodeAge=0;

    this._lifeTimer=0;
    this._audio=null;

    // ── Modo Cards of Defense ──
    this._isCardsMode=false;
    // Multiplicadores aplicados por cartas (permanentes)
    this._cardDmgMult=1;       // dano de projétil
    this._cardSpeedMult=1;     // velocidade
    this._cardShootMult=1;     // cooldown de tiro (multiplicador: <1 = mais rápido)
    this._cardLifeSteal=0;     // fração de life-steal no dano
    this._cardMultiBarrel=0;   // 0=simples,1=duplo,2=triplo,3=quádruplo
    this._cardBurstDash=0;     // dano de área no dash
    this._cardBurstDashStun=0; // duração do stun no dash explosivo
    this._cardMagnetMult=1;    // raio de coleta
    this._cardLucky=0;         // chance extra de item raro (0-1)
    this._cardHpBonus=0;       // HP extra adicionado por cartas
    this._cardShieldBonus=0;   // escudo extra adicionado por cartas
    this._cardVampire=0;       // fraction life-steal combinada com _cardLifeSteal
    this._cardsOwned=[];       // array de { id, level } cartas ativas
    this._cardSkinDmgBonus=1;  // bônus por skin comprada
    this._cardSkinRegenBonus=1;
    // Propulsão cards: partículas extras de chama coloridas
    this._cardFlames=[];
  }

  setAudio(a) { this._audio=a; }
  get hasMagnet()    { return this.magnetTimer>0; }
  get hasRapid()     { return this.rapidTimer>0; }
  get hasBoost()     { return this.boostTimer>0; }
  get isSlowed()     { return this.slowTimer>0; }
  get isBlind()      { return this.blindTimer>0; }
  get isFrozen()     { return this.freezeTimer>0; }
  get isAlien()      { return this.skin.isAlien; }
  get hasMultishot() { return this.multishotTimer>0; }
  get hasPiercing()  { return this.piercingTimer>0; }
  get hasDashBoost() { return this.dashBoostTimer>0; }
  get hasOverclock() { return this.overclockTimer>0; }
  get isInvisible()  { return this.invisibleTimer>0; }
  get isGodmode()    { return this.godmodeTimer>0; }
  get isVampire()    { return this.vampireTimer>0; }
  get isPoisoned()      { return this.poisonTimer>0; }
  get hasMissileMode()  { return this.missileTimer>0; }

  moveTo(wx,wy) { this._targetX=wx; this._targetY=wy; this._moving=true; }

  _currentDrawAngle() {
    if (this.skin.spinsOnAxis) return this._alienAngle * 2.5;
    if (this.isAlien) return this.angle + this._alienAngle;
    return this.angle;
  }

  _pushDashGhost() {
    this.dashGhosts.push({
      x:this.x, y:this.y,
      angle:this._currentDrawAngle(),
      life:0.18, maxLife:0.18,
    });
    if (this.dashGhosts.length > 8) this.dashGhosts.shift();
  }

  _updateDashGhosts(dt) {
    for (const g of this.dashGhosts) g.life -= dt;
    this.dashGhosts = this.dashGhosts.filter(g => g.life > 0);
  }

  _drawDashGhosts(ctx) {
    if (!this.dashGhosts.length) return;
    const color = this.skin.dashColor || this.skin.color || '#ffffff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.dashGhosts) {
      const t = g.life / g.maxLife;
      ctx.save();
      ctx.globalAlpha = t * 0.32;
      ctx.translate(g.x, g.y);
      ctx.rotate(g.angle);
      ctx.shadowColor = color;
      ctx.shadowBlur = 18 * t;
      drawTintedSkin(ctx, this.skin, 1.76, color);
      ctx.restore();
    }
    ctx.restore();
  }

  // Chamado pelo combat: player perde vida
  startRebuild(x, y) {
    const ox = x||this.x, oy = y||this.y;
    this.dead=false;
    this.rebuilding=true;
    this.rebuildTimer=REBUILD_DUR;
    this._explodeAge=0;
    this.shards=createShards(this.skin, ox, oy, this._currentDrawAngle());
    this.dashGhosts=[];
    this.vx=0; this.vy=0;
    this.invincible=REBUILD_DUR+1;
    // Nave reposicionada — shards vão voar e voltar para cá
    this.x=ARENA_W/2+(Math.random()-0.5)*160;
    this.y=ARENA_H/2+(Math.random()-0.5)*160;
  }

  // collision=true: batida física — escudo absorve só 50%, resto passa pro HP
  takeDamage(amount, collision=false) {
    if (this.dashing||this.invincible>0||this.dead||this.rebuilding) return false;
    this._hitFlash = Math.max(this._hitFlash || 0, 0.08);
    this._hitFlashMax = Math.max(this._hitFlashMax || 0, this._hitFlash);
    this._hitFlashColor = '#ffffff';
    this._hitFlashManaged = false;
    if (this.shield>0) {
      const absEff = collision ? 0.5 : 1.0; // colisão penetra 50% do escudo
      const abs = Math.min(this.shield, amount * absEff);
      this.shield -= abs;
      amount -= abs; // só desconta o que o escudo realmente bloqueou
    }
    if (amount>0) {
      this.hp=Math.max(0,this.hp-amount);
      this._audio?.playHit();
      if (this.hp<=0) return true;
    }
    return false;
  }

  heal(v)      { this.hp=Math.min(this.maxHp,this.hp+v); }
  addShield(v) { this.shield=Math.min(this.maxShield,this.shield+v); }
  addMana(v)   { this.mana=Math.min(this.maxMana,this.mana+v); }

  addXP(v) {
    this.xp+=v;
    if (!this.levelUpEnabled) return false;
    if (this.xp>=this.xpToNext) {
      this.xp-=this.xpToNext; this.level++;
      this.xpToNext=Math.floor(this.xpToNext*1.5);
      this.maxHp+=20; this.hp=Math.min(this.maxHp,this.hp+40);
      this._audio?.playLevelUp(); return true;
    }
    return false;
  }

  collectItem(it) {
    this.itemsCollected++;
    this.itemTypeCounts[it.type] = (this.itemTypeCounts[it.type] || 0) + 1;
    this._audio?.playCollect();
    const def = it.def;

    // Malefício — efeito imediato negativo (não vai para slot)
    if (def.harmful) { this.applyHarmful(it.type); return { type:'harmful', item:it }; }

    // Arma — vai para slot de arma (R T Y U I ou L extra)
    if (def.weaponType) {
      const r = this.equipWeapon(it.type);
      return { type:'weapon', item:it, slot: r?.slot, extra: r?.extra };
    }

    // Todos os outros itens vão para o inventário (slot 1-5 ou extra X)
    const result = this.inventory.add(it.type);
    if (!result) return null; // sem espaço algum
    return { type:'stored', slot: result.slot, extra: result.extra, item:it };
  }

  _applyImmediate(type, bonus=false) {
    const mult = bonus ? 1.5 : 1;
    switch(type) {
      case 'HEALTH':     this.heal(Math.round(60*mult));              return { type:'used', itemType:type, color:'#ff3366' };
      case 'HEALTH_BIG': this.heal(Math.round(150*mult));             return { type:'used', itemType:type, color:'#ff6699' };
      case 'SHIELD':     this.addShield(Math.round(50*mult));         return { type:'used', itemType:type, color:'#00aaee' };
      case 'SHIELD_BIG': this.addShield(Math.round(120*mult));        return { type:'used', itemType:type, color:'#44ccff' };
      case 'MANA':       this.addMana(Math.round(60*mult));           return { type:'used', itemType:type, color:'#4488ff' };
      case 'MANA_FULL':  this.addMana(this.maxMana);                  return { type:'used', itemType:type, color:'#88aaff' };
    }
    return null;
  }

  _applyUsable(type, bonus=false) {
    const m = bonus ? 1.5 : 1;
    const track = (key, val) => { this.inventory.trackEffect(key, val); return val; };
    switch(type) {
      case 'RAPID':
        this.rapidTimer = track('RAPID', Math.round(8*m));
        return { type:'used', itemType:type, color:'#ff8800' };
      case 'MAGNET':
        this.magnetTimer = track('MAGNET', Math.round(10*m));
        return { type:'used', itemType:type, color:'#00ffee' };
      case 'BOOST':
        this.boostTimer = track('BOOST', Math.round(6*m));
        return { type:'used', itemType:type, color:'#00ff88' };
      case 'MINE':
        return { type:'mine', itemType:type, color:'#ff4400' };
      case 'NUKE':
        return { type:'nuke', itemType:type, color:'#ff2200' };
      case 'FREEZE':
        this.freezeTimer = track('FREEZE', Math.round(4*m));
        return { type:'freeze', itemType:type, color:'#88ddff' };
      case 'MULTISHOT':
        this.multishotTimer = track('MULTISHOT', Math.round(6*m));
        return { type:'used', itemType:type, color:'#ffaa22' };
      case 'PIERCING':
        this.piercingTimer = track('PIERCING', Math.round(7*m));
        return { type:'used', itemType:type, color:'#ff6600' };
      case 'DASH_BOOST':
        this.dashBoostTimer = track('DASH_BOOST', Math.round(8*m));
        return { type:'used', itemType:type, color:'#00ffaa' };
      case 'REGEN':
        this.regenTimer = track('REGEN', Math.round(8*m));
        return { type:'used', itemType:type, color:'#ff88aa' };
      case 'SHIELD_AURA':
        this.shieldAuraTimer = track('SHIELD_AURA', Math.round(8*m));
        return { type:'used', itemType:type, color:'#00ccff' };
      case 'OVERCLOCK':
        this.overclockTimer = track('OVERCLOCK', Math.round(5*m));
        return { type:'used', itemType:type, color:'#ffdd00' };
      case 'INVISIBLE':
        this.invisibleTimer = track('INVISIBLE', Math.round(5*m));
        return { type:'used', itemType:type, color:'#aaaacc' };
      // Lendários
      case 'GODMODE':
        this.godmodeTimer = track('GODMODE', Math.round(4*m));
        this.invincible = Math.max(this.invincible, Math.round(4*m));
        return { type:'used', itemType:type, color:'#ffd700' };
      case 'NOVA':
        return { type:'nova', itemType:type, color:'#ff00ff' };
      case 'VAMPIRO':
        this.vampireTimer = track('VAMPIRO', Math.round(6*m));
        return { type:'used', itemType:type, color:'#cc0044' };
      case 'WARP':
        return { type:'warp', itemType:type, color:'#aa44ff' };
      case 'MISSILE':
        this.missileTimer = track('MISSILE', Math.round(8*m));
        return { type:'used', itemType:type, color:'#ff6600' };
      // Ofensivos — o efeito é aplicado em adversários pelo game.js
      // (player.js só empacota o tipo e a duração; não altera o próprio Player)
      case 'STUN':
        return { type:'stun', itemType:type, color:'#ffe066', duration: Math.round(3*m) };
      case 'DEEP_FREEZE':
        return { type:'deepfreeze', itemType:type, color:'#66ccff', duration: Math.round(2.5*m) };
      case 'CONFUSE':
        return { type:'confuse', itemType:type, color:'#cc66ff', duration: Math.round(5*m) };
    }
    return null;
  }

  useItem(slotIdx) {
    const item = this.inventory.use(slotIdx);
    if (!item) return null;
    this._audio?.playCollect();
    const bonus = item.bonus === true;
    const def = item.def;
    if (!def.usable) {
      // Imediato (HEALTH, SHIELD, MANA)
      return this._applyImmediate(item.type, bonus);
    }
    return this._applyUsable(item.type, bonus);
  }

  applyHarmful(type) {
    switch(type) {
      case 'SLOW':   this.slowTimer=5;   break;
      case 'DRAIN':  this.mana=Math.max(0,this.mana-30); break;
      case 'BLIND':  this.blindTimer=4;  break;
      case 'POISON': this.poisonTimer=5; this._poisonTick=0; break;
    }
  }

  update(dt, input, bullets, combat) {
    this._age+=dt;
    if (this._lifeTimer>0) this._lifeTimer-=dt;

    // ── Reconstrução ─────────────────────────────────────────
    if (this.rebuilding) {
      this.rebuildTimer-=dt;
      this._explodeAge+=dt;
      const explodeDur = Math.min(3.4, REBUILD_DUR * 0.38);
      const phase2 = this._explodeAge > explodeDur;
      const rebuildAngle = this._currentDrawAngle();
      const ca = Math.cos(rebuildAngle);
      const sa = Math.sin(rebuildAngle);
      for (const s of this.shards) {
        if (!phase2) {
          // Fase 1: coordenadas mundo absolutas voam para fora
          const drag = Math.min(1, this._explodeAge * 0.22);
          s.wx += s.vx * dt * (1 - drag * 0.72);
          s.wy += s.vy * dt * (1 - drag * 0.72);
          s.rot += s.vr * dt * (1 - drag * 0.55);
          s.scale = 1 + Math.sin(Math.min(1, this._explodeAge/explodeDur) * Math.PI) * 0.22;
        } else {
          // Fase 2: voltar para posição local relativa à nave reposicionada
          const rawPull = Math.max(0, (this._explodeAge - explodeDur) / Math.max(0.1, REBUILD_DUR - explodeDur));
          const localPull = Math.max(0, Math.min(1, (rawPull - s.delay) / Math.max(0.08, 1 - s.delay)));
          const pull = 1 - Math.pow(1 - localPull, 3);
          const targetWx = this.x + s.lx*ca - s.ly*sa;
          const targetWy = this.y + s.lx*sa + s.ly*ca;
          const snap = Math.min(1, 0.08 + pull * 0.22);
          s.wx += (targetWx - s.wx) * snap;
          s.wy += (targetWy - s.wy) * snap;
          let da = rebuildAngle - s.rot;
          while (da > Math.PI) da -= Math.PI*2;
          while (da < -Math.PI) da += Math.PI*2;
          s.rot += da * snap;
          s.targetRot = rebuildAngle;
          s.scale += (1 - s.scale) * Math.min(1, 0.12 + pull * 0.2);
        }
      }
      if (this.rebuildTimer<=0) {
        this.rebuilding=false;
        this.shards=[];
        this.hp=this.maxHp;
        this.mana=this.maxMana;
        this.invincible=2;
      }
      return;
    }

    if (this.invincible>0)      this.invincible-=dt;
    if (this.shootCd>0)         this.shootCd-=dt;
    if (this._recoil>0)         this._recoil=Math.max(0,this._recoil-dt*12);
    if (this._hitFlash>0 && !this._hitFlashManaged) {
      this._hitFlash=Math.max(0,this._hitFlash-dt);
      if (this._hitFlash<=0) this._hitFlashMax=0;
    }
    if (this.dashCd>0)          this.dashCd-=dt;
    if (this.magnetTimer>0)     this.magnetTimer-=dt;
    if (this.rapidTimer>0)      this.rapidTimer-=dt;
    if (this.boostTimer>0)      this.boostTimer-=dt;
    if (this.slowTimer>0)       this.slowTimer-=dt;
    if (this.blindTimer>0)      this.blindTimer-=dt;
    if (this.freezeTimer>0)     this.freezeTimer-=dt;
    if (this.multishotTimer>0)  this.multishotTimer-=dt;
    if (this.piercingTimer>0)   this.piercingTimer-=dt;
    if (this.dashBoostTimer>0)  this.dashBoostTimer-=dt;
    if (this.overclockTimer>0)  this.overclockTimer-=dt;
    if (this.invisibleTimer>0)  this.invisibleTimer-=dt;
    if (this.godmodeTimer>0)    this.godmodeTimer-=dt;
    if (this.vampireTimer>0)    this.vampireTimer-=dt;
    if (this.missileTimer>0)    this.missileTimer-=dt;
    if (this.poisonTimer>0) {
      this.poisonTimer-=dt;
      // veneno drena HP ao longo do tempo
      this._poisonTick=(this._poisonTick||0)+dt;
      if (this._poisonTick>=0.5) { this._poisonTick=0; this.hp=Math.max(1,this.hp-4); }
    }
    if (this.regenTimer>0) {
      this.regenTimer-=dt;
      this.heal(12*dt); // +12 HP/s
    }
    if (this.shieldAuraTimer>0) {
      this.shieldAuraTimer-=dt;
      this.addShield(10*dt); // +10 shield/s
    }
    if (this.godmodeTimer>0) this.invincible=Math.max(this.invincible, 0.1);
    if (this.isAlien || this.skin.spinsOnAxis) this._alienAngle+=dt*0.8;
    this.inventory.update(dt);

    // Bico aponta para o mouse — ângulo direto sem interpolação para mira rápida
    const aimDx=input.worldMouseX-this.x, aimDy=input.worldMouseY-this.y;
    this._aimAngle=Math.atan2(aimDy,aimDx)+Math.PI/2;
    // Naves que giram no eixo: this.angle não muda com o mouse (só _aimAngle é usado no tiro)
    if (!this.skin.spinsOnAxis) this.angle=this._aimAngle;

    // ── Locomoção com mana ────────────────────────────────────
    const canMove = this.mana > 0;
    if (input.holdRight) {
      // moveTargetX/Y permite desacoplar a direção de movimento da mira
      // (usado no modo touch: alvo fixo no inimigo mais próximo enquanto
      // o joystick controla o deslocamento livremente)
      this._targetX = input.moveTargetX ?? input.worldMouseX;
      this._targetY = input.moveTargetY ?? input.worldMouseY;
      if (canMove) this._moving=true;
    }

    if (this.dashTimer>0) {
      this.dashTimer-=dt;
      this.x+=this.dashDx*DASH_SPEED*dt; this.y+=this.dashDy*DASH_SPEED*dt;
      this.mana=Math.max(0,this.mana-MANA_DASH*dt*3);
      this._dashGhostTimer-=dt;
      if (this._dashGhostTimer<=0) {
        this._dashGhostTimer=0.025;
        this._pushDashGhost();
      }
      if (this.dashTimer<=0) this.dashing=false;
    } else if (input.dash && this.dashCd<=0 && this._moving && this.mana>=MANA_DASH) {
      const ddx=this._targetX-this.x, ddy=this._targetY-this.y;
      const len=Math.hypot(ddx,ddy)||1;
      this.dashDx=ddx/len; this.dashDy=ddy/len;
      const fullHp = this.hp >= this.maxHp * 0.90;
      if (fullHp) {
        // Dash completo — vida cheia
        this.dashing=true; this.dashTimer=DASH_DUR;
        this.invincible=DASH_DUR+0.08;
      } else {
        // Sem vida cheia: converte parte do HP em mana e realiza dash reduzido
        const hpCost = this.maxHp * 0.12; // consome 12% do HP máximo
        if (this.hp > hpCost + 10) {
          this.hp = Math.max(10, this.hp - hpCost);
          this.addMana(Math.min(this.maxMana - this.mana, hpCost * 0.5));
          this.dashing=true; this.dashTimer=DASH_DUR*0.6; // dash menor
          this.invincible=DASH_DUR*0.6+0.05;
        } else {
          // HP insuficiente para o custo — dash não acontece
          this.dashCd=0; // sem penalidade de cooldown
          return; // sai da lógica
        }
      }
      this.dashCd=DASH_CD*(this.hasDashBoost?0.4:1);
      this.mana=Math.max(0,this.mana-MANA_DASH);
      this._dashGhostTimer=0;
      this._pushDashGhost();
    } else {
      if (this._moving && canMove) {
        const ddx=this._targetX-this.x, ddy=this._targetY-this.y;
        const dist=Math.hypot(ddx,ddy);
        if (dist<5&&!input.holdRight) { this._moving=false; }
        else {
          const spd=SPEED*(this.hasRapid?1.35:1)*(this.hasBoost?1.5:1)*(this.isSlowed?0.45:1)*this._cardSpeedMult;
          this.vx+=(((ddx/Math.max(dist,1))*spd)-this.vx)*Math.min(1,9*dt);
          this.vy+=(((ddy/Math.max(dist,1))*spd)-this.vy)*Math.min(1,9*dt);
          this.mana=Math.max(0,this.mana-MANA_MOVE*dt);
        }
      } else {
        // Sem mana ou parado: desacelera suavemente (nunca trava)
        this.vx*=(1-5*dt); this.vy*=(1-5*dt);
        if (!this._moving || !canMove) {
          this.mana=Math.min(this.maxMana,this.mana+MANA_REGEN*dt);
          // Quando mana recarrega suficiente, libera movimento novamente
          if (!canMove && this.mana>=10) this._moving=false;
        }
      }
      this.x+=this.vx*dt; this.y+=this.vy*dt;
    }
    this._updateDashGhosts(dt);

    // Regen extra quando completamente parado
    if (Math.hypot(this.vx,this.vy)<5) {
      this.mana=Math.min(this.maxMana,this.mana+MANA_REGEN*0.5*dt);
    }

    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    if (this.x<=this.r||this.x>=ARENA_W-this.r||this.y<=this.r||this.y>=ARENA_H-this.r) this._moving=false;

    // ── Chamas nos motores ───────────────────────────────────
    if (this._isCardsMode) {
      this._updateCardsThrust(dt);
    } else if (!this.isAlien && (this._moving || this.skin.spinsOnAxis)) {
      const visualAngle = this.skin.spinsOnAxis ? (this._alienAngle * 2.5) : this.angle;
      const engPoints=this.skin.getEngines(this.x,this.y,visualAngle,1.76);
      const intensity=this.skin.spinsOnAxis ? 0.8 : this.mana/this.maxMana;
      for (const ep of engPoints) spawnFlameAt(this.flames,ep.x,ep.y,visualAngle,intensity,this.skin.flameColors);
    }
    if (!this._isCardsMode) this.flames=updateFlames(this.flames,dt);

    // ── Rastro visual cosmético ──────────────────────────────
    const trailDef = TRAILS[this.equippedTrailId];
    if (trailDef && trailDef.style !== 'none') {
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > 20) {
        this._trailTimer -= dt;
        if (this._trailTimer <= 0) {
          // Emite atrás do centro da nave
          const spacing = trailDef.style === 'smoke' ? 0.045 : 0.03;
          this._trailTimer = spacing;
          spawnTrailPoint(this.trail, this.x, this.y);
        }
      }
    }
    this.trail = updateTrail(this.trail, dt);

    const spd=Math.hypot(this.vx,this.vy);
    this._audio?.setEngineIntensity(0.3+(spd/SPEED)*0.7);

    // ── Tiro com Espaço ──────────────────────────────────────
    const cd=(this.hasRapid ? SHOOT_CD*0.35 : SHOOT_CD) * this._cardShootMult;
    if (input.space && this.shootCd<=0) {
      this._shoot(input.worldMouseX, input.worldMouseY, bullets, combat);
      this.shootCd=cd;
      this._audio?.playShoot();
    }

    // ── Descarte por inatividade ──────────────────────────────
    this._updateEjectAnim(dt);
    this._updateInventoryDecay(dt);
  }

  _updateInventoryDecay(dt) {
    const hasAnyItem = this.inventory.slots.some(s=>s!==null) || this.inventory.extraSlot !== null;
    if (!hasAnyItem) { this._idleItemTimer=90; this._idleCooldown=0; return; }

    if (this._idleCooldown > 0) { this._idleCooldown-=dt; return; }

    this._idleItemTimer -= dt;
    if (this._idleItemTimer > 0) return;

    const ejected = this._ejectOneItem();
    if (ejected) {
      this._idleItemTimer = 90;
      this._idleCooldown  = 30;
      this._spawnEjectParticles(ejected);
      this._pendingEject  = ejected; // game.js vai buscar com consumeEjectedItem()
    } else {
      this._idleItemTimer = 90;
    }
  }

  _ejectOneItem() {
    // Descarta do slot extra primeiro, depois dos slots normais (do 4 ao 0)
    if (this.inventory.extraSlot) {
      const it = this.inventory.extraSlot;
      this.inventory.extraSlot = null;
      return it;
    }
    for (let i=4;i>=0;i--) {
      if (this.inventory.slots[i]) {
        const it = this.inventory.slots[i];
        this.inventory.slots[i] = null;
        return it;
      }
    }
    return null;
  }

  _spawnEjectParticles(item) {
    const color = item.def?.color || '#ffffff';
    for (let i=0;i<12;i++) {
      const a=Math.random()*Math.PI*2, sp=60+Math.random()*120;
      this._ejectAnim.push({
        x:this.x, y:this.y,
        vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
        life:1, color,
        r:3+Math.random()*4,
      });
    }
  }

  _updateEjectAnim(dt) {
    for (const p of this._ejectAnim) {
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      p.vx*=0.92; p.vy*=0.92;
      p.life-=dt*1.2;
    }
    this._ejectAnim=this._ejectAnim.filter(p=>p.life>0);
  }

  // Chamado pelo game.js quando o player usa um item — reseta o contador de inatividade
  notifyItemUsed() {
    this._idleItemTimer = 90;
    this._idleCooldown  = 0;
  }

  // Lê e consome o item descartado desta frame (se houver)
  consumeEjectedItem() {
    const it = this._pendingEject || null;
    this._pendingEject = null;
    return it;
  }

  equipWeapon(type) {
    // Tenta colocar no primeiro slot de arma vazio (R T Y U I)
    if (!this.weaponSlots) { this.weaponSlots = [null,null,null,null,null]; this.activeWeaponSlot = -1; this.extraWeaponSlot = null; }
    const empty = this.weaponSlots.indexOf(null);
    if (empty !== -1) {
      this.weaponSlots[empty] = type;
      if (this.activeWeaponSlot === -1) this.activeWeaponSlot = empty;
      this.activeWeaponType = this.weaponSlots[this.activeWeaponSlot];
      return { slot: empty, extra: false };
    }
    // Slots cheios — vai para slot extra L (substitui o anterior)
    this.extraWeaponSlot = type;
    return { slot: 5, extra: true };
  }

  selectWeaponSlot(idx) {
    if (!this.weaponSlots) return;
    if (idx === 5) {
      if (!this.extraWeaponSlot) return;
      this.activeWeaponSlot = 5;
      this.activeWeaponType = this.extraWeaponSlot;
    } else {
      if (!this.weaponSlots[idx]) return;
      this.activeWeaponSlot = idx;
      this.activeWeaponType = this.weaponSlots[idx];
    }
  }

  dropExtraWeapon() {
    if (!this.weaponSlots) return;
    if (this.activeWeaponSlot === 5) {
      this.extraWeaponSlot = null;
      // volta para o primeiro slot com arma
      const fallback = this.weaponSlots.findIndex(w => w !== null);
      this.activeWeaponSlot = fallback;
      this.activeWeaponType = fallback >= 0 ? this.weaponSlots[fallback] : null;
    } else {
      this.extraWeaponSlot = null;
    }
  }

  _shoot(tx, ty, bullets, combat) {
    const shootAngle = this._aimAngle ?? this.angle;
    const nozzle = this.skin.getNozzle(this.x, this.y, shootAngle, 1.76);
    const recoilAngle = Math.atan2(ty - nozzle.y, tx - nozzle.x);
    this._recoil = 1;
    this._recoilDx = -Math.cos(recoilAngle) * 3;
    this._recoilDy = -Math.sin(recoilAngle) * 3;
    const rawDmg = (38 + (this.level-1)*5) * (this.hasOverclock ? 2 : 1);
    const baseDmg = rawDmg * this._cardDmgMult * this._cardSkinDmgBonus
                  * (this._cardBerserker && this.hp < this.maxHp * 0.30 ? 1.50 : 1);

    // Buff de míssil ativo: cada tiro vira um míssil teleguiado
    if (this.hasMissileMode && combat) {
      const mx = tx - nozzle.x, my = ty - nozzle.y;
      combat.launchPlayerMissile(nozzle.x, nozzle.y, mx, my, this);
      return;
    }

    const mx = tx - nozzle.x, my = ty - nozzle.y;
    const baseAngle = Math.atan2(my, mx);

    const _spawnBullet = (dx, dy, dmg=baseDmg, angleOffset=0, extraProps={}) => {
      let adx = dx, ady = dy;
      if (angleOffset !== 0) {
        const c = Math.cos(angleOffset), s2 = Math.sin(angleOffset);
        adx = dx*c - dy*s2; ady = dx*s2 + dy*c;
      }
      if (this._cardBlindFire) {
        const jitter = (Math.random() - 0.5) * 2 * this._cardBlindFire;
        const cj = Math.cos(jitter), sj = Math.sin(jitter);
        adx = adx*cj - ady*sj; ady = adx*sj + ady*cj;
      }
      const d = Math.hypot(adx, ady) || 1;
      const sp = extraProps.speed || 600;
      bullets.push({
        x: nozzle.x, y: nozzle.y,
        vx:(adx/d)*sp, vy:(ady/d)*sp,
        damage: dmg, owner:'player', life: extraProps.life || 1.5,
        owner_color: extraProps.color || (this.hasOverclock ? '#ffdd00' : (this.isVampire ? '#cc0044' : this.skin.color)),
        piercing:     extraProps.piercing ?? this.hasPiercing,
        vampire:      this.isVampire,
        _player:      this,
        dirX: adx/d, dirY: ady/d,
        size:         extraProps.size,
        explosive:    extraProps.explosive,
        bounces:      extraProps.bounces,
        homing:       extraProps.homing,
        toxicDot:     extraProps.toxicDot,
        chainTarget:  extraProps.chainTarget,
        drainMana:    extraProps.drainMana,
        gravityPull:  extraProps.gravityPull,
        quantumSplit: extraProps.quantumSplit,
        weaponType:   this.activeWeaponType,
      });
    };

    // ── Despacha por tipo de arma equipada ──────────────────────
    const wt = this.activeWeaponType;

    if (wt === 'LASER') {
      // Cadência altíssima (shootCd 0.06), bala fina que atravessa tudo — DPS por sustain
      this.shootCd = 0.06;
      _spawnBullet(mx,my, baseDmg*0.55, 0, {speed:1300, life:0.85, color:'#ff0088', piercing:true, size:2.5});
      return;
    }
    if (wt === 'SHOTGUN') {
      // 7 projéteis em cone largo, recarga lenta (shootCd 0.7) — devastador de perto
      this.shootCd = 0.7;
      for (let i=-3;i<=3;i++) _spawnBullet(mx,my, baseDmg*0.7, i*0.16, {speed:560+Math.random()*60, life:0.65, color:'#ff5500', size:i===0?5:4});
      return;
    }
    if (wt === 'SNIPER') {
      // 1 tiro por vez, cooldown enorme (1.4s), dano massivo, perfura
      this.shootCd = 1.4;
      _spawnBullet(mx,my, baseDmg*4.5, 0, {speed:1600, life:1.8, color:'#00ffcc', size:8, piercing:true});
      // Flash de muzzle: bala menor atrás
      setTimeout(()=>{ if(!this.dead) _spawnBullet(mx,my, 0, 0, {speed:800, life:0.15, color:'#aaffee', size:3, piercing:true}); }, 0);
      return;
    }
    if (wt === 'BOUNCER') {
      // 2 balas com 8 bounces cada — ricocheteiam pelo mapa
      this.shootCd = 0.45;
      _spawnBullet(mx,my, baseDmg*1.0, 0,    {speed:480, life:4, color:'#ffee00', bounces:8});
      _spawnBullet(mx,my, baseDmg*1.0, 0.25, {speed:480, life:4, color:'#ffcc00', bounces:8});
      return;
    }
    if (wt === 'FLAMETHROWER') {
      // Cone denso de 6 projéteis curtos com tamanho aleatório — área de negação
      this.shootCd = 0.09;
      for (let i=0;i<3;i++) {
        const off=(Math.random()-0.5)*0.55;
        _spawnBullet(mx,my, baseDmg*0.38, off, {speed:320+Math.random()*120, life:0.55, color:i%2?'#ff6600':'#ff2200', size:8+Math.random()*8});
      }
      return;
    }
    if (wt === 'PLASMA') {
      // Orbe lento que explode em área grande — cooldown 1.1s
      this.shootCd = 1.1;
      _spawnBullet(mx,my, baseDmg*2.5, 0, {speed:260, life:3, color:'#aa00ff', size:18, explosive:true});
      return;
    }
    if (wt === 'RAILGUN') {
      // Dispara 3 raios seguidos (burst), cada um atravessa — cooldown 0.9s
      this.shootCd = 0.9;
      for (let i=0;i<3;i++) {
        setTimeout(()=>{ if(!this.dead) _spawnBullet(mx,my, baseDmg*1.8, 0, {speed:1600, life:1.0, color:'#00ff88', size:5, piercing:true}); }, i*80);
      }
      return;
    }
    if (wt === 'HOMING') {
      // 2 mísseis teleguiados por tiro — sempre encontram o alvo
      this.shootCd = 0.55;
      _spawnBullet(mx,my, baseDmg*1.0, 0.12, {speed:340, life:4, color:'#ff44aa', homing:true});
      _spawnBullet(mx,my, baseDmg*1.0,-0.12, {speed:340, life:4, color:'#ff66cc', homing:true});
      return;
    }
    if (wt === 'BURST') {
      // Rajada de 5 balas rápidas, ângulo levemente variado — spray controlado
      this.shootCd = 0.5;
      for (let i=0;i<5;i++) {
        const off=(i-2)*0.05 + (Math.random()-0.5)*0.04;
        setTimeout(()=>{ if(!this.dead) _spawnBullet(mx,my, baseDmg*0.72, off, {speed:580+i*20, color:'#ffbb00'}); }, i*40);
      }
      return;
    }
    if (wt === 'BOOMERANG') {
      // Bala que vai e volta — bounces 2, vida longa
      this.shootCd = 0.6;
      _spawnBullet(mx,my, baseDmg*1.6, 0, {speed:500, life:2.5, color:'#00eeff', bounces:2, size:8});
      return;
    }
    if (wt === 'GRAVITY') {
      // Orbe que puxa todos os inimigos próximos em área grande
      this.shootCd = 0.8;
      _spawnBullet(mx,my, baseDmg*0.9, 0, {speed:380, life:2.2, color:'#8844ff', gravityPull:350, size:14});
      return;
    }
    if (wt === 'EXPLOSIVE') {
      // Projétil que explode E spawna 4 fragmentos em X ao impacto
      this.shootCd = 0.65;
      _spawnBullet(mx,my, baseDmg*1.8, 0, {speed:420, life:1.8, color:'#ff6600', size:12, explosive:true});
      // fragmentos na direção perpendicular (efeito de fragmentação)
      const perp = baseAngle + Math.PI/2;
      const px=Math.cos(perp), py=Math.sin(perp);
      for(let s of [-1,1]) {
        bullets.push({x:nozzle.x,y:nozzle.y,vx:px*s*300,vy:py*s*300,damage:baseDmg*0.5,owner:'player',life:0.6,owner_color:'#ff8800',_player:this,dirX:px*s,dirY:py*s,weaponType:wt,size:6,explosive:false});
      }
      return;
    }
    if (wt === 'CHAIN') {
      // Raio elétrico que salta entre 4 inimigos
      this.shootCd = 0.35;
      _spawnBullet(mx,my, baseDmg*0.9, 0, {speed:700, life:1.0, color:'#55aaff', chainTarget:4});
      return;
    }
    if (wt === 'STORM') {
      // Dispara em 8 direções ao mesmo tempo — 360°
      this.shootCd = 1.0;
      for (let i=0;i<8;i++) _spawnBullet(mx,my, baseDmg*0.6, i*Math.PI/4, {speed:480, color:'#ccaaff', life:1.4});
      return;
    }
    if (wt === 'VOID_SHOT') {
      // Bala negra que drena mana E cura o jogador ao acertar
      this.shootCd = 0.5;
      _spawnBullet(mx,my, baseDmg*1.6, 0, {speed:480, life:2.2, color:'#8800cc', size:13, drainMana:60, piercing:true});
      return;
    }
    if (wt === 'PHOTON') {
      // Tiro em X (4 direções) + 1 central — cobre toda a área ao redor
      this.shootCd = 0.45;
      _spawnBullet(mx,my, baseDmg*0.9, 0, {speed:900, life:0.9, color:'#ffffff', size:4, piercing:true});
      for (let i=1;i<4;i++) _spawnBullet(mx,my, baseDmg*0.6, i*Math.PI/2, {speed:700, life:0.9, color:'#eeeeff', size:3});
      return;
    }
    if (wt === 'DUAL') {
      // Dois canos paralelos com cadência alta — DPS duplo
      this.shootCd = 0.18;
      const perp = baseAngle + Math.PI/2;
      const off = 12;
      const ox = Math.cos(perp)*off, oy = Math.sin(perp)*off;
      const d = Math.hypot(mx,my)||1;
      bullets.push({x:nozzle.x+ox,y:nozzle.y+oy,vx:(mx/d)*640,vy:(my/d)*640,damage:baseDmg*0.85,owner:'player',life:1.3,owner_color:'#ff8844',_player:this,dirX:mx/d,dirY:my/d,weaponType:wt});
      bullets.push({x:nozzle.x-ox,y:nozzle.y-oy,vx:(mx/d)*640,vy:(my/d)*640,damage:baseDmg*0.85,owner:'player',life:1.3,owner_color:'#ffaa66',_player:this,dirX:mx/d,dirY:my/d,weaponType:wt});
      return;
    }
    if (wt === 'SPREAD') {
      // 9 projéteis em leque completo — controle de multidão
      this.shootCd = 0.6;
      for (let i=-4;i<=4;i++) _spawnBullet(mx,my, baseDmg*0.5, i*0.19, {speed:500+Math.abs(i)*10, color:'#ffcc44', life:0.9});
      return;
    }
    if (wt === 'TOXIC') {
      // Projétil que deixa nuvem de veneno ao impactar (toxicDot nos inimigos que tocarem)
      this.shootCd = 0.35;
      _spawnBullet(mx,my, baseDmg*0.7, 0, {speed:340, life:2.8, color:'#66ff00', size:13, toxicDot:true});
      // segundo projétil tóxico menor em ligeiro offset
      _spawnBullet(mx,my, baseDmg*0.4, (Math.random()-0.5)*0.3, {speed:300, life:2, color:'#44cc00', size:8, toxicDot:true});
      return;
    }
    if (wt === 'QUANTUM') {
      // Ao acertar, divide em 3 que vão para lados diferentes
      this.shootCd = 0.55;
      _spawnBullet(mx,my, baseDmg*1.3, 0, {speed:520, life:2.2, color:'#ff00ff', quantumSplit:true, size:9});
      return;
    }

    // ── Tiro padrão (sem arma especial) ──────────────────────────
    const sp = 600;
    const _spawnDefault = (dx, dy, dmg=baseDmg, angleOffset=0) => {
      let adx = dx, ady = dy;
      if (angleOffset !== 0) {
        const c = Math.cos(angleOffset), s2 = Math.sin(angleOffset);
        adx = dx*c - dy*s2; ady = dx*s2 + dy*c;
      }
      if (this._cardBlindFire) {
        const jitter = (Math.random() - 0.5) * 2 * this._cardBlindFire;
        const cj = Math.cos(jitter), sj = Math.sin(jitter);
        adx = adx*cj - ady*sj; ady = adx*sj + ady*cj;
      }
      const d = Math.hypot(adx, ady) || 1;
      bullets.push({
        x: nozzle.x, y: nozzle.y,
        vx:(adx/d)*sp, vy:(ady/d)*sp,
        damage: dmg, owner:'player', life:1.5,
        owner_color: this.hasOverclock ? '#ffdd00' : (this.isVampire ? '#cc0044' : this.skin.color),
        piercing: this.hasPiercing,
        vampire:  this.isVampire,
        _player:  this,
        dirX: adx/d, dirY: ady/d,
      });
    };

    const extraBarrels = this._cardMultiBarrel || 0;
    if (this.hasMultishot || extraBarrels >= 2) {
      const spread = 0.26;
      _spawnDefault(mx, my);
      _spawnDefault(mx, my, baseDmg * 0.8,  spread);
      _spawnDefault(mx, my, baseDmg * 0.8, -spread);
      if (extraBarrels >= 3) _spawnDefault(mx, my, baseDmg * 0.7, spread * 2);
    } else if (extraBarrels === 1) {
      _spawnDefault(mx, my);
      _spawnDefault(mx, my, baseDmg * 0.85, 0.18);
    } else {
      _spawnDefault(mx, my);
    }
  }

  draw(ctx) {
    // ── Partículas de ejeção de item ─────────────────────────
    for (const p of this._ejectAnim) {
      ctx.globalAlpha = p.life * 0.85;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r*p.life, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // ── Indicador de timer de inatividade (anel na nave) ──────
    if (!this.dead && !this.rebuilding) {
      const hasAny = this.inventory.slots.some(s=>s!==null) || this.inventory.extraSlot;
      if (hasAny && this._idleCooldown<=0) {
        const pct = this._idleItemTimer / 90;
        if (pct < 0.5) { // só mostra nos últimos 45s
          ctx.save();
          ctx.translate(this.x, this.y);
          const warningR = this.r + 16;
          ctx.strokeStyle = pct < 0.2 ? '#ff3333' : '#ffaa00';
          ctx.lineWidth   = 2;
          ctx.globalAlpha = (1-pct)*0.7;
          ctx.setLineDash([4,4]);
          ctx.beginPath();
          ctx.arc(0, 0, warningR, -Math.PI/2, -Math.PI/2 + Math.PI*2*pct, true);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    }

    // ── Reconstrução: desenha estilhaços MAS não some ─────────
    if (this.rebuilding) {
      this._drawRebuild(ctx);
      // continua abaixo para mostrar a nave semi-transparente se fase 2
      if (this._explodeAge < 5) return;
    }

    if (this.dead) return;

    // Rastro cosmético — desenhado antes das chamas e da nave
    drawTrail(ctx, this.trail, TRAILS[this.equippedTrailId]);
    this._drawDashGhosts(ctx);

    // Chamas — discos "UFO" totalmente blindados (noThruster) não emitem
    // nenhum rastro de propulsão, nem o clássico nem o thruster alienígena.
    if (!this.skin.noThruster) {
      if (this._isCardsMode) {
        this._drawCardsThrust(ctx);
      } else if (!this.isAlien) {
        drawFlames(ctx,this.flames);
      } else {
        const e=this.skin.getEngine(this.x,this.y,this.angle,1.76);
        drawAlienThruster(ctx,e.x,e.y,this._age);
      }
    }

    // Nave
    ctx.save();
    ctx.translate(this.x + this._recoilDx*this._recoil, this.y + this._recoilDy*this._recoil);
    if (this.rebuilding) {
      // Fase 2: nave aparece gradualmente conforme reconstrói
      const assemblyPct = Math.max(0,(this._explodeAge-5)/(REBUILD_DUR-5));
      ctx.globalAlpha = assemblyPct * 0.85;
    } else if (this.isInvisible) {
      ctx.globalAlpha=0.18; // invisível: quase transparente para o jogador ver a si mesmo
    } else if (this.isGodmode && Math.floor(Date.now()/60)%2) {
      ctx.globalAlpha=0.6; // godmode: pulso dourado
    } else if (this.invincible>0&&Math.floor(Date.now()/80)%2) {
      ctx.globalAlpha=0.35;
    }
    if (this.skin.spinsOnAxis) {
      ctx.rotate(this._alienAngle * 2.5);
    } else if (this.isAlien) {
      ctx.rotate(this.angle + this._alienAngle);
    } else {
      ctx.rotate(this.angle);
    }
    this.skin.draw(ctx, 1.76);
    if (this._hitFlash>0) {
      const flashT = this._hitFlash / (this._hitFlashMax || 0.08);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.85, flashT * 0.85);
      drawTintedSkin(ctx, this.skin, 1.76, this._hitFlashColor || '#ffffff');
      ctx.restore();
    }
    ctx.restore();

    // ── Barra de vida grudada na nave ────────────────────────
    this._drawAttachedBars(ctx);
    if (this._isCardsMode) this._drawCardsModeHpBar(ctx);

    // Anel magnético
    if (this.hasMagnet) {
      ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(Date.now()/450);
      ctx.strokeStyle='#00ffee55'; ctx.lineWidth=1.5; ctx.setLineDash([4,7]);
      ctx.beginPath(); ctx.arc(0,0,42,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    }

    // Mira no mouse (desenhada externamente via drawCrosshair)
  }

  _drawAttachedBars(ctx) {
    const hpRatio   = Math.max(0, this.hp / this.maxHp);
    const shRatio   = Math.max(0, this.shield / this.maxShield);
    const manaRatio = Math.max(0, this.mana / this.maxMana);
    const hasShield = this.shield > 0;
    const shieldColor = this.skin.shieldColor || '#00c8f0';

    // ── Layout: duas linhas acima da nave ────────────────────
    // Linha de baixo (mais próxima da nave): MANA (azul) — largura total
    // Linha de cima: HP (verde) à esquerda + ESCUDO (ciano) à direita se ativo
    const yBase  = this.y - this.r - 24; // linha inferior (mana)
    const gap    = 4;
    const mh     = 5;   // altura mana
    const bh     = 7;   // altura HP/escudo
    const totalW = 72;
    const bx     = this.x - totalW / 2;
    const yHp    = yBase - mh - gap; // linha superior (hp + escudo)

    // ── Linha inferior: MANA (azul) ──────────────────────────
    ctx.fillStyle = '#08101ecc';
    ctx.fillRect(bx, yBase - mh, totalW, mh);
    ctx.fillStyle = '#4488ff';
    ctx.shadowColor = '#4488ff'; ctx.shadowBlur = 4;
    ctx.fillRect(bx, yBase - mh, totalW * manaRatio, mh);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff14'; ctx.lineWidth = 0.5;
    ctx.strokeRect(bx, yBase - mh, totalW, mh);

    // ── Linha superior: HP (verde) + ESCUDO (ciano) à direita ─
    // Se há escudo: HP ocupa 60% à esquerda, Escudo 40% à direita
    // Se não há escudo: HP ocupa 100%
    const hpW = hasShield ? Math.round(totalW * 0.60) : totalW;
    const shW = hasShield ? totalW - hpW - 2 : 0;
    const shX = bx + hpW + 2;

    // Fundo HP
    ctx.fillStyle = '#08101ecc';
    ctx.fillRect(bx, yHp - bh, hpW, bh);
    // Preenchimento HP
    const hpColor = hpRatio > 0.5 ? '#00e060' : hpRatio > 0.25 ? '#ffcc00' : '#ff2244';
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor; ctx.shadowBlur = 6;
    ctx.fillRect(bx, yHp - bh, hpW * hpRatio, bh);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 0.5;
    ctx.strokeRect(bx, yHp - bh, hpW, bh);

    // Barra de escudo separada à direita
    if (hasShield) {
      // Fundo
      ctx.fillStyle = '#08101ecc';
      ctx.fillRect(shX, yHp - bh, shW, bh);
      // Preenchimento na cor de escudo da skin
      ctx.fillStyle = colorWithAlpha(shieldColor, 0.8);
      ctx.shadowColor = shieldColor; ctx.shadowBlur = 7;
      ctx.fillRect(shX, yHp - bh, shW * shRatio, bh);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = colorWithAlpha(shieldColor, 0.28); ctx.lineWidth = 0.5;
      ctx.strokeRect(shX, yHp - bh, shW, bh);
    }

    // ── Anel de escudo — cobre TODA a nave ───────────────────
    if (hasShield) {
      const shieldR = this.r + 5;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = colorWithAlpha(shieldColor, 0.13); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, shieldR, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = colorWithAlpha(shieldColor, 0.8); ctx.lineWidth = 4;
      ctx.shadowColor = shieldColor; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, shieldR, -Math.PI/2, -Math.PI/2 + Math.PI*2*shRatio);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (shRatio > 0.9) {
        ctx.strokeStyle = colorWithAlpha(shieldColor, 0.28); ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(0, 0, shieldR, 0, Math.PI*2); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Nome acima das barras ─────────────────────────────────
    ctx.fillStyle = '#8ab0cc';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(this.name, this.x, yHp - bh - 2);
  }

  // ── Modo Cards of Defense ─────────────────────────────────────────

  enableCardsMode(hasPurchasedSkin) {
    this._isCardsMode = true;
    this.maxHp  = 600;
    this.hp     = 600;
    this.maxMana= 150;
    this.mana   = 150;
    if (hasPurchasedSkin) {
      this._cardSkinDmgBonus   = 1.10;
      this._cardSkinRegenBonus = 1.15;
    }
  }

  applyCard(cardId, cardLevel) {
    const lv = cardLevel || 1; // 1, 2 ou 3
    this._cardsOwned.push({ id: cardId, level: lv });

    switch (cardId) {
      // ── Passivos de atributo ──────────────────────────────────
      case 'iron_hull': {
        const bonus = [100, 180, 280][lv - 1];
        this.maxHp += bonus;
        this.hp = Math.min(this.maxHp, this.hp + bonus);
        break;
      }
      case 'shield_wall': {
        const bonus = [80, 150, 250][lv - 1];
        this.maxShield += bonus;
        break;
      }
      case 'rapid_core': {
        // diminui o cooldown de tiro; guardamos como multiplicador
        this._cardShootMult = [0.80, 0.65, 0.50][lv - 1];
        break;
      }
      case 'adrenaline': {
        this._cardSpeedMult = [1.25, 1.40, 1.60][lv - 1];
        break;
      }
      case 'mana_surge': {
        const manaBonus = [30, 60, 100][lv - 1];
        this.maxMana += manaBonus;
        this.mana = Math.min(this.maxMana, this.mana + manaBonus);
        break;
      }
      case 'vampire_shot': {
        this._cardLifeSteal = [0.15, 0.25, 0.40][lv - 1];
        break;
      }
      case 'lucky_drop': {
        this._cardLucky = lv; // 1=+40%, 2=+65%, 3=sempre raro
        break;
      }
      // ── Habilidades permanentes ───────────────────────────────
      case 'multi_barrel': {
        this._cardMultiBarrel = lv; // 1=duplo 2=triplo 3=quádruplo
        break;
      }
      case 'magnet_field': {
        this._cardMagnetMult = [2, 3, 4][lv - 1];
        break;
      }
      case 'burst_dash': {
        this._cardBurstDash = [40, 80, 120][lv - 1];
        this._cardBurstDashStun = lv >= 3 ? 1 : 0;
        break;
      }
      // ── Itens de slot permanente ──────────────────────────────
      case 'rapid_charge':
        this.inventory.addPermanent('RAPID', [8, 12, 16][lv - 1]); break;
      case 'freeze_core':
        this.inventory.addPermanent('FREEZE', [4, 7, 10][lv - 1]); break;
      case 'nova_core':
        this.inventory.addPermanent('NOVA', lv); break;
      case 'shield_charge':
        this.inventory.addPermanent('SHIELD_BIG', [120, 200, 300][lv - 1]); break;
      case 'regen_core':
        this.inventory.addPermanent('REGEN', [8, 10, 14][lv - 1]); break;
      // ── Estruturas (itens de colocação na arena) ─────────────
      case 'tower_card':
        this.inventory.addPermanent('TOWER_DEPLOY', lv); break;
      case 'trap_card':
        this.inventory.addPermanent('TRAP_DEPLOY', lv); break;
      // ── Cartas medianas/negativas ─────────────────────────────
      case 'glass_cannon':
        this.maxHp = Math.max(100, Math.round(this.maxHp * 0.70));
        this.hp    = Math.min(this.maxHp, this.hp);
        this._cardDmgMult *= 1.60;
        break;
      case 'cursed_engine':
        this._cardSpeedMult *= 0.80;
        this._cardDmgMult   *= 1.80;
        break;
      case 'blind_fire':
        this._cardBlindFire  = (this._cardBlindFire || 0) + 0.26;
        this._cardDmgMult   *= 1.45;
        break;
      case 'berserker':
        this._cardBerserker  = true;
        break;
      // ── Upgrades globais ──────────────────────────────────────
      case 'power_surge':
        this._cardDmgMult    *= 1.25; break;
      case 'life_weave':
        this.maxHp    = Math.round(this.maxHp * 1.20);
        this.maxShield= Math.round(this.maxShield * 1.20);
        break;
      case 'speed_overclock':
        this._cardSpeedMult *= 1.20; break;
      // ── Fortify (sem efeito direto no player — game.js usa) ──
      case 'fortify':
        this._cardFortify = (this._cardFortify || 0) + 1; break;
    }
  }

  // Barra de HP no modo cards: maior, verde-neon, 40px acima da nave
  _drawCardsModeHpBar(ctx) {
    if (this.dead || this.rebuilding) return;
    const W = 60, H = 12;
    const bx = this.x - W / 2;
    const by = this.y - this.r - 40 - H;
    const ratio = Math.max(0, this.hp / this.maxHp);
    const hpColor = ratio > 0.5 ? '#00ff88' : ratio > 0.25 ? '#ffcc00' : '#ff2244';

    // Fundo
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(bx - 1, by - 1, W + 2, H + 2);
    // Preenchimento
    ctx.fillStyle = hpColor;
    ctx.shadowColor = hpColor;
    ctx.shadowBlur  = 8;
    ctx.fillRect(bx, by, W * ratio, H);
    ctx.shadowBlur = 0;
    // Borda
    ctx.strokeStyle = '#00ff4422';
    ctx.lineWidth   = 1;
    ctx.strokeRect(bx, by, W, H);
    // Texto HP
    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold 8px monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(this.hp)}/${this.maxHp}`, this.x, by + H / 2);
  }

  // Propulsão colorida no modo cards (reutiliza spawnFlameAt com cores customizadas)
  _updateCardsThrust(dt) {
    if (this.dead || this.rebuilding) return;
    if (!this._moving && Math.hypot(this.vx, this.vy) < 20) return;
    const visualAngle = this.angle;
    const engPoints   = this.skin.getEngines(this.x, this.y, visualAngle, 1.76);
    const intensity   = Math.max(0.4, this.mana / this.maxMana);
    for (const ep of engPoints) {
      spawnFlameAt(this._cardFlames, ep.x, ep.y, visualAngle, intensity, this.skin.flameColors);
    }
    this._cardFlames = updateFlames(this._cardFlames, dt);
  }

  _drawCardsThrust(ctx) {
    if (!this._cardFlames.length) return;
    drawFlames(ctx, this._cardFlames);
  }

  _drawRebuild(ctx) {
    const explodeDur = Math.min(3.4, REBUILD_DUR * 0.38);
    const exploding = this._explodeAge < explodeDur;
    const img = this.skin.img;
    if (!img.complete || !img.naturalWidth) return;

    const rebuildColor = this.skin.deathColor || this.skin.color || '#00c8f0';

    const assemblyPct = !exploding
      ? Math.max(0, (this._explodeAge - explodeDur) / Math.max(0.1, REBUILD_DUR - explodeDur))
      : 0;

    for (const s of this.shards) {
      const localAssembly = !exploding
        ? Math.max(0, Math.min(1, (assemblyPct - s.delay) / Math.max(0.08, 1 - s.delay)))
        : 0;
      const alpha = exploding
        ? Math.min(1, this._explodeAge * 0.8)
        : 0.52 + localAssembly * 0.38;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.wx, s.wy);
      ctx.rotate(s.rot);
      ctx.scale(s.scale || 1, s.scale || 1);

      const hw = s.hw + 1, hh = s.hh + 1;
      ctx.beginPath();
      ctx.rect(-hw, -hh, hw*2, hh*2);
      ctx.clip();

      ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, -hw, -hh, hw*2, hh*2);

      // Brilho da paleta da skin na fase de reconstrução
      if (exploding) {
        ctx.strokeStyle = colorWithAlpha(rebuildColor, 0.32);
        ctx.lineWidth = 1;
        ctx.shadowColor = rebuildColor;
        ctx.shadowBlur = 5;
        ctx.strokeRect(-hw, -hh, hw*2, hh*2);
        ctx.shadowBlur = 0;
      } else if (localAssembly > 0.02) {
        ctx.strokeStyle = colorWithAlpha(rebuildColor, localAssembly * 0.78);
        ctx.lineWidth = 1.5;
        ctx.shadowColor = rebuildColor;
        ctx.shadowBlur = 4 + 8 * localAssembly;
        ctx.strokeRect(-hw, -hh, hw*2, hh*2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }

    // Contador simples acima da nave
    ctx.save();
    const secs = Math.ceil(this.rebuildTimer);
    ctx.fillStyle = secs <= 10 ? rebuildColor : '#00d4ff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.fillText(secs + 's', this.x, this.y - this.r - 10);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
