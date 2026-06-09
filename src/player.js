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
    }
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
  ctx.restore();
}

const SPEED       = 220;
const DASH_SPEED  = 650;
const DASH_DUR    = 0.17;
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
function spawnFlameAt(flames, ex, ey, angle, intensity) {
  const back = angle + Math.PI;
  // Núcleo: poucas partículas grandes, alongadas no eixo da popa — dão o
  // efeito de "jato" contínuo em vez de uma bolha de fumaça.
  const coreCount = 1 + Math.ceil(intensity * 1.4);
  for (let i = 0; i < coreCount; i++) {
    const spread = (Math.random()-0.5)*0.22;
    const fa  = back + spread;
    const sp  = 95 + Math.random()*90;
    const life = 0.10 + Math.random()*0.09;
    flames.push({
      kind:'core',
      x:ex+(Math.random()-.5)*2, y:ey+(Math.random()-.5)*2,
      vx:Math.cos(fa)*sp, vy:Math.sin(fa)*sp,
      angle: fa,
      life, maxLife:life, size:5+intensity*9+Math.random()*3, flicker:Math.random(),
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
    const t=f.life/f.maxLife;
    const fk=0.7+0.3*Math.sin(f.flicker*40+Date.now()*0.03);
    ctx.save(); ctx.globalAlpha=Math.min(1,t*1.3)*fk;
    if (f.kind==='spark') {
      // Faísca: traço curto na direção do movimento — reforça sensação de jato.
      const len=f.size*3*t+2;
      ctx.translate(f.x,f.y); ctx.rotate(f.angle);
      const g=ctx.createLinearGradient(0,0,-len,0);
      g.addColorStop(0,'rgba(255,255,210,0.95)'); g.addColorStop(1,'rgba(255,140,20,0)');
      ctx.strokeStyle=g; ctx.lineWidth=f.size*t+0.6; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-len,0); ctx.stroke();
    } else {
      // Núcleo: gota alongada na direção da popa — gradiente quente→frio.
      const len=f.size*(1.8+t), wid=f.size*t*0.85;
      ctx.translate(f.x,f.y); ctx.rotate(f.angle);
      const g=ctx.createLinearGradient(0,0,-len,0);
      g.addColorStop(0,'rgba(255,255,235,1)');
      g.addColorStop(0.28,'rgba(255,200,80,0.95)');
      g.addColorStop(0.6,'rgba(255,110,20,0.8)');
      g.addColorStop(1,'rgba(255,30,0,0)');
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

function createShards(skin, originX, originY) {
  const shards = [];
  const COLS = 5, ROWS = 5;
  const sz = skin._size ?? 72;
  const style = SKIN_SHARD_STYLE[skin.id] ?? 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const lx = (col / COLS - 0.5 + 0.5/COLS) * sz;
      const ly = (row / ROWS - 0.5 + 0.5/ROWS) * sz;
      if (Math.hypot(lx, ly) > sz * 0.58) continue;

      const { vx, vy, vr } = _shardStyle(style, lx, ly, sz);
      shards.push({
        wx: originX + lx * 0.05,
        wy: originY + ly * 0.05,
        vx, vy, rot: 0, vr,
        lx, ly,
        sx: col*(sz/COLS), sy: row*(sz/ROWS),
        sw: sz/COLS, sh: sz/ROWS,
        hw: sz/COLS/2, hh: sz/ROWS/2,
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

  // Chamado pelo combat: player perde vida
  startRebuild(x, y) {
    const ox = x||this.x, oy = y||this.y;
    this.dead=false;
    this.rebuilding=true;
    this.rebuildTimer=REBUILD_DUR;
    this._explodeAge=0;
    this.shards=createShards(this.skin, ox, oy);
    this.vx=0; this.vy=0;
    this.invincible=REBUILD_DUR+1;
    // Nave reposicionada — shards vão voar e voltar para cá
    this.x=ARENA_W/2+(Math.random()-0.5)*160;
    this.y=ARENA_H/2+(Math.random()-0.5)*160;
  }

  // collision=true: batida física — escudo absorve só 50%, resto passa pro HP
  takeDamage(amount, collision=false) {
    if (this.dashing||this.invincible>0||this.dead||this.rebuilding) return false;
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
      const phase2 = this._explodeAge > 5;
      for (const s of this.shards) {
        if (!phase2) {
          // Fase 1: coordenadas mundo absolutas voam para fora
          const drag = Math.min(1, this._explodeAge * 0.3);
          s.wx += s.vx * dt * (1 - drag * 0.85);
          s.wy += s.vy * dt * (1 - drag * 0.85);
          s.rot += s.vr * dt * (1 - drag * 0.7);
        } else {
          // Fase 2: voltar para posição local relativa à nave reposicionada
          const pull = Math.min(0.96, (this._explodeAge - 5) / (REBUILD_DUR - 5));
          const targetWx = this.x + s.lx;
          const targetWy = this.y + s.ly;
          s.wx += (targetWx - s.wx) * pull * 0.07;
          s.wy += (targetWy - s.wy) * pull * 0.07;
          s.rot *= (1 - 0.06 * pull);
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
      if (this.dashTimer<=0) this.dashing=false;
    } else if (input.dash && this.dashCd<=0 && this._moving && this.mana>=MANA_DASH) {
      const ddx=this._targetX-this.x, ddy=this._targetY-this.y;
      const len=Math.hypot(ddx,ddy)||1;
      this.dashDx=ddx/len; this.dashDy=ddy/len;
      this.dashing=true; this.dashTimer=DASH_DUR;
      this.dashCd=DASH_CD*(this.hasDashBoost?0.4:1); this.invincible=DASH_DUR+0.08;
      this.mana=Math.max(0,this.mana-MANA_DASH);
    } else {
      if (this._moving && canMove) {
        const ddx=this._targetX-this.x, ddy=this._targetY-this.y;
        const dist=Math.hypot(ddx,ddy);
        if (dist<5&&!input.holdRight) { this._moving=false; }
        else {
          const spd=SPEED*(this.hasRapid?1.35:1)*(this.hasBoost?1.5:1)*(this.isSlowed?0.45:1);
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

    // Regen extra quando completamente parado
    if (Math.hypot(this.vx,this.vy)<5) {
      this.mana=Math.min(this.maxMana,this.mana+MANA_REGEN*0.5*dt);
    }

    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    if (this.x<=this.r||this.x>=ARENA_W-this.r||this.y<=this.r||this.y>=ARENA_H-this.r) this._moving=false;

    // ── Chamas nos motores ───────────────────────────────────
    if (!this.isAlien && (this._moving || this.skin.spinsOnAxis)) {
      const visualAngle = this.skin.spinsOnAxis ? (this._alienAngle * 2.5) : this.angle;
      const engPoints=this.skin.getEngines(this.x,this.y,visualAngle,1.76);
      const intensity=this.skin.spinsOnAxis ? 0.8 : this.mana/this.maxMana;
      for (const ep of engPoints) spawnFlameAt(this.flames,ep.x,ep.y,visualAngle,intensity);
    }
    this.flames=updateFlames(this.flames,dt);

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
    const cd=this.hasRapid ? SHOOT_CD*0.35 : SHOOT_CD;
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

  _shoot(tx, ty, bullets, combat) {
    const shootAngle = this._aimAngle ?? this.angle;
    const nozzle = this.skin.getNozzle(this.x, this.y, shootAngle, 1.76);
    const baseDmg = (38 + (this.level-1)*5) * (this.hasOverclock ? 2 : 1);
    const sp = 600;

    // Buff de míssil ativo: cada tiro vira um míssil teleguiado (reusa o array
    // missiles[] do CombatSystem — zero duplicação de física/draw/colisão).
    if (this.hasMissileMode && combat) {
      const mx = tx - nozzle.x, my = ty - nozzle.y;
      combat.launchPlayerMissile(nozzle.x, nozzle.y, mx, my, this);
      return;
    }

    const _spawnBullet = (dx, dy, dmg=baseDmg) => {
      const d = Math.hypot(dx, dy)||1;
      bullets.push({
        x: nozzle.x, y: nozzle.y,
        vx:(dx/d)*sp, vy:(dy/d)*sp,
        damage: dmg, owner:'player', life:1.5,
        owner_color: this.hasOverclock ? '#ffdd00' : (this.isVampire ? '#cc0044' : this.skin.color),
        piercing: this.hasPiercing,
        vampire:  this.isVampire,
        _player:  this,
        dirX: dx/d, dirY: dy/d,
      });
    };

    const mx = tx - nozzle.x, my = ty - nozzle.y;

    if (this.hasMultishot) {
      // 3 projéteis: centro, +15°, -15°
      const spread = 0.26;
      _spawnBullet(mx, my);
      const c = Math.cos(spread), s2 = Math.sin(spread);
      _spawnBullet(mx*c - my*s2, mx*s2 + my*c, baseDmg*0.8);
      _spawnBullet(mx*c + my*s2, -mx*s2 + my*c, baseDmg*0.8);
    } else {
      _spawnBullet(mx, my);
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

    // Chamas — discos "UFO" totalmente blindados (noThruster) não emitem
    // nenhum rastro de propulsão, nem o clássico nem o thruster alienígena.
    if (!this.skin.noThruster) {
      if (!this.isAlien) drawFlames(ctx,this.flames);
      else { const e=this.skin.getEngine(this.x,this.y,this.angle,1.76); drawAlienThruster(ctx,e.x,e.y,this._age); }
    }

    // Nave
    ctx.save();
    ctx.translate(this.x,this.y);
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
    ctx.restore();

    // ── Barra de vida grudada na nave ────────────────────────
    this._drawAttachedBars(ctx);

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
      // Preenchimento ciano
      ctx.fillStyle = '#00c8f0cc';
      ctx.shadowColor = '#00c8f0'; ctx.shadowBlur = 7;
      ctx.fillRect(shX, yHp - bh, shW * shRatio, bh);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#00c8f044'; ctx.lineWidth = 0.5;
      ctx.strokeRect(shX, yHp - bh, shW, bh);
    }

    // ── Anel de escudo — cobre TODA a nave ───────────────────
    if (hasShield) {
      const shieldR = this.r + 5;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = '#4488aa22'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, shieldR, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = '#00c8f0cc'; ctx.lineWidth = 4;
      ctx.shadowColor = '#00c8f0'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, shieldR, -Math.PI/2, -Math.PI/2 + Math.PI*2*shRatio);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (shRatio > 0.9) {
        ctx.strokeStyle = '#00c8f044'; ctx.lineWidth = 9;
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

  _drawRebuild(ctx) {
    const progress  = 1 - (this.rebuildTimer / REBUILD_DUR);
    const exploding = this._explodeAge < 5;
    const img = this.skin.img;
    if (!img.complete || !img.naturalWidth) return;

    const sz  = this.skin._size ?? 72;

    const assemblyPct = !exploding
      ? Math.max(0, (progress - 5/REBUILD_DUR) / (1 - 5/REBUILD_DUR))
      : 0;

    for (const s of this.shards) {
      const alpha = exploding
        ? Math.min(1, this._explodeAge * 0.8)
        : 0.9 - assemblyPct * 0.1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.wx, s.wy);
      ctx.rotate(s.rot);

      const hw = s.hw + 1, hh = s.hh + 1;
      ctx.beginPath();
      ctx.rect(-hw, -hh, hw*2, hh*2);
      ctx.clip();

      ctx.drawImage(img, s.sx, s.sy, s.sw, s.sh, -hw, -hh, hw*2, hh*2);

      // Brilho ciano na fase de reconstrução
      if (!exploding && assemblyPct > 0.05) {
        ctx.strokeStyle = `rgba(0,200,240,${assemblyPct * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#00c8f0';
        ctx.shadowBlur = 6 * assemblyPct;
        ctx.strokeRect(-hw, -hh, hw*2, hh*2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    }

    // Contador simples acima da nave
    ctx.save();
    const secs = Math.ceil(this.rebuildTimer);
    ctx.fillStyle = secs <= 10 ? '#ff4466' : '#00d4ff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.fillText(secs + 's', this.x, this.y - this.r - 10);
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}
