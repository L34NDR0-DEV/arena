// IA do inimigo — Contra1: nave inteligente com sistema de VIDAS.
import { ARENA_W, ARENA_H } from './arena.js';
import { tickStatus, isStunned, isFrozen, isConfused, confusedAngle, drawStatusIcons } from './statusEffects.js';

const DIFF = { facil:0.6, moderado:1.0, dificil:1.5, insano:2.2 };
const LIVES_BY_MODE = { contra1: 3, contra2: 4, equipe_online: 9, tower_defense: 9 };
const MAX_LIVES = 9; // valor máximo possível (usado para escalar o HUD)

// ── Sprites exclusivos de inimigo (nunca aparecem como skin de jogador) ──
// Mesmo padrão de cache/desenho de src/skins.js, porém local: estas naves
// são "do jogo" — só a IA inimiga as usa, ninguém pode comprá-las/equipá-las.
const _enemyImgCache = {};
function loadEnemyImg(file) {
  const path = `./src/sprites/${file}`;
  if (_enemyImgCache[path]) return _enemyImgCache[path];
  const img = new Image();
  img.src = path;
  _enemyImgCache[path] = img;
  return img;
}

function drawEnemySprite(ctx, img, size, angle) {
  if (!img.complete || !img.naturalWidth) return false;
  ctx.save();
  ctx.rotate(angle);
  ctx.drawImage(img, -size/2, -size/2, size, size);
  ctx.restore();
  return true;
}

function triggerHitFlash(entity, duration=0.08) {
  entity._hitFlash = Math.max(entity._hitFlash || 0, duration);
  entity._hitFlashMax = Math.max(entity._hitFlashMax || 0, entity._hitFlash);
  entity._hitFlashColor = '#ffffff';
  entity._hitFlashManaged = false;
}

function tickHitFlash(entity, dt) {
  if (entity._hitFlash>0 && !entity._hitFlashManaged) {
    entity._hitFlash = Math.max(0, entity._hitFlash - dt);
    if (entity._hitFlash<=0) entity._hitFlashMax = 0;
  }
}

function drawHitFlash(ctx, entity, radius=null) {
  if (!entity._hitFlash) return;
  const t = entity._hitFlash / (entity._hitFlashMax || 0.08);
  const r = radius ?? entity.r ?? 28;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(0.65, t * 0.65);
  ctx.fillStyle = entity._hitFlashColor || '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 16 * t;
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, r * 1.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const ENEMY_SHIP_IMG    = loadEnemyImg('skininimiga.png');
const ENEMY_DISC_IMG    = loadEnemyImg('skininimigas.png');
const ENEMY_SHIP_VARIANTS = [ENEMY_SHIP_IMG, ENEMY_DISC_IMG];

// ── Combustão na popa — estilo arcade: núcleo alongado + faíscas ──
// `angle` é o ângulo de VOO (bico); a chama sempre sai pela popa (oposto).
function spawnFlame(flames, ex, ey, angle, isAlien=false) {
  if (isAlien) return;
  const back = angle + Math.PI;
  for (let i=0;i<2;i++) {
    const spread=(Math.random()-0.5)*0.22;
    const fa=back+spread;
    const sp=95+Math.random()*90;
    const life=0.10+Math.random()*0.09;
    flames.push({
      kind:'core',
      x:ex+(Math.random()-.5)*2, y:ey+(Math.random()-.5)*2,
      vx:Math.cos(fa)*sp, vy:Math.sin(fa)*sp,
      angle:fa,
      life, maxLife:life, size:5+Math.random()*5, flicker:Math.random(),
    });
  }
  for (let i=0;i<2;i++) {
    const spread=(Math.random()-0.5)*0.9;
    const fa=back+spread;
    const sp=140+Math.random()*160;
    const life=0.12+Math.random()*0.16;
    flames.push({
      kind:'spark',
      x:ex+(Math.random()-.5)*3, y:ey+(Math.random()-.5)*3,
      vx:Math.cos(fa)*sp, vy:Math.sin(fa)*sp,
      angle:fa,
      life, maxLife:life, size:1+Math.random()*2, flicker:Math.random(),
    });
  }
}

function updateFlames(flames, dt) {
  for (const f of flames) {
    f.x+=f.vx*dt; f.y+=f.vy*dt;
    f.vx*=(1-4*dt); f.vy*=(1-4*dt); f.life-=dt;
  }
  return flames.filter(f=>f.life>0);
}

function drawFlames(ctx, flames) {
  for (const f of flames) {
    const t=f.life/f.maxLife;
    const flicker=0.7+0.3*Math.sin(f.flicker*40+Date.now()*0.03);
    ctx.save(); ctx.globalAlpha=Math.min(1,t*1.3)*flicker;
    if (f.kind==='spark') {
      const len=f.size*3*t+2;
      ctx.translate(f.x,f.y); ctx.rotate(f.angle);
      const g=ctx.createLinearGradient(0,0,-len,0);
      g.addColorStop(0,'rgba(255,255,210,0.95)'); g.addColorStop(1,'rgba(255,140,20,0)');
      ctx.strokeStyle=g; ctx.lineWidth=f.size*t+0.6; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-len,0); ctx.stroke();
    } else {
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
    const phase=((age*2.5+i/3)%1);
    const r=5+phase*16, a=(1-phase)*0.7;
    ctx.save(); ctx.strokeStyle=`rgba(255,80,80,${a})`; ctx.lineWidth=2;
    ctx.shadowColor='#ff4422'; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.arc(ex,ey,r,0,Math.PI*2); ctx.stroke(); ctx.restore();
  }
}

// ── Indicador de vidas (corações) ────────────────────────────
function drawLives(ctx, x, y, lives, maxLives, color) {
  const sz=9, gap=13;
  const total=(maxLives-1)*gap+sz;
  const startX=x-total/2;
  for (let i=0;i<maxLives;i++) {
    const px=startX+i*gap;
    const filled=i<lives;
    ctx.save();
    ctx.globalAlpha=filled?1:0.25;
    ctx.fillStyle=filled?color:'#ffffff';
    ctx.shadowColor=filled?color:'transparent';
    ctx.shadowBlur=filled?8:0;
    // Losango / diamante como indicador de vida
    ctx.beginPath();
    ctx.moveTo(px+sz/2,y); ctx.lineTo(px+sz,y+sz/2);
    ctx.lineTo(px+sz/2,y+sz); ctx.lineTo(px,y+sz/2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ── Números de dano flutuantes ────────────────────────────────
const _dmgNums = [];

const DMGNUM_MAX = 18;   // máximo de números simultâneos na tela
const DMGNUM_MIN = 5;    // dano mínimo para exibir (evita spam de dano contínuo)

export function spawnDamageNumber(x, y, value) {
  const v = Math.round(value);
  if (v < DMGNUM_MIN) return;                      // ignora danos minúsculos
  if (_dmgNums.length >= DMGNUM_MAX) return;       // limite de simultâneos
  _dmgNums.push({ x, y: y - 10, value: v, age: 0, maxAge: 1.1, vy: -48 - Math.random()*22, vx: (Math.random()-0.5)*30 });
}

export function updateDamageNumbers(dt) {
  for (const d of _dmgNums) { d.age+=dt; d.x+=d.vx*dt; d.y+=d.vy*dt; d.vy*=(1-3*dt); }
  _dmgNums.splice(0, _dmgNums.length, ..._dmgNums.filter(d=>d.age<d.maxAge));
}

export function drawDamageNumbers(ctx) {
  for (const d of _dmgNums) {
    const t = d.age/d.maxAge;
    const alpha = t < 0.6 ? 1 : 1 - (t-0.6)/0.4;
    const scale = t < 0.15 ? 0.6 + t/0.15*0.6 : 1.2 - t*0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(d.x, d.y);
    ctx.scale(scale, scale);
    ctx.font = `bold ${Math.round(11 + d.value/15)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000cc';
    ctx.lineWidth = 3;
    ctx.strokeText(d.value, 0, 0);
    ctx.fillStyle = d.value >= 80 ? '#ffdd00' : d.value >= 40 ? '#ff8833' : '#ffffff';
    ctx.fillText(d.value, 0, 0);
    ctx.restore();
  }
}

// ── Estilhaços do inimigo ─────────────────────────────────────
// Escala 1.5x em relação ao original (r=22→34)
function createEnemyShards(x, y) {
  const shards = [];
  const pieces = [
    { pts:[{x:0,y:-39},{x:13.5,y:18},{x:0,y:12},{x:-13.5,y:18}], color:'#cc2233' },
    { pts:[{x:0,y:-39},{x:-13.5,y:18},{x:0,y:12}], color:'#cc2233' },
    { pts:[{x:0,y:12},{x:13.5,y:18},{x:21,y:24},{x:0,y:22.5}], color:'#660011' },
    { pts:[{x:0,y:12},{x:-13.5,y:18},{x:-21,y:24},{x:0,y:22.5}], color:'#660011' },
    { pts:[{x:-21,y:15},{x:-42,y:33},{x:-15,y:24}], color:'#440008' },
    { pts:[{x:21,y:15},{x:42,y:33},{x:15,y:24}], color:'#440008' },
    { pts:[{x:-6,y:-21},{x:6,y:-21},{x:9,y:0},{x:-9,y:0}], color:'#ff000044' },
  ];

  for (const piece of pieces) {
    // Centro do fragmento
    const cx = piece.pts.reduce((s,p)=>s+p.x,0)/piece.pts.length;
    const cy = piece.pts.reduce((s,p)=>s+p.y,0)/piece.pts.length;
    const dist = Math.hypot(cx, cy);
    const angle = Math.atan2(cy, cx) + (Math.random()-0.5)*0.6;
    const spd = 60 + dist*1.5 + Math.random()*90;
    shards.push({
      x, y,
      vx: Math.cos(angle)*spd,
      vy: Math.sin(angle)*spd,
      rot: 0,
      vr: (Math.random()-0.5)*7,
      pts: piece.pts,
      color: piece.color,
      age: 0,
      maxAge: 1.4 + Math.random()*0.8,
    });
  }
  return shards;
}

// ── Nave inimiga inteligente ──────────────────────────────────
export class SmartEnemy {
  constructor(x, y, difficulty, wave=1, lives=MAX_LIVES) {
    const m=DIFF[difficulty]||1;
    this.x=x; this.y=y; this.vx=0; this.vy=0; this.angle=0;
    this.r=46;
    this.maxHp=200+70*m; this.hp=this.maxHp; // HP aumentado
    this.lives=lives; this.maxLives=lives;
    this.speed=160+40*m;
    this.damage=22*m;
    this.score=15+5*wave;
    this.color='#ff3355';
    this.dead=false; this._age=0;
    this.isAlien=false; this._alienAngle=0;
    this.spriteImg=ENEMY_SHIP_VARIANTS[Math.floor(Math.random()*ENEMY_SHIP_VARIANTS.length)];
    this.shards=[]; this._dying=false; this._dyingAge=0;

    // Respawn flash após perder vida
    this._respawnTimer=0;
    this._respawnDuration=1.2;
    this._respawnX=x; this._respawnY=y;

    // IA
    this._state='approach'; this._stateTimer=0;
    this._shootTimer=1.2+Math.random()*0.8;
    this._shootCd=1.8-m*0.25;
    this._dodgeTimer=0; this._dodgeDir=1;
    this._predictMult=0.5+m*0.3;

    this.flames=[]; this._audio=null;
  }

  setAudio(a) { this._audio=a; }

  _getNozzle() {
    return { x:this.x+Math.sin(this.angle)*(-48.6), y:this.y-Math.cos(this.angle)*(-48.6) };
  }
  _getEngine() {
    return { x:this.x-Math.sin(this.angle)*(-44.5), y:this.y+Math.cos(this.angle)*(-44.5) };
  }

  // Retorna true se perdeu uma vida (mas não está morto ainda)
  loseLife() {
    this.hp=this.maxHp;
    this.lives--;
    this._respawnTimer=this._respawnDuration;
    // Teleporta para canto oposto ao player (posição aleatória nas bordas)
    const margin=80;
    const side=Math.floor(Math.random()*4);
    if (side===0) { this._respawnX=margin+Math.random()*(ARENA_W-margin*2); this._respawnY=margin; }
    else if (side===1) { this._respawnX=ARENA_W-margin; this._respawnY=margin+Math.random()*(ARENA_H-margin*2); }
    else if (side===2) { this._respawnX=margin+Math.random()*(ARENA_W-margin*2); this._respawnY=ARENA_H-margin; }
    else { this._respawnX=margin; this._respawnY=margin+Math.random()*(ARENA_H-margin*2); }
    if (this.lives<=0) { this.dead=true; return false; }
    return true;
  }

  get isRespawning() { return this._respawnTimer>0; }

  startDeath() {
    this._dying=true;
    this._dyingAge=0;
    this.shards=createEnemyShards(this.x, this.y);
  }

  update(dt, player, bullets) {
    // Atualiza estilhaços de morte
    if (this._dying) {
      this._dyingAge+=dt;
      for (const s of this.shards) {
        s.age+=dt;
        s.x+=s.vx*dt; s.y+=s.vy*dt;
        s.vx*=(1-4*dt); s.vy*=(1-4*dt);
        s.vy+=60*dt; // gravidade leve
        s.rot+=s.vr*dt;
      }
      if (this._dyingAge>2.2) this.dead=true;
      return;
    }
    if (this.dead) return;
    this._age+=dt;
    tickHitFlash(this, dt);
    tickStatus(this, dt);

    // ── Respawn: invencível e teleportando ─────────────────
    if (this._respawnTimer>0) {
      this._respawnTimer-=dt;
      // Interpola para nova posição durante respawn
      const pct=1-(this._respawnTimer/this._respawnDuration);
      this.x=this.x+(this._respawnX-this.x)*Math.min(1,pct*3);
      this.y=this.y+(this._respawnY-this.y)*Math.min(1,pct*3);
      this.vx=0; this.vy=0;
      return;
    }

    // Congelado: completamente imóvel (não move, não atira, não muda estado)
    if (isFrozen(this)) {
      this.vx=0; this.vy=0;
      const eng=this._getEngine();
      spawnFlame(this.flames,eng.x,eng.y,this.angle,this.isAlien);
      this.flames=updateFlames(this.flames,dt);
      return;
    }

    const tx=player.x, ty=player.y;
    const pvx=player.vx, pvy=player.vy;
    const dx=tx-this.x, dy=ty-this.y;
    const dist=Math.hypot(dx,dy)||1;

    // ── Estados de IA ──────────────────────────────────────
    // Limiares lidos de campos de instância com fallback para os valores
    // originais — TeamBot pode sobrescrever (this._approachRange etc.) para
    // ajustar a "personalidade" sem duplicar esta máquina de estados; o
    // SmartEnemy clássico do PvE (sem essas overrides) se comporta IDÊNTICO.
    this._stateTimer-=dt;
    if (this._stateTimer<=0) {
      const hpRatio=this.hp/this.maxHp;
      const approachDist = this._approachRange ?? 500;
      const retreatHpRatio = this._retreatHpRatio ?? 0.35;
      const flankChance = this._flankChance ?? 0.3;
      if (dist>approachDist) { this._state='approach'; this._stateTimer=1.5; }
      else if (dist<120) { this._state='retreat'; this._stateTimer=1.0+Math.random(); }
      else if (hpRatio<retreatHpRatio&&Math.random()<0.4) { this._state='retreat'; this._stateTimer=2.0; }
      else if (Math.random()<flankChance) { this._state='flank'; this._dodgeDir=Math.random()<0.5?1:-1; this._stateTimer=1.2+Math.random(); }
      else { this._state='strafe'; this._dodgeDir=Math.random()<0.5?1:-1; this._stateTimer=0.8+Math.random()*0.6; }
    }

    // ── Esquiva de projéteis ───────────────────────────────
    this._dodgeTimer-=dt;
    if (this._dodgeTimer<=0) {
      this._dodgeTimer=0.4+Math.random()*0.3;
      for (const b of bullets) {
        if (b.owner!=='player') continue;
        const bdist=Math.hypot(this.x-b.x,this.y-b.y);
        if (bdist<140) {
          const bdx=this.x-b.x, bdy=this.y-b.y;
          this._state='dodge'; this._stateTimer=0.35;
          this._dodgeDir=Math.sign(bdx*b.vy-bdy*b.vx)||1;
        }
      }
    }

    // ── Movimento ─────────────────────────────────────────
    let tvx=0,tvy=0;
    const perp={x:-dy/dist,y:dx/dist};
    if (this._state==='approach') { tvx=(dx/dist)*this.speed; tvy=(dy/dist)*this.speed; }
    else if (this._state==='retreat') { tvx=-(dx/dist)*this.speed; tvy=-(dy/dist)*this.speed; }
    else if (this._state==='strafe') { tvx=perp.x*this.speed*this._dodgeDir+(dx/dist)*this.speed*0.2; tvy=perp.y*this.speed*this._dodgeDir+(dy/dist)*this.speed*0.2; }
    else if (this._state==='flank') {
      const fx=tx+perp.x*200*this._dodgeDir, fy=ty+perp.y*200*this._dodgeDir;
      const fd=Math.hypot(fx-this.x,fy-this.y)||1;
      tvx=(fx-this.x)/fd*this.speed; tvy=(fy-this.y)/fd*this.speed;
    }
    else if (this._state==='dodge') { tvx=perp.x*this.speed*1.4*this._dodgeDir; tvy=perp.y*this.speed*1.4*this._dodgeDir; }

    this.vx+=(tvx-this.vx)*Math.min(1,6*dt);
    this.vy+=(tvy-this.vy)*Math.min(1,6*dt);
    const sp=Math.hypot(this.vx,this.vy);
    if (sp>this.speed*1.1) { this.vx=this.vx/sp*this.speed*1.1; this.vy=this.vy/sp*this.speed*1.1; }

    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));

    this.angle=Math.atan2(dy,dx)+Math.PI/2;

    // ── Chama ─────────────────────────────────────────────
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,this.isAlien);
    this.flames=updateFlames(this.flames,dt);

    // ── Tiro preditivo ────────────────────────────────────
    this._shootTimer-=dt;
    if (this._shootTimer<=0&&dist<520&&!isStunned(this)) {
      this._shootTimer=this._shootCd;
      this._firePredictive(tx,ty,pvx,pvy,dist,bullets);
      this._audio?.playEnemyShoot();
    }
  }

  _firePredictive(tx,ty,pvx,pvy,dist,bullets) {
    const bspd=340, tof=dist/bspd;
    const px=tx+pvx*tof*this._predictMult, py=ty+pvy*tof*this._predictMult;
    const nozzle=this._getNozzle();
    let dx=px-nozzle.x, dy=py-nozzle.y;
    const d=Math.hypot(dx,dy)||1;
    let dirX=dx/d, dirY=dy/d;
    if (isConfused(this)) {
      const a=confusedAngle(Math.atan2(dy,dx));
      dirX=Math.cos(a); dirY=Math.sin(a);
    }
    bullets.push({ x:nozzle.x,y:nozzle.y, vx:dirX*bspd,vy:dirY*bspd, damage:this.damage, owner:'enemy', life:1.6, owner_color:'#ff4466', dirX,dirY });
  }

  draw(ctx) {
    // Animação de morte: estilhaços voando
    if (this._dying) {
      for (const s of this.shards) {
        const t = 1 - s.age/s.maxAge;
        ctx.save();
        ctx.globalAlpha = t * t;
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.fillStyle = s.color;
        ctx.shadowColor = '#ff4466'; ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        for (let i=1;i<s.pts.length;i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      return;
    }

    if (this.dead) return;
    const respawning=this.isRespawning;

    if (!respawning) {
      if (!this.isAlien) drawFlames(ctx,this.flames);
      else { const e=this._getEngine(); drawAlienThruster(ctx,e.x,e.y,this._age); }
    }

    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.rotate(this.angle);

    // Flash de respawn
    if (respawning) {
      const blink=Math.sin(this._respawnTimer*20)>0;
      if (!blink) { ctx.restore(); return; }
      ctx.globalAlpha=0.6+0.4*(1-this._respawnTimer/this._respawnDuration);
    }

    // Nave — sprite exclusivo de inimigo (caça alienígena angular roxo/verde),
    // nunca disponível como skin de jogador.
    drawEnemySprite(ctx, this.spriteImg || ENEMY_SHIP_IMG, this.r*2.4, 0);
    ctx.restore();
    drawHitFlash(ctx, this, this.r);

    // HP bar
    const bw=58;
    ctx.fillStyle='#0d1e32bb'; ctx.fillRect(this.x-bw/2,this.y-this.r-14,bw,6);
    ctx.fillStyle='#ff3355'; ctx.fillRect(this.x-bw/2,this.y-this.r-14,bw*Math.max(0,this.hp/this.maxHp),6);

    // Vidas
    drawLives(ctx,this.x,this.y-this.r-24,this.lives,this.maxLives,'#ff4466');

    // Label
    ctx.fillStyle='#ff6677'; ctx.font='10px system-ui'; ctx.textAlign='center';
    ctx.fillText('INIMIGO',this.x,this.y-this.r-36);

    drawStatusIcons(ctx, this.x, this.y-this.r-50, this);
  }
}

// ── Bot de equipe (modo "Equipe Online" — PvP 3x3) ─────────────
// Pilota uma nave-jogador usando a IA já pronta do SmartEnemy (aproximação,
// retirada, flanco, esquiva, mira preditiva), mas mirando dinamicamente no
// jogador vivo mais próximo do time adversário — em vez de um único alvo
// fixo. Para isso alimentamos o SmartEnemy com um "alvo-fantasma" (proxy
// com x/y/vx/vy do alvo escolhido a cada frame), sem alterar sua classe.
const TEAM_COLORS = { red:'#ff4d6a', blue:'#4da6ff' };

// ── Perfis fixos de bot — "identidade" reconhecível entre partidas ──────
// Cada perfil tem nome temático + skin fixa + "traços" de combate (traits)
// que moldam o estilo de luta sobrescrevendo limiares do _brain (SmartEnemy)
// já parametrizados acima (_approachRange/_retreatHpRatio/_flankChance).
//
// Atribuição: o servidor escolhe o perfil pelo ÍNDICE DO SLOT dentro da sala
// (ver botProfileForSlot em server.js — MESMA ORDEM, MESMOS NOMES, MESMOS
// skinIndex; servidor só precisa de name+skinIndex p/ o payload match_start).
// Assim o 1º bot que entra numa partida é sempre "BOT-Falcão", o 2º sempre
// "BOT-Centinela" etc — reconhecível e repetível, sem precisar de hash/BD.
//
// skinIndex evita ids "somente recompensa" (REWARD_ONLY_SKIN_IDS = [4,10,12]
// em skins.js) — estes nunca são sorteados para bots.
export const BOT_PROFILES = [
  { name:'BOT-Falcão',    skinIndex:0,  traits:{ aggression:1.35, flankBias:0.65, retreatThreshold:0.15, approachRange:620 } },
  { name:'BOT-Centinela', skinIndex:3,  traits:{ aggression:0.9,  flankBias:0.15, retreatThreshold:0.28, approachRange:420 } },
  { name:'BOT-Víbora',    skinIndex:6,  traits:{ aggression:1.2,  flankBias:0.7,  retreatThreshold:0.16, approachRange:560 } },
  { name:'BOT-Titânio',   skinIndex:7,  traits:{ aggression:1.0,  flankBias:0.2,  retreatThreshold:0.30, approachRange:460 } },
  { name:'BOT-Rajada',    skinIndex:9,  traits:{ aggression:1.4,  flankBias:0.35, retreatThreshold:0.14, approachRange:560 } },
  { name:'BOT-Espectro',  skinIndex:11, traits:{ aggression:1.1,  flankBias:0.6,  retreatThreshold:0.17, approachRange:540 } },
  { name:'BOT-Lâmina',    skinIndex:13, traits:{ aggression:1.25, flankBias:0.4,  retreatThreshold:0.16, approachRange:520 } },
  { name:'BOT-Cometa',    skinIndex:14, traits:{ aggression:1.15, flankBias:0.5,  retreatThreshold:0.18, approachRange:540 } },
];

export class TeamBot {
  constructor({ id, name, team, x, y, difficulty='moderado', skinIndex=0, traits=null }) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.isBot = true;
    this.kills = 0;
    this.score = 0;
    this.skinIndex = skinIndex;
    this._brain = new SmartEnemy(x, y, difficulty, 1, 1);
    this._brain.color = TEAM_COLORS[team] || '#aaccff';

    // ── Linha de base "implacável" — todo bot de equipe é mais ousado que
    // o SmartEnemy padrão do PvE: atira mais, hesita menos, só foge em
    // desespero. Fixos (não escalam com `difficulty`, que já regula
    // dano/velocidade via DIFF — aqui ajustamos só "personalidade").
    // O perfil (traits, abaixo) ainda pode suavizar estes valores por cima.
    this._brain._shootCd        *= 0.8;   // ~20% mais frequência de tiro
    this._brain._retreatHpRatio  = 0.18;  // foge só com HP < 18% (era 35%)
    this._brain._flankChance     = 0.38;  // mais manobra ofensiva
    this._brain._approachRange   = 560;   // persegue de mais longe

    this._proxy = { x, y, vx:0, vy:0 };
    this._applyTraits(traits);
  }

  // Aplica os "traços" de personalidade do perfil por cima da linha de base
  // implacável — sobrescrita pós-construção dos campos do _brain (já
  // parametrizados com fallback em SmartEnemy.update), sem subclassificar
  // nem duplicar a IA. `traits=null` (ex.: perfil não reconhecido) preserva
  // a linha de base definida no construtor.
  _applyTraits(traits) {
    if (!traits) return;
    const b = this._brain;
    if (traits.aggression != null) {
      b._shootCd = b._shootCd / traits.aggression;        // cooldown menor = atira mais
      b._predictMult = b._predictMult * Math.min(1.2, traits.aggression);
    }
    if (traits.flankBias       != null) b._flankChance    = traits.flankBias;
    if (traits.retreatThreshold!= null) b._retreatHpRatio = traits.retreatThreshold;
    if (traits.approachRange   != null) b._approachRange  = traits.approachRange;
  }

  get x() { return this._brain.x; }
  get y() { return this._brain.y; }
  set x(v) { this._brain.x = v; }
  set y(v) { this._brain.y = v; }
  get angle() { return this._brain.angle; }
  get hp() { return this._brain.hp; }
  get maxHp() { return this._brain.maxHp; }
  get r() { return this._brain.r; }
  get dead() { return this._brain.dead; }
  set dead(v) { this._brain.dead = v; }
  set hp(v) { this._brain.hp = v; }

  respawnAt(x, y) {
    this._respawnDelay = null;
    this._brain.dead = false;
    this._brain._dying = false;
    this._brain._dyingAge = 0;
    this._brain.shards = [];
    this._brain.hp = this._brain.maxHp;
    this._brain.x = x;
    this._brain.y = y;
    this._brain.vx = 0;
    this._brain.vy = 0;
    this._brain._respawnX = x;
    this._brain._respawnY = y;
    this._brain._respawnTimer = this._brain._respawnDuration;
    this._status = null;
  }

  tickRespawn(dt, spawnPosFn) {
    if (!this.dead) {
      this._respawnDelay = null;
      return false;
    }
    if (this._respawnDelay == null) this._respawnDelay = 3.2;
    this._respawnDelay -= dt;
    if (this._respawnDelay > 0) return false;
    const pos = spawnPosFn ? spawnPosFn(this.team) : { x:this.x, y:this.y };
    this.respawnAt(pos.x, pos.y);
    return true;
  }

  // Escolhe o alvo entre os jogadores vivos do time adversário ponderando
  // proximidade + fraqueza (HP baixo) + isolamento (poucos aliados por
  // perto) — um bot "implacável" prioriza a presa mais fácil de abater
  // dentre as que já estão ao alcance, em vez de só a mais próxima.
  // Pesos somam 1.0 (fácil de calibrar): proximidade pesa mais para evitar
  // que o time inteiro atravesse o mapa atrás do HP mais baixo (o que
  // pareceria injusto/estranho de assistir).
  // Custo: até n² pares (n≤6 no 3x3) — irrelevante a 60fps.
  _pickTarget(players) {
    let best=null, bestScore=-Infinity;
    for (const p of players) {
      if (!p || p.dead || p.team===this.team) continue;
      const dist = Math.hypot(p.x-this.x, p.y-this.y);
      const hpRatio = (p.hp ?? p.maxHp ?? 1) / (p.maxHp || 1);

      let nearbyAllies = 0;
      for (const q of players) {
        if (!q || q===p || q.dead || q.team!==p.team) continue;
        if (Math.hypot(q.x-p.x, q.y-p.y) < 260) nearbyAllies++;
      }

      const proximityScore = 1 - Math.min(1, dist/800);
      const weaknessScore  = 1 - hpRatio;
      const isolationScore = 1/(1+nearbyAllies);
      const score = proximityScore*0.4 + weaknessScore*0.35 + isolationScore*0.25;
      if (score > bestScore) { bestScore=score; best=p; }
    }
    return best;
  }

  startDeath() { this._brain.startDeath(); }

  // Define o objetivo do modo (ex.: torre central do Tower Defense) — quando
  // não há inimigo por perto para engajar, o bot avança e atira nela, agindo
  // como um jogador de verdade perseguindo a vitória, não só caçando naves.
  setObjective(tower) { this._objective=tower; }

  update(dt, players, bullets) {
    if (this.dead) return;
    tickHitFlash(this, dt);
    tickStatus(this, dt);
    // Compartilha o objeto de status com o _brain para que as checagens de
    // isStunned/isFrozen/isConfused dentro de SmartEnemy.update (e _firePredictive)
    // leiam o estado do TeamBot — sem duplicar a lógica em cada chamada.
    this._brain._status = this._status;

    if (isFrozen(this)) return;

    const target=this._pickTarget(players);

    // Há um inimigo por perto: engaja normalmente via IA da nave (esquiva,
    // flanco, tiro preditivo etc.)
    if (target && Math.hypot(target.x-this.x,target.y-this.y) < 460) {
      this._proxy.x=target.x; this._proxy.y=target.y;
      this._proxy.vx=target.vx ?? 0; this._proxy.vy=target.vy ?? 0;
      this._brain.update(dt, this._proxy, bullets);
      return;
    }

    // Sem inimigo próximo: avança e atira no objetivo (torre central) —
    // mantém o bot relevante para o resultado da partida mesmo sozinho.
    if (this._objective && !this._objective.dead) {
      const obj=this._objective;
      const dx=obj.x-this.x, dy=obj.y-this.y;
      const dist=Math.hypot(dx,dy)||1;
      this._proxy.x=obj.x; this._proxy.y=obj.y; this._proxy.vx=0; this._proxy.vy=0;
      this._brain.update(dt, this._proxy, bullets);
      // Tiro extra direto na torre quando dentro de alcance — o `_brain` mira
      // em "jogadores", então disparamos manualmente contra o objetivo aqui.
      this._objShootTimer = (this._objShootTimer ?? 0) - dt;
      if (dist < 480 && this._objShootTimer <= 0) {
        this._objShootTimer = 1.0;
        const bspd=340;
        this._brain._audio?.playEnemyShoot?.();
        bullets.push({
          x:this.x, y:this.y,
          vx:(dx/dist)*bspd, vy:(dy/dist)*bspd,
          damage:this._brain.damage, owner:'player', team:this.team, shooter:this, shooterIsBot:true,
          life:1.6, owner_color:TEAM_COLORS[this.team]||'#ffaa66', dirX:dx/dist, dirY:dy/dist, r:5,
        });
      }
      return;
    }

    if (target) {
      this._proxy.x=target.x; this._proxy.y=target.y;
      this._proxy.vx=target.vx ?? 0; this._proxy.vy=target.vy ?? 0;
      this._brain.update(dt, this._proxy, bullets);
    }
  }

  draw(ctx, viewerTeam) {
    if (this.dead) return;
    this._brain.draw(ctx);
    drawHitFlash(ctx, this, this.r);
    const teamColor = TEAM_COLORS[this.team]||'#aaccff';
    const isAlly = viewerTeam ? (this.team === viewerTeam) : false;
    const hpBarColor = isAlly ? '#00e87a' : '#ff2244';
    ctx.save();
    ctx.strokeStyle=teamColor; ctx.globalAlpha=0.55; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r+14,0,Math.PI*2); ctx.stroke();
    ctx.restore();
    // Barra de HP colorida (verde=aliado, vermelho=inimigo)
    const bw=60, bh=6, bx=this.x-bw/2, by=this.y-this.r-20;
    ctx.fillStyle='#08101ecc'; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle=hpBarColor;
    ctx.shadowColor=hpBarColor; ctx.shadowBlur=6;
    ctx.fillRect(bx,by,bw*Math.max(0,this._brain.hp/this._brain.maxHp),bh);
    ctx.shadowBlur=0;
    ctx.strokeStyle='#ffffff22'; ctx.lineWidth=0.5; ctx.strokeRect(bx,by,bw,bh);
    ctx.fillStyle=teamColor; ctx.font='11px system-ui'; ctx.textAlign='center';
    ctx.fillText(`[BOT] ${this.name}`, this.x, this.y-this.r-26);
  }
}

// ── Drone: inimigo rápido e pequeno ──────────────────────────
export class DroneEnemy {
  constructor(x, y, difficulty) {
    const m = DIFF[difficulty]||1;
    this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.r=22; this.angle=0; this._age=0;
    this.maxHp=70+22*m; this.hp=this.maxHp; // HP aumentado
    this.lives=1; this.maxLives=1;
    this.speed=240+60*m;
    this.damage=12*m;
    this.score=8;
    this.color='#ff8800';
    this.dead=false; this._dying=false; this._dyingAge=0;
    this.shards=[];
    this._shootTimer=0.6+Math.random()*0.5;
    this._shootCd=1.2-m*0.15;
    this._wobble=Math.random()*Math.PI*2;
    this.isAlien=false; this._audio=null;
    this._respawnTimer=0; this._respawnDuration=0;
    this._respawnX=x; this._respawnY=y;
  }

  setAudio(a) { this._audio=a; }
  get isRespawning() { return false; }

  loseLife() { this.dead=true; return false; }

  startDeath() {
    this._dying=true; this._dyingAge=0;
    // Fragmentos simples triangulares
    this.shards=[];
    for (let i=0;i<6;i++) {
      const a=Math.random()*Math.PI*2, spd=70+Math.random()*100;
      this.shards.push({x:this.x,y:this.y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,rot:0,vr:(Math.random()-0.5)*8,age:0,maxAge:0.9+Math.random()*0.4,
        pts:[{x:0,y:-12},{x:10,y:9},{x:-10,y:9}],color:'#ff8822'});
    }
  }

  update(dt, player, bullets) {
    if (this._dying) {
      this._dyingAge+=dt;
      for (const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-3*dt);s.vy*=(1-3*dt);s.rot+=s.vr*dt;}
      if (this._dyingAge>1.2) this.dead=true;
      return;
    }
    if (this.dead) return;
    this._age+=dt;
    tickHitFlash(this, dt);
    tickStatus(this, dt);

    if (isFrozen(this)) {
      this.vx=0; this.vy=0;
      return;
    }

    // Movimento sinusoidal rápido em direção ao player
    const dx=player.x-this.x, dy=player.y-this.y;
    const dist=Math.hypot(dx,dy)||1;
    this._wobble+=dt*3.5;
    const perpX=-dy/dist, perpY=dx/dist;
    const wobbleAmt=30*Math.sin(this._wobble);
    const tvx=(dx/dist)*this.speed + perpX*wobbleAmt;
    const tvy=(dy/dist)*this.speed + perpY*wobbleAmt;
    this.vx+=(tvx-this.vx)*Math.min(1,8*dt);
    this.vy+=(tvy-this.vy)*Math.min(1,8*dt);
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this.angle=Math.atan2(dy,dx)+Math.PI/2;

    // Tiro
    this._shootTimer-=dt;
    if (this._shootTimer<=0&&dist<380&&!isStunned(this)) {
      this._shootTimer=this._shootCd;
      const noz={x:this.x+Math.sin(this.angle-Math.PI/2)*(-20),y:this.y-Math.cos(this.angle-Math.PI/2)*(-20)};
      const bspd=400;
      let dirX=dx/dist, dirY=dy/dist;
      if (isConfused(this)) {
        const a=confusedAngle(Math.atan2(dy,dx));
        dirX=Math.cos(a); dirY=Math.sin(a);
      }
      bullets.push({x:noz.x,y:noz.y,vx:dirX*bspd,vy:dirY*bspd,damage:this.damage,owner:'enemy',life:1.2,owner_color:'#ff8800',dirX,dirY});
      this._audio?.playEnemyShoot();
    }
  }

  draw(ctx) {
    if (this._dying) {
      for (const s of this.shards) {
        const t=1-s.age/s.maxAge;
        ctx.save(); ctx.globalAlpha=t*t; ctx.translate(s.x,s.y); ctx.rotate(s.rot);
        ctx.fillStyle=s.color; ctx.beginPath();
        ctx.moveTo(s.pts[0].x,s.pts[0].y); ctx.lineTo(s.pts[1].x,s.pts[1].y); ctx.lineTo(s.pts[2].x,s.pts[2].y);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      return;
    }
    if (this.dead) return;

    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.angle);
    // Corpo hexagonal pequeno
    ctx.fillStyle='#331100';
    ctx.beginPath();
    for (let i=0;i<6;i++){const a=i*Math.PI/3;ctx.lineTo(Math.cos(a)*this.r,Math.sin(a)*this.r);}
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='#ff8800';
    ctx.beginPath();
    for (let i=0;i<6;i++){const a=i*Math.PI/3;ctx.lineTo(Math.cos(a)*(this.r-3),Math.sin(a)*(this.r-3));}
    ctx.closePath(); ctx.fill();
    // Núcleo brilhante
    ctx.fillStyle='#ffcc44'; ctx.shadowColor='#ff8800'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // Bico
    ctx.fillStyle='#ffaa22';
    ctx.beginPath(); ctx.moveTo(0,-this.r); ctx.lineTo(5,-this.r+7); ctx.lineTo(-5,-this.r+7); ctx.closePath(); ctx.fill();
    ctx.restore();
    drawHitFlash(ctx, this, this.r);

    // HP bar
    const bw=34;
    ctx.fillStyle='#0d1e32bb'; ctx.fillRect(this.x-bw/2,this.y-this.r-10,bw,4);
    ctx.fillStyle='#ff8800'; ctx.fillRect(this.x-bw/2,this.y-this.r-10,bw*Math.max(0,this.hp/this.maxHp),4);

    // Label
    ctx.fillStyle='#ffaa44'; ctx.font='8px system-ui'; ctx.textAlign='center';
    ctx.fillText('DRONE',this.x,this.y-this.r-14);

    drawStatusIcons(ctx, this.x, this.y-this.r-28, this);
  }
}

// ── Guardião: defende/ataca as Torres Astrais (modo Teste) ───
// IA híbrida: ataca torres do jogador quando desprotegidas, recua
// para perto das próprias torres quando o jogador se aproxima delas.
export class GuardianEnemy {
  constructor(x, y, difficulty) {
    const m=DIFF[difficulty]||1;
    this.x=x; this.y=y; this.vx=0; this.vy=0; this.angle=0;
    this.r=43;
    this.maxHp=240+70*m; this.hp=this.maxHp; // HP aumentado
    this.lives=1; this.maxLives=1;
    this.speed=170+35*m;
    this.damage=20*m;
    this.score=20+5*m;
    this.color='#ffaa00';
    this.dead=false; this._age=0;
    this.isAlien=false;
    this.shards=[]; this._dying=false; this._dyingAge=0;
    this._respawnTimer=0; this._respawnDuration=0;
    this._respawnX=x; this._respawnY=y;

    this._state='advance'; // 'advance' (vai atacar torre) | 'defend' (volta pra perto da própria torre)
    this._stateTimer=0;
    this._shootTimer=1+Math.random()*0.6;
    this._shootCd=1.4-m*0.18;
    this._targetTower=null;
    this._homeTower=null;

    this.flames=[]; this._audio=null;
  }

  setAudio(a) { this._audio=a; }
  get isRespawning() { return false; }
  loseLife() { this.dead=true; return false; }

  _getNozzle() { return { x:this.x+Math.sin(this.angle)*(-40.5), y:this.y-Math.cos(this.angle)*(-40.5) }; }
  _getEngine() { return { x:this.x-Math.sin(this.angle)*(-37.8), y:this.y+Math.cos(this.angle)*(-37.8) }; }

  startDeath() {
    this._dying=true; this._dyingAge=0;
    this.shards=createEnemyShards(this.x,this.y);
  }

  // towers: array de Tower (de towers.js). Escolhe alvo (torre do jogador mais próxima)
  // e "lar" (própria torre mais próxima) a cada decisão de estado.
  update(dt, player, bullets, towers) {
    if (this._dying) {
      this._dyingAge+=dt;
      for (const s of this.shards) {
        s.age+=dt; s.x+=s.vx*dt; s.y+=s.vy*dt;
        s.vx*=(1-4*dt); s.vy*=(1-4*dt); s.vy+=60*dt; s.rot+=s.vr*dt;
      }
      if (this._dyingAge>2.0) this.dead=true;
      return;
    }
    if (this.dead) return;
    this._age+=dt;
    tickHitFlash(this, dt);
    tickStatus(this, dt);

    if (isFrozen(this)) {
      this.vx=0; this.vy=0;
      const eng=this._getEngine();
      spawnFlame(this.flames,eng.x,eng.y,this.angle,this.isAlien);
      this.flames=updateFlames(this.flames,dt);
      return;
    }

    const ownTowers   = (towers||[]).filter(t=>t.owner==='enemy');
    const enemyTowers = (towers||[]).filter(t=>t.owner==='player'); // alvo: torres do "lado jogador"

    // Torre mais próxima de cada tipo
    let nearestOwn=null, ownD=Infinity;
    for (const t of ownTowers) { const d=Math.hypot(t.x-this.x,t.y-this.y); if (d<ownD){ownD=d;nearestOwn=t;} }
    let nearestTarget=null, targD=Infinity;
    for (const t of enemyTowers) { const d=Math.hypot(t.x-this.x,t.y-this.y); if (d<targD){targD=d;nearestTarget=t;} }
    this._homeTower=nearestOwn;
    this._targetTower=nearestTarget;

    // ── Decide entre avançar (atacar torre do jogador) ou defender (voltar pra própria) ──
    this._stateTimer-=dt;
    if (this._stateTimer<=0) {
      this._stateTimer=1.2+Math.random()*0.8;
      let playerNearOwnTower=false;
      if (nearestOwn) playerNearOwnTower = Math.hypot(player.x-nearestOwn.x,player.y-nearestOwn.y) < 560;
      this._state = playerNearOwnTower ? 'defend' : 'advance';
    }

    // ── Define alvo de movimento conforme o estado ──
    let goal=null;
    if (this._state==='defend' && nearestOwn) goal={x:nearestOwn.x,y:nearestOwn.y};
    else if (this._state==='advance' && nearestTarget) goal={x:nearestTarget.x,y:nearestTarget.y};
    else goal={x:player.x,y:player.y};

    const dx=goal.x-this.x, dy=goal.y-this.y;
    const dist=Math.hypot(dx,dy)||1;
    // Mantém uma distância de combate (não empilha em cima do alvo)
    const standoff = goal===player ? 260 : 240;
    let tvx=0,tvy=0;
    if (dist>standoff) { tvx=(dx/dist)*this.speed; tvy=(dy/dist)*this.speed; }
    else {
      const perp={x:-dy/dist,y:dx/dist};
      const dir=Math.sin(this._age*0.7)>0?1:-1;
      tvx=perp.x*this.speed*0.5*dir; tvy=perp.y*this.speed*0.5*dir;
    }

    this.vx+=(tvx-this.vx)*Math.min(1,6*dt);
    this.vy+=(tvy-this.vy)*Math.min(1,6*dt);
    const sp=Math.hypot(this.vx,this.vy);
    if (sp>this.speed*1.1) { this.vx=this.vx/sp*this.speed*1.1; this.vy=this.vy/sp*this.speed*1.1; }

    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));

    // Aponta para a ameaça mais relevante: jogador se estiver perto, senão objetivo atual
    const distToPlayer=Math.hypot(player.x-this.x,player.y-this.y);
    const aimAt = distToPlayer<420 ? player : goal;
    this.angle=Math.atan2(aimAt.y-this.y,aimAt.x-this.x)+Math.PI/2;

    // Chama
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,this.isAlien);
    this.flames=updateFlames(this.flames,dt);

    // ── Tiro: ataca o jogador se estiver perto, senão a torre-alvo ──
    this._shootTimer-=dt;
    if (this._shootTimer<=0&&!isStunned(this)) {
      this._shootTimer=this._shootCd;
      if (distToPlayer<460) { this._fireAt(player.x,player.y,bullets); this._audio?.playEnemyShoot(); }
      else if (this._state==='advance' && nearestTarget && targD<460) { this._fireAt(nearestTarget.x,nearestTarget.y,bullets); this._audio?.playEnemyShoot(); }
    }
  }

  _fireAt(tx,ty,bullets) {
    const bspd=320;
    const nozzle=this._getNozzle();
    const dx=tx-nozzle.x, dy=ty-nozzle.y;
    const d=Math.hypot(dx,dy)||1;
    let dirX=dx/d, dirY=dy/d;
    if (isConfused(this)) {
      const a=confusedAngle(Math.atan2(dy,dx));
      dirX=Math.cos(a); dirY=Math.sin(a);
    }
    bullets.push({ x:nozzle.x,y:nozzle.y, vx:dirX*bspd,vy:dirY*bspd, damage:this.damage, owner:'enemy', life:1.6, owner_color:'#ffaa00', dirX,dirY });
  }

  draw(ctx) {
    if (this._dying) {
      for (const s of this.shards) {
        const t=1-s.age/s.maxAge;
        ctx.save(); ctx.globalAlpha=t*t; ctx.translate(s.x,s.y); ctx.rotate(s.rot);
        ctx.fillStyle=s.color; ctx.shadowColor='#ffaa00'; ctx.shadowBlur=6;
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x,s.pts[0].y);
        for (let i=1;i<s.pts.length;i++) ctx.lineTo(s.pts[i].x,s.pts[i].y);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      return;
    }
    if (this.dead) return;

    drawFlames(ctx,this.flames);

    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.rotate(this.angle);
    ctx.scale(1.35,1.35);

    // Nave — sprite exclusivo de inimigo (disco cinza/roxo com núcleo
    // brilhante), nunca disponível como skin de jogador.
    drawEnemySprite(ctx, ENEMY_DISC_IMG, this.r*2.4, 0);
    ctx.restore();
    drawHitFlash(ctx, this, this.r);

    // HP bar
    const bw=52;
    ctx.fillStyle='#0d1e32bb'; ctx.fillRect(this.x-bw/2,this.y-this.r-13,bw,5);
    ctx.fillStyle='#ffaa00'; ctx.fillRect(this.x-bw/2,this.y-this.r-13,bw*Math.max(0,this.hp/this.maxHp),5);

    // Label + indicador de estado
    ctx.fillStyle='#ffcc66'; ctx.font='9px system-ui'; ctx.textAlign='center';
    const stLabel = this._state==='defend' ? 'GUARDIÃO ▣ DEFENDENDO' : 'GUARDIÃO ▶ ATACANDO';
    ctx.fillText(stLabel,this.x,this.y-this.r-22);

    drawStatusIcons(ctx, this.x, this.y-this.r-36, this);
  }
}

// ── Disco Alienígena (skininimigas.png) ───────────────────────
export class DiscEnemy {
  constructor(x, y, difficulty) {
    const m=DIFF[difficulty]||1;
    this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.r=50; this.angle=0; this._age=0; this._spinAngle=0;
    this.maxHp=280+90*m; this.hp=this.maxHp;
    this.lives=2; this.maxLives=2;
    this.speed=130+30*m; this.damage=28*m;
    this.score=25; this.color='#aa44ff';
    this.dead=false; this._dying=false; this._dyingAge=0; this.shards=[];
    this._shootTimer=0.8+Math.random()*0.6; this._shootCd=1.0-m*0.12;
    this._orbitAngle=Math.random()*Math.PI*2; this._orbitRadius=160+Math.random()*80;
    this._state='orbit'; this._stateTimer=2+Math.random()*2;
    this._respawnTimer=0; this._respawnDuration=1.2;
    this._respawnX=x; this._respawnY=y;
    this.isAlien=true; this._audio=null;
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return this._respawnTimer>0;}
  loseLife(){
    this.hp=this.maxHp; this.lives--;
    this._respawnTimer=this._respawnDuration;
    const margin=80, side=Math.floor(Math.random()*4);
    if(side===0){this._respawnX=margin+Math.random()*(ARENA_W-margin*2);this._respawnY=margin;}
    else if(side===1){this._respawnX=ARENA_W-margin;this._respawnY=margin+Math.random()*(ARENA_H-margin*2);}
    else if(side===2){this._respawnX=margin+Math.random()*(ARENA_W-margin*2);this._respawnY=ARENA_H-margin;}
    else{this._respawnX=margin;this._respawnY=margin+Math.random()*(ARENA_H-margin*2);}
    if(this.lives<=0){this.dead=true;return false;}
    return true;
  }
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  update(dt, player, bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>2.2)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt; this._spinAngle+=dt*1.2;
    tickHitFlash(this,dt); tickStatus(this,dt);
    if(this._respawnTimer>0){this._respawnTimer-=dt;const p=1-(this._respawnTimer/this._respawnDuration);this.x+=(this._respawnX-this.x)*Math.min(1,p*3);this.y+=(this._respawnY-this.y)*Math.min(1,p*3);this.vx=0;this.vy=0;return;}
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    const px=isStunned(this)?this.x+9999:player.x, py=isStunned(this)?this.y+9999:player.y;
    this._stateTimer-=dt;
    if(this._stateTimer<=0){
      this._state=this._state==='orbit'?'charge':'orbit';
      this._stateTimer=this._state==='orbit'?1.5+Math.random()*1.5:0.8+Math.random()*0.5;
    }
    if(this._state==='orbit'){
      this._orbitAngle+=dt*1.1;
      const tx=px+Math.cos(this._orbitAngle)*this._orbitRadius;
      const ty=py+Math.sin(this._orbitAngle)*this._orbitRadius;
      const ddx=tx-this.x,ddy=ty-this.y,d=Math.hypot(ddx,ddy)||1;
      this.vx+=(ddx/d)*this.speed*6*dt-this.vx*4*dt;
      this.vy+=(ddy/d)*this.speed*6*dt-this.vy*4*dt;
    } else {
      const ddx=px-this.x,ddy=py-this.y,d=Math.hypot(ddx,ddy)||1;
      this.vx+=(ddx/d)*this.speed*8*dt-this.vx*3*dt;
      this.vy+=(ddy/d)*this.speed*8*dt-this.vy*3*dt;
    }
    const spd=Math.hypot(this.vx,this.vy);
    if(spd>this.speed*1.4){this.vx=this.vx/spd*this.speed*1.4;this.vy=this.vy/spd*this.speed*1.4;}
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._shootTimer-=dt;
    if(this._shootTimer<=0){
      this._shootTimer=this._shootCd;
      // Dispara 3 projéteis em leque
      const ba=Math.atan2(py-this.y,px-this.x);
      for(let i=-1;i<=1;i++){
        const a=ba+i*0.35;
        bullets.push({x:this.x,y:this.y,vx:Math.cos(a)*480,vy:Math.sin(a)*480,damage:this.damage,owner:'enemy',life:1.8,owner_color:'#aa44ff',dirX:Math.cos(a),dirY:Math.sin(a)});
      }
      this._audio?.playShoot?.();
    }
  }
  draw(ctx){
    drawHitFlash(ctx,this);
    ctx.save(); ctx.translate(this.x,this.y);
    const drawn=drawEnemySprite(ctx,ENEMY_DISC_IMG,this.r*2,this._spinAngle);
    if(!drawn){
      ctx.fillStyle=this.color; ctx.beginPath(); ctx.ellipse(0,0,this.r,this.r*0.35,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#220044'; ctx.beginPath(); ctx.arc(0,0,this.r*0.28,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
    // Barra de HP
    const bw=60,bh=5,bx=this.x-bw/2,by=this.y-this.r-12;
    ctx.fillStyle='#220044'; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#aa44ff'; ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    drawStatusIcons(ctx,this.x,this.y-this.r-22,this);
  }
}

// ── Berserker: agressivo, fica mais rápido ao perder HP ─────
export class BerserkerEnemy {
  constructor(x, y, difficulty){
    const m=DIFF[difficulty]||1;
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this._age=0;
    this.r=36; this.maxHp=180+55*m; this.hp=this.maxHp;
    this.lives=1; this.maxLives=1; this.speed=200+60*m; this.damage=30*m;
    this.score=18; this.color='#ff2200';
    this.dead=false;this._dying=false;this._dyingAge=0;this.shards=[];
    this._shootTimer=0.7+Math.random()*0.5; this._shootCd=0.9-m*0.1;
    this._respawnTimer=0;this._respawnDuration=0;this._respawnX=x;this._respawnY=y;
    this.isAlien=false;this._audio=null;
    this.flames=[];
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return false;}
  loseLife(){this.dead=true;return false;}
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  _getNozzle(){return{x:this.x+Math.sin(this.angle)*(-40),y:this.y-Math.cos(this.angle)*(-40)};}
  _getEngine(){return{x:this.x-Math.sin(this.angle)*(-36),y:this.y+Math.cos(this.angle)*(-36)};}
  update(dt,player,bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>1.8)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt; tickHitFlash(this,dt); tickStatus(this,dt);
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    // Fica mais rápido quanto menos HP tem (berserk)
    const rage=1+(1-this.hp/this.maxHp)*1.5;
    const px=isStunned(this)?this.x:player.x, py=isStunned(this)?this.y:player.y;
    const ddx=px-this.x,ddy=py-this.y,d=Math.hypot(ddx,ddy)||1;
    this.angle=Math.atan2(ddx,-ddy)+Math.PI;
    this.vx+=(ddx/d)*this.speed*rage*8*dt-this.vx*4*dt;
    this.vy+=(ddy/d)*this.speed*rage*8*dt-this.vy*4*dt;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._shootTimer-=dt;
    if(this._shootTimer<=0){
      this._shootTimer=this._shootCd/rage;
      const nz=this._getNozzle();
      const ba=Math.atan2(py-this.y,px-this.x);
      bullets.push({x:nz.x,y:nz.y,vx:Math.cos(ba)*520,vy:Math.sin(ba)*520,damage:this.damage*rage,owner:'enemy',life:1.4,owner_color:'#ff2200',dirX:Math.cos(ba),dirY:Math.sin(ba)});
    }
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,false);
    this.flames=updateFlames(this.flames,dt);
  }
  draw(ctx){
    drawHitFlash(ctx,this);
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);
    // Desenha como nave triangular vermelha
    ctx.fillStyle=this.color;ctx.strokeStyle='#ff6600';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,-this.r);ctx.lineTo(this.r*0.65,this.r*0.8);ctx.lineTo(-this.r*0.65,this.r*0.8);ctx.closePath();ctx.fill();ctx.stroke();
    // Núcleo brilhante (aumenta com raiva)
    const rage=1+(1-this.hp/this.maxHp);
    ctx.globalAlpha=0.5*rage;ctx.fillStyle='#ffaa00';ctx.shadowColor='#ff4400';ctx.shadowBlur=12*rage;
    ctx.beginPath();ctx.arc(0,0,this.r*0.3,0,Math.PI*2);ctx.fill();
    ctx.restore();
    for(const f of this.flames) drawFlameParticle(ctx,f,'#ff3300');
    const bw=56,bh=5,bx=this.x-bw/2,by=this.y-this.r-12;
    ctx.fillStyle='#440000';ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#ff2200';ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    drawStatusIcons(ctx,this.x,this.y-this.r-22,this);
  }
}

// ── Phantom: fica invisível e reaparece atrás do player ─────
export class PhantomEnemy {
  constructor(x, y, difficulty){
    const m=DIFF[difficulty]||1;
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this._age=0;
    this.r=32; this.maxHp=150+45*m; this.hp=this.maxHp;
    this.lives=1;this.maxLives=1; this.speed=180+50*m; this.damage=25*m;
    this.score=20; this.color='#8800cc';
    this.dead=false;this._dying=false;this._dyingAge=0;this.shards=[];
    this._shootTimer=1+Math.random(); this._shootCd=1.1-m*0.1;
    this._respawnTimer=0;this._respawnDuration=0;this._respawnX=x;this._respawnY=y;
    this.isAlien=false;this._audio=null;
    this._invisTimer=0; this._teleportCd=3+Math.random()*2;
    this.flames=[];
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return false;}
  loseLife(){this.dead=true;return false;}
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  _getNozzle(){return{x:this.x+Math.sin(this.angle)*(-36),y:this.y-Math.cos(this.angle)*(-36)};}
  _getEngine(){return{x:this.x-Math.sin(this.angle)*(-32),y:this.y+Math.cos(this.angle)*(-32)};}
  update(dt,player,bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>2.0)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt; tickHitFlash(this,dt); tickStatus(this,dt);
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    this._teleportCd-=dt;
    if(this._teleportCd<=0){
      // Teleporta para atrás do player
      const ba=Math.atan2(player.vy||0,player.vx||0);
      this.x=player.x+Math.cos(ba+Math.PI)*120;this.y=player.y+Math.sin(ba+Math.PI)*120;
      this._invisTimer=0.6; this._teleportCd=3+Math.random()*2;
    }
    if(this._invisTimer>0)this._invisTimer-=dt;
    const px=isStunned(this)?this.x:player.x, py=isStunned(this)?this.y:player.y;
    const ddx=px-this.x,ddy=py-this.y,d=Math.hypot(ddx,ddy)||1;
    this.angle=Math.atan2(ddx,-ddy)+Math.PI;
    this.vx+=(ddx/d)*this.speed*8*dt-this.vx*4*dt;
    this.vy+=(ddy/d)*this.speed*8*dt-this.vy*4*dt;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._shootTimer-=dt;
    if(this._shootTimer<=0){
      this._shootTimer=this._shootCd;
      const nz=this._getNozzle();
      const ba=Math.atan2(py-this.y,px-this.x);
      bullets.push({x:nz.x,y:nz.y,vx:Math.cos(ba)*500,vy:Math.sin(ba)*500,damage:this.damage,owner:'enemy',life:1.5,owner_color:'#8800cc',dirX:Math.cos(ba),dirY:Math.sin(ba)});
    }
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,false);
    this.flames=updateFlames(this.flames,dt);
  }
  draw(ctx){
    if(this._invisTimer>0.2)return; // invisível após teleporte
    drawHitFlash(ctx,this);
    const alpha=this._invisTimer>0?this._invisTimer/0.2:1;
    ctx.save();ctx.translate(this.x,this.y);ctx.globalAlpha*=alpha;ctx.rotate(this.angle);
    ctx.fillStyle=this.color;ctx.strokeStyle='#cc44ff';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,-this.r*0.9);ctx.lineTo(this.r*0.55,this.r*0.9);ctx.lineTo(-this.r*0.55,this.r*0.9);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#cc88ff44';ctx.beginPath();ctx.arc(0,0,this.r*1.1,0,Math.PI*2);ctx.fill();
    ctx.restore();ctx.globalAlpha=1;
    for(const f of this.flames) drawFlameParticle(ctx,f,'#8800cc');
    if(alpha>=1){const bw=52,bh=5,bx=this.x-bw/2,by=this.y-this.r-12;ctx.fillStyle='#220044';ctx.fillRect(bx,by,bw,bh);ctx.fillStyle='#8800cc';ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);}
    drawStatusIcons(ctx,this.x,this.y-this.r-22,this);
  }
}

// ── Juggernaut: enorme e lento, muito HP, projéteis gigantes ─
export class JuggernautEnemy {
  constructor(x, y, difficulty){
    const m=DIFF[difficulty]||1;
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this._age=0;
    this.r=62; this.maxHp=600+200*m; this.hp=this.maxHp;
    this.lives=3;this.maxLives=3; this.speed=70+20*m; this.damage=40*m;
    this.score=50; this.color='#885500';
    this.dead=false;this._dying=false;this._dyingAge=0;this.shards=[];
    this._shootTimer=1.5+Math.random(); this._shootCd=2.0-m*0.2;
    this._respawnTimer=0;this._respawnDuration=1.5;this._respawnX=x;this._respawnY=y;
    this.isAlien=false;this._audio=null;this.flames=[];
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return this._respawnTimer>0;}
  loseLife(){
    this.hp=this.maxHp;this.lives--;
    this._respawnTimer=this._respawnDuration;
    const margin=80,side=Math.floor(Math.random()*4);
    if(side===0){this._respawnX=margin+Math.random()*(ARENA_W-margin*2);this._respawnY=margin;}
    else if(side===1){this._respawnX=ARENA_W-margin;this._respawnY=margin+Math.random()*(ARENA_H-margin*2);}
    else if(side===2){this._respawnX=margin+Math.random()*(ARENA_W-margin*2);this._respawnY=ARENA_H-margin;}
    else{this._respawnX=margin;this._respawnY=margin+Math.random()*(ARENA_H-margin*2);}
    if(this.lives<=0){this.dead=true;return false;}
    return true;
  }
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  _getNozzle(){return{x:this.x+Math.sin(this.angle)*(-55),y:this.y-Math.cos(this.angle)*(-55)};}
  _getEngine(){return{x:this.x-Math.sin(this.angle)*(-55),y:this.y+Math.cos(this.angle)*(-55)};}
  update(dt,player,bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>3.0)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt;
    if(this._respawnTimer>0){this._respawnTimer-=dt;const p=1-(this._respawnTimer/this._respawnDuration);this.x+=(this._respawnX-this.x)*Math.min(1,p*3);this.y+=(this._respawnY-this.y)*Math.min(1,p*3);this.vx=0;this.vy=0;return;}
    tickHitFlash(this,dt);tickStatus(this,dt);
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    const px=isStunned(this)?this.x:player.x, py=isStunned(this)?this.y:player.y;
    const ddx=px-this.x,ddy=py-this.y,d=Math.hypot(ddx,ddy)||1;
    this.angle=Math.atan2(ddx,-ddy)+Math.PI;
    this.vx+=(ddx/d)*this.speed*5*dt-this.vx*3*dt;
    this.vy+=(ddy/d)*this.speed*5*dt-this.vy*3*dt;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._shootTimer-=dt;
    if(this._shootTimer<=0){
      this._shootTimer=this._shootCd;
      const nz=this._getNozzle();
      const ba=Math.atan2(py-this.y,px-this.x);
      // Dispara projétil gigante + 2 laterais
      for(let i=-1;i<=1;i++){
        const a=ba+i*0.28;
        bullets.push({x:nz.x,y:nz.y,vx:Math.cos(a)*360,vy:Math.sin(a)*360,damage:this.damage*(i===0?1.5:0.8),owner:'enemy',life:2,owner_color:'#cc8800',r:i===0?14:8,dirX:Math.cos(a),dirY:Math.sin(a)});
      }
    }
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,false);
    this.flames=updateFlames(this.flames,dt);
  }
  draw(ctx){
    drawHitFlash(ctx,this);
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);
    ctx.fillStyle=this.color;ctx.strokeStyle='#ffaa00';ctx.lineWidth=3;
    ctx.beginPath();ctx.rect(-this.r*0.7,-this.r,this.r*1.4,this.r*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffcc4433';ctx.beginPath();ctx.arc(0,0,this.r*0.55,0,Math.PI*2);ctx.fill();
    ctx.restore();
    for(const f of this.flames) drawFlameParticle(ctx,f,'#cc8800');
    const bw=80,bh=7,bx=this.x-bw/2,by=this.y-this.r-16;
    ctx.fillStyle='#332200';ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#ff8800';ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    drawStatusIcons(ctx,this.x,this.y-this.r-28,this);
  }
}

// ── SniperEnemy: fica longe e atira balas precisas e rápidas ─
export class SniperEnemy {
  constructor(x, y, difficulty){
    const m=DIFF[difficulty]||1;
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this._age=0;
    this.r=28; this.maxHp=120+38*m; this.hp=this.maxHp;
    this.lives=1;this.maxLives=1; this.speed=110+25*m; this.damage=50*m;
    this.score=22; this.color='#00ccff';
    this.dead=false;this._dying=false;this._dyingAge=0;this.shards=[];
    this._shootTimer=1.8+Math.random(); this._shootCd=2.2-m*0.2;
    this._respawnTimer=0;this._respawnDuration=0;this._respawnX=x;this._respawnY=y;
    this.isAlien=false;this._audio=null;this.flames=[];
    this._preferDist=320+Math.random()*80;
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return false;}
  loseLife(){this.dead=true;return false;}
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  _getNozzle(){return{x:this.x+Math.sin(this.angle)*(-32),y:this.y-Math.cos(this.angle)*(-32)};}
  _getEngine(){return{x:this.x-Math.sin(this.angle)*(-28),y:this.y+Math.cos(this.angle)*(-28)};}
  update(dt,player,bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>1.8)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt; tickHitFlash(this,dt); tickStatus(this,dt);
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    const px=isStunned(this)?this.x:player.x, py=isStunned(this)?this.y:player.y;
    const ddx=px-this.x,ddy=py-this.y,d=Math.hypot(ddx,ddy)||1;
    this.angle=Math.atan2(ddx,-ddy)+Math.PI;
    // Mantém distância preferida
    const diff=d-this._preferDist;
    const moveDir=diff>0?1:-1;
    this.vx+=(ddx/d)*this.speed*moveDir*5*dt-this.vx*3*dt;
    this.vy+=(ddy/d)*this.speed*moveDir*5*dt-this.vy*3*dt;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._shootTimer-=dt;
    if(this._shootTimer<=0){
      this._shootTimer=this._shootCd;
      const nz=this._getNozzle();
      // Prediz posição do player
      const dist=Math.hypot(px-this.x,py-this.y);
      const tof=dist/900;
      const predX=px+(player.vx||0)*tof,predY=py+(player.vy||0)*tof;
      const ba=Math.atan2(predY-this.y,predX-this.x);
      bullets.push({x:nz.x,y:nz.y,vx:Math.cos(ba)*900,vy:Math.sin(ba)*900,damage:this.damage,owner:'enemy',life:1.6,owner_color:'#00ccff',r:4,dirX:Math.cos(ba),dirY:Math.sin(ba)});
    }
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,false);
    this.flames=updateFlames(this.flames,dt);
  }
  draw(ctx){
    drawHitFlash(ctx,this);
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);
    ctx.fillStyle=this.color;ctx.strokeStyle='#88eeff';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,-this.r*1.2);ctx.lineTo(this.r*0.4,this.r*0.6);ctx.lineTo(-this.r*0.4,this.r*0.6);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.restore();
    for(const f of this.flames) drawFlameParticle(ctx,f,'#00ccff');
    const bw=48,bh=5,bx=this.x-bw/2,by=this.y-this.r-14;
    ctx.fillStyle='#002244';ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#00ccff';ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    drawStatusIcons(ctx,this.x,this.y-this.r-22,this);
  }
}

// ── BomberEnemy: planta minas ao se mover ────────────────────
export class BomberEnemy {
  constructor(x, y, difficulty){
    const m=DIFF[difficulty]||1;
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this._age=0;
    this.r=34; this.maxHp=160+50*m; this.hp=this.maxHp;
    this.lives=1;this.maxLives=1; this.speed=140+40*m; this.damage=60*m;
    this.score=24; this.color='#ff6600';
    this.dead=false;this._dying=false;this._dyingAge=0;this.shards=[];
    this._shootTimer=0; this._shootCd=0; // não atira — planta minas
    this._respawnTimer=0;this._respawnDuration=0;this._respawnX=x;this._respawnY=y;
    this.isAlien=false;this._audio=null;this.flames=[];
    this._mineCd=1.5+Math.random(); this._pendingMines=[]; // game.js coleta
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return false;}
  loseLife(){this.dead=true;return false;}
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  _getEngine(){return{x:this.x,y:this.y+this.r*0.8};}
  consumePendingMines(){const m=this._pendingMines.slice();this._pendingMines=[];return m;}
  update(dt,player,bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>1.8)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt; tickHitFlash(this,dt); tickStatus(this,dt);
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    const px=isStunned(this)?this.x:player.x, py=isStunned(this)?this.y:player.y;
    const ddx=px-this.x,ddy=py-this.y,d=Math.hypot(ddx,ddy)||1;
    this.angle=Math.atan2(ddx,-ddy)+Math.PI;
    // Oscila levemente ao redor do player
    const perp=Math.atan2(ddy,ddx)+Math.PI/2;
    const wobble=Math.sin(this._age*1.4)*80;
    const tx=px+Math.cos(perp)*wobble-ddx*0.3, ty=py+Math.sin(perp)*wobble-ddy*0.3;
    const tdx=tx-this.x,tdy=ty-this.y,td=Math.hypot(tdx,tdy)||1;
    this.vx+=(tdx/td)*this.speed*6*dt-this.vx*4*dt;
    this.vy+=(tdy/td)*this.speed*6*dt-this.vy*4*dt;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._mineCd-=dt;
    if(this._mineCd<=0){
      this._mineCd=1.5+Math.random();
      this._pendingMines.push({x:this.x+(Math.random()-0.5)*30,y:this.y+(Math.random()-0.5)*30});
    }
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,false);
    this.flames=updateFlames(this.flames,dt);
  }
  draw(ctx){
    drawHitFlash(ctx,this);
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);
    ctx.fillStyle=this.color;ctx.strokeStyle='#ffaa22';ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,this.r,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#222';ctx.font='bold 14px system-ui';ctx.textAlign='center';
    ctx.fillText('!',0,5);
    ctx.restore();
    for(const f of this.flames) drawFlameParticle(ctx,f,'#ff6600');
    const bw=52,bh=5,bx=this.x-bw/2,by=this.y-this.r-14;
    ctx.fillStyle='#331100';ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#ff6600';ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    drawStatusIcons(ctx,this.x,this.y-this.r-22,this);
  }
}

// ── Reaper: drena HP ao acertar, regenera vida própria ──────
export class ReaperEnemy {
  constructor(x, y, difficulty){
    const m=DIFF[difficulty]||1;
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this._age=0;
    this.r=40; this.maxHp=260+80*m; this.hp=this.maxHp;
    this.lives=1;this.maxLives=1; this.speed=150+40*m; this.damage=18*m;
    this.score=28; this.color='#440088';
    this.dead=false;this._dying=false;this._dyingAge=0;this.shards=[];
    this._shootTimer=1+Math.random()*0.5; this._shootCd=1.2-m*0.1;
    this._respawnTimer=0;this._respawnDuration=0;this._respawnX=x;this._respawnY=y;
    this.isAlien=false;this._audio=null;this.flames=[];
    this._regenTick=0;
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return false;}
  loseLife(){this.dead=true;return false;}
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  _getNozzle(){return{x:this.x+Math.sin(this.angle)*(-42),y:this.y-Math.cos(this.angle)*(-42)};}
  _getEngine(){return{x:this.x-Math.sin(this.angle)*(-38),y:this.y+Math.cos(this.angle)*(-38)};}
  update(dt,player,bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>2.2)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt; tickHitFlash(this,dt); tickStatus(this,dt);
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    // Regen passiva
    this._regenTick+=dt;
    if(this._regenTick>=1){this._regenTick=0;this.hp=Math.min(this.maxHp,this.hp+8);}
    const px=isStunned(this)?this.x:player.x, py=isStunned(this)?this.y:player.y;
    const ddx=px-this.x,ddy=py-this.y,d=Math.hypot(ddx,ddy)||1;
    this.angle=Math.atan2(ddx,-ddy)+Math.PI;
    this.vx+=(ddx/d)*this.speed*7*dt-this.vx*4*dt;
    this.vy+=(ddy/d)*this.speed*7*dt-this.vy*4*dt;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._shootTimer-=dt;
    if(this._shootTimer<=0){
      this._shootTimer=this._shootCd;
      const nz=this._getNozzle();
      const ba=Math.atan2(py-this.y,px-this.x);
      // Tiro drena vida: propriedade lifeSteal para combat.js
      bullets.push({x:nz.x,y:nz.y,vx:Math.cos(ba)*480,vy:Math.sin(ba)*480,damage:this.damage,owner:'enemy',life:1.5,owner_color:'#8800ff',lifeSteal:this,dirX:Math.cos(ba),dirY:Math.sin(ba)});
    }
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,false);
    this.flames=updateFlames(this.flames,dt);
  }
  draw(ctx){
    drawHitFlash(ctx,this);
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);
    ctx.fillStyle=this.color;ctx.strokeStyle='#aa44ff';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,-this.r);ctx.lineTo(this.r*0.5,0);ctx.lineTo(this.r*0.5,this.r*0.8);ctx.lineTo(-this.r*0.5,this.r*0.8);ctx.lineTo(-this.r*0.5,0);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#aa44ff44';ctx.beginPath();ctx.arc(0,-this.r*0.3,this.r*0.3,0,Math.PI*2);ctx.fill();
    ctx.restore();
    for(const f of this.flames) drawFlameParticle(ctx,f,'#440088');
    const bw=60,bh=5,bx=this.x-bw/2,by=this.y-this.r-14;
    ctx.fillStyle='#110022';ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#8800ff';ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    drawStatusIcons(ctx,this.x,this.y-this.r-22,this);
  }
}

// ── SpeedDemon: extremamente rápido, zigzague, difícil de acertar ─
export class SpeedDemonEnemy {
  constructor(x, y, difficulty){
    const m=DIFF[difficulty]||1;
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this._age=0;
    this.r=20; this.maxHp=90+28*m; this.hp=this.maxHp;
    this.lives=1;this.maxLives=1; this.speed=380+100*m; this.damage=14*m;
    this.score=14; this.color='#00ff88';
    this.dead=false;this._dying=false;this._dyingAge=0;this.shards=[];
    this._shootTimer=0.5+Math.random()*0.3; this._shootCd=0.7-m*0.08;
    this._respawnTimer=0;this._respawnDuration=0;this._respawnX=x;this._respawnY=y;
    this.isAlien=false;this._audio=null;this.flames=[];
    this._zigzagAngle=Math.random()*Math.PI*2; this._zigzagTimer=0.18+Math.random()*0.12;
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return false;}
  loseLife(){this.dead=true;return false;}
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  _getNozzle(){return{x:this.x+Math.sin(this.angle)*(-22),y:this.y-Math.cos(this.angle)*(-22)};}
  _getEngine(){return{x:this.x-Math.sin(this.angle)*(-20),y:this.y+Math.cos(this.angle)*(-20)};}
  update(dt,player,bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>1.4)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt; tickHitFlash(this,dt); tickStatus(this,dt);
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    this._zigzagTimer-=dt;
    if(this._zigzagTimer<=0){this._zigzagTimer=0.18+Math.random()*0.12;this._zigzagAngle=(Math.random()-0.5)*Math.PI;}
    const px=isStunned(this)?this.x:player.x, py=isStunned(this)?this.y:player.y;
    const baseA=Math.atan2(py-this.y,px-this.x);
    const moveA=baseA+this._zigzagAngle;
    this.angle=Math.atan2(Math.sin(moveA),-Math.cos(moveA));
    this.vx+=(Math.cos(moveA)*this.speed*10*dt-this.vx)*0.5;
    this.vy+=(Math.sin(moveA)*this.speed*10*dt-this.vy)*0.5;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._shootTimer-=dt;
    if(this._shootTimer<=0){
      this._shootTimer=this._shootCd;
      const nz=this._getNozzle();
      const ba=Math.atan2(py-this.y,px-this.x);
      bullets.push({x:nz.x,y:nz.y,vx:Math.cos(ba)*580,vy:Math.sin(ba)*580,damage:this.damage,owner:'enemy',life:1.2,owner_color:'#00ff88',dirX:Math.cos(ba),dirY:Math.sin(ba)});
    }
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,false);
    this.flames=updateFlames(this.flames,dt);
  }
  draw(ctx){
    drawHitFlash(ctx,this);
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);
    ctx.fillStyle=this.color;ctx.strokeStyle='#88ffcc';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(0,-this.r*1.1);ctx.lineTo(this.r*0.5,this.r);ctx.lineTo(0,this.r*0.4);ctx.lineTo(-this.r*0.5,this.r);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.restore();
    for(const f of this.flames) drawFlameParticle(ctx,f,'#00ff88');
    const bw=42,bh=4,bx=this.x-bw/2,by=this.y-this.r-12;
    ctx.fillStyle='#002211';ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#00ff88';ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    drawStatusIcons(ctx,this.x,this.y-this.r-20,this);
  }
}

// ── TankEnemy: escudo regenerável, muito resistente ──────────
export class TankEnemy {
  constructor(x, y, difficulty){
    const m=DIFF[difficulty]||1;
    this.x=x;this.y=y;this.vx=0;this.vy=0;this.angle=0;this._age=0;
    this.r=48; this.maxHp=400+130*m; this.hp=this.maxHp;
    this.maxShield=120+40*m; this.shield=this.maxShield;
    this.lives=2;this.maxLives=2; this.speed=100+25*m; this.damage=25*m;
    this.score=35; this.color='#336699';
    this.dead=false;this._dying=false;this._dyingAge=0;this.shards=[];
    this._shootTimer=1.2+Math.random(); this._shootCd=1.5-m*0.15;
    this._respawnTimer=0;this._respawnDuration=1.2;this._respawnX=x;this._respawnY=y;
    this.isAlien=false;this._audio=null;this.flames=[];
    this._shieldRegenTick=0;
  }
  setAudio(a){this._audio=a;}
  get isRespawning(){return this._respawnTimer>0;}
  loseLife(){
    this.hp=this.maxHp;this.shield=this.maxShield;this.lives--;
    this._respawnTimer=this._respawnDuration;
    const margin=80,side=Math.floor(Math.random()*4);
    if(side===0){this._respawnX=margin+Math.random()*(ARENA_W-margin*2);this._respawnY=margin;}
    else if(side===1){this._respawnX=ARENA_W-margin;this._respawnY=margin+Math.random()*(ARENA_H-margin*2);}
    else if(side===2){this._respawnX=margin+Math.random()*(ARENA_W-margin*2);this._respawnY=ARENA_H-margin;}
    else{this._respawnX=margin;this._respawnY=margin+Math.random()*(ARENA_H-margin*2);}
    if(this.lives<=0){this.dead=true;return false;}
    return true;
  }
  startDeath(){this._dying=true;this._dyingAge=0;this.shards=createEnemyShards(this.x,this.y);}
  _getNozzle(){return{x:this.x+Math.sin(this.angle)*(-50),y:this.y-Math.cos(this.angle)*(-50)};}
  _getEngine(){return{x:this.x-Math.sin(this.angle)*(-46),y:this.y+Math.cos(this.angle)*(-46)};}
  takeDamage(amount){
    if(this.shield>0){const abs=Math.min(this.shield,amount);this.shield-=abs;amount-=abs;}
    this.hp-=amount;this._shieldRegenTick=0;
  }
  update(dt,player,bullets){
    if(this._dying){this._dyingAge+=dt;for(const s of this.shards){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vx*=(1-4*dt);s.vy*=(1-4*dt);s.rot+=s.vr*dt;}if(this._dyingAge>2.5)this.dead=true;return;}
    if(this.dead)return;
    this._age+=dt;
    if(this._respawnTimer>0){this._respawnTimer-=dt;const p=1-(this._respawnTimer/this._respawnDuration);this.x+=(this._respawnX-this.x)*Math.min(1,p*3);this.y+=(this._respawnY-this.y)*Math.min(1,p*3);this.vx=0;this.vy=0;return;}
    tickHitFlash(this,dt);tickStatus(this,dt);
    if(isFrozen(this)){this.vx=0;this.vy=0;return;}
    this._shieldRegenTick+=dt;
    if(this._shieldRegenTick>=2)this.shield=Math.min(this.maxShield,this.shield+15*dt);
    const px=isStunned(this)?this.x:player.x, py=isStunned(this)?this.y:player.y;
    const ddx=px-this.x,ddy=py-this.y,d=Math.hypot(ddx,ddy)||1;
    this.angle=Math.atan2(ddx,-ddy)+Math.PI;
    this.vx+=(ddx/d)*this.speed*5*dt-this.vx*3*dt;
    this.vy+=(ddy/d)*this.speed*5*dt-this.vy*3*dt;
    this.x+=this.vx*dt;this.y+=this.vy*dt;
    this.x=Math.max(this.r,Math.min(ARENA_W-this.r,this.x));
    this.y=Math.max(this.r,Math.min(ARENA_H-this.r,this.y));
    this._shootTimer-=dt;
    if(this._shootTimer<=0){
      this._shootTimer=this._shootCd;
      const nz=this._getNozzle();
      const ba=Math.atan2(py-this.y,px-this.x);
      bullets.push({x:nz.x,y:nz.y,vx:Math.cos(ba)*400,vy:Math.sin(ba)*400,damage:this.damage,owner:'enemy',life:1.8,owner_color:'#5588bb',r:7,dirX:Math.cos(ba),dirY:Math.sin(ba)});
    }
    const eng=this._getEngine();
    spawnFlame(this.flames,eng.x,eng.y,this.angle,false);
    this.flames=updateFlames(this.flames,dt);
  }
  draw(ctx){
    drawHitFlash(ctx,this);
    if(this.shield>0){
      ctx.save();ctx.translate(this.x,this.y);
      ctx.strokeStyle='#44aaff';ctx.lineWidth=3;ctx.globalAlpha=0.5*(this.shield/this.maxShield);
      ctx.shadowColor='#44aaff';ctx.shadowBlur=12;
      ctx.beginPath();ctx.arc(0,0,this.r+10,0,Math.PI*2);ctx.stroke();
      ctx.restore();ctx.globalAlpha=1;
    }
    ctx.save();ctx.translate(this.x,this.y);ctx.rotate(this.angle);
    ctx.fillStyle=this.color;ctx.strokeStyle='#8844aa';ctx.lineWidth=3;
    ctx.beginPath();ctx.rect(-this.r*0.75,-this.r,this.r*1.5,this.r*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#aaccff22';ctx.beginPath();ctx.arc(0,0,this.r*0.4,0,Math.PI*2);ctx.fill();
    ctx.restore();
    for(const f of this.flames) drawFlameParticle(ctx,f,'#336699');
    const bw=72,bh=7,bx=this.x-bw/2,by=this.y-this.r-18;
    ctx.fillStyle='#111122';ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle='#336699';ctx.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    if(this.shield>0){ctx.fillStyle='#44aaff';ctx.fillRect(bx,by+bh+2,bw*(this.shield/this.maxShield),4);}
    drawStatusIcons(ctx,this.x,this.y-this.r-30,this);
  }
}

// Auxiliar visual compartilhado pelos novos inimigos
function drawFlameParticle(ctx, f, fallbackColor) {
  const t=f.life/f.maxLife;
  ctx.save();ctx.globalAlpha=Math.min(1,t*1.2);
  ctx.fillStyle=fallbackColor||'#ff4400';ctx.shadowColor=fallbackColor||'#ff4400';ctx.shadowBlur=8*t;
  ctx.beginPath();ctx.arc(f.x,f.y,Math.max(0.5,f.size*t),0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// ── Gerenciador de inimigos ───────────────────────────────────
export class EnemyManager {
  constructor(mode='contra1', difficulty='moderado') {
    this.mode=mode; this.difficulty=difficulty;
    this.enemies=[]; this.wave=1;
    this.waveActive=false; this.waveTimer=4;
    this.toSpawn=[]; this.spawnTimer=0;
    this.enemyScore=0;
    this._audio=null;
    this._prepareWave();

    // Sistema de vidas por modo
    const lives = LIVES_BY_MODE[mode] ?? 0;
    this._maxLives    = lives;
    this._enemyLives  = lives;
    this._playerLives = lives;
    this._livesResult = null; // 'player_win' | 'enemy_win'
  }

  setAudio(a) { this._audio=a; }

  // Para o modo Contra1: informa quantas vidas o player tem
  setPlayerLives(n) { this._playerLives=n; }

  get enemyLives() { return this._enemyLives; }
  get playerLives() { return this._playerLives; }
  get maxLives() { return this._maxLives; }
  get livesResult() { return this._livesResult; }

  get maxSimultaneous() {
    return this.mode==='contra1'?1: this.mode==='contra2'?2:4;
  }

  _prepareWave() {
    const isContra1=this.mode==='contra1';
    if (this.mode==='equipe_online' || this.mode==='tower_defense') {
      // PvP entre jogadores — sem ondas de IA inimiga clássica.
      this.toSpawn=[];
      this.waveActive=false; this.waveTimer=Infinity;
      return;
    }
    if (this.mode==='teste') {
      this.toSpawn=['guardian'];
    } else if (isContra1) {
      if (this.wave >= 6 && Math.random() < 0.2) this.toSpawn=['juggernaut'];
      else if (this.wave >= 5 && Math.random() < 0.2) this.toSpawn=['tank'];
      else if (this.wave >= 4 && Math.random() < 0.3) this.toSpawn=['guardian'];
      else if (this.wave >= 3 && Math.random() < 0.25) this.toSpawn=['berserker'];
      else if (this.wave >= 2 && Math.random() < 0.4) this.toSpawn=['drone'];
      else this.toSpawn=['smart'];
    } else {
      const count=Math.min(2+this.wave,7);
      this.toSpawn=[];
      for (let i=0;i<count;i++) {
        const r=Math.random();
        if (this.wave>=8 && r<0.12) this.toSpawn.push('juggernaut');
        else if (this.wave>=6 && r<0.15) this.toSpawn.push('tank');
        else if (this.wave>=5 && r<0.12) this.toSpawn.push('reaper');
        else if (this.wave>=4 && r<0.14) this.toSpawn.push('sniper_e');
        else if (this.wave>=4 && r<0.12) this.toSpawn.push('bomber');
        else if (this.wave>=3 && r<0.12) this.toSpawn.push('disc');
        else if (this.wave>=3 && r<0.14) this.toSpawn.push('phantom');
        else if (this.wave>=2 && r<0.18) this.toSpawn.push('berserker');
        else if (this.wave>=2 && r<0.22) this.toSpawn.push('speed_demon');
        else if (this.wave>=2 && r<0.40) this.toSpawn.push('drone');
        else this.toSpawn.push('smart');
      }
    }
    this.waveActive=false; this.waveTimer=isContra1?2:4;
  }

  _edge() {
    const side=Math.floor(Math.random()*4);
    if (side===0) return {x:Math.random()*ARENA_W,y:-40};
    if (side===1) return {x:ARENA_W+40,y:Math.random()*ARENA_H};
    if (side===2) return {x:Math.random()*ARENA_W,y:ARENA_H+40};
    return {x:-40,y:Math.random()*ARENA_H};
  }

  // Notifica que o player perdeu uma vida (chamado de combat.js)
  playerLostLife() {
    if (!this._maxLives) return; // modos sem limite de vidas
    this._playerLives--;
    if (this._playerLives<=0) this._livesResult='enemy_win';
  }

  // Posição de spawn perto das torres do "lado inimigo" (modo Teste)
  _guardianSpawnPos(towers) {
    const enemyTowers=(towers||[]).filter(t=>t.side==='enemy');
    if (enemyTowers.length) {
      const t=enemyTowers[Math.floor(Math.random()*enemyTowers.length)];
      const a=Math.random()*Math.PI*2;
      return { x:t.x+Math.cos(a)*180, y:t.y+Math.sin(a)*180 };
    }
    return this._edge();
  }

  update(dt, player, bullets, arena, itemMgr, towers=null) {
    if (!this.waveActive) {
      this.waveTimer-=dt;
      if (this.waveTimer<=0) { this.waveActive=true; this._audio?.playWaveStart(); }
      return null;
    }

    // Spawn
    this.spawnTimer-=dt;
    const alive=this.enemies.filter(e=>!e.dead&&!e.isRespawning).length;
    if (this.spawnTimer<=0&&this.toSpawn.length>0&&alive<this.maxSimultaneous) {
      this.spawnTimer=0.5;
      const type=this.toSpawn.pop();
      let e;
      if (type==='guardian') {
        const {x,y}=this._guardianSpawnPos(towers);
        e=new GuardianEnemy(x,y,this.difficulty);
      } else if (type==='drone') {
        const {x,y}=this._edge();
        e=new DroneEnemy(x,y,this.difficulty);
      } else if (type==='disc') {
        const {x,y}=this._edge();
        e=new DiscEnemy(x,y,this.difficulty);
      } else if (type==='berserker') {
        const {x,y}=this._edge();
        e=new BerserkerEnemy(x,y,this.difficulty);
      } else if (type==='phantom') {
        const {x,y}=this._edge();
        e=new PhantomEnemy(x,y,this.difficulty);
      } else if (type==='juggernaut') {
        const {x,y}=this._edge();
        e=new JuggernautEnemy(x,y,this.difficulty);
      } else if (type==='sniper_e') {
        const {x,y}=this._edge();
        e=new SniperEnemy(x,y,this.difficulty);
      } else if (type==='bomber') {
        const {x,y}=this._edge();
        e=new BomberEnemy(x,y,this.difficulty);
      } else if (type==='reaper') {
        const {x,y}=this._edge();
        e=new ReaperEnemy(x,y,this.difficulty);
      } else if (type==='speed_demon') {
        const {x,y}=this._edge();
        e=new SpeedDemonEnemy(x,y,this.difficulty);
      } else if (type==='tank') {
        const {x,y}=this._edge();
        e=new TankEnemy(x,y,this.difficulty);
      } else {
        const {x,y}=this._edge();
        const lives=this.mode==='contra1'?this._enemyLives:1;
        e=new SmartEnemy(x,y,this.difficulty,this.wave,lives);
      }
      e.setAudio(this._audio);
      this.enemies.push(e);
    }

    updateDamageNumbers(dt);

    // Player invisível: passa posição falsa para inimigos (eles perdem o alvo)
    const visiblePlayer = player.isInvisible
      ? { ...player, x: player.x + 9999, y: player.y + 9999 }
      : player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e instanceof GuardianEnemy) e.update(dt, visiblePlayer, bullets, towers);
      else e.update(dt, visiblePlayer, bullets);
    }

    // Verifica morte de inimigos
    const next=[];
    for (const e of this.enemies) {
      if (e.dead && !e._dying) {
        // Aciona animação de morte se ainda não iniciou
        e.startDeath();
        if (this.mode==='contra1') {
          // Só declara vitória se realmente ficou sem vidas (morte definitiva)
          if (this._enemyLives <= 0) {
            this._livesResult='player_win';
          }
          arena.spawnParticles(e.x,e.y,e.color,22,200);
          itemMgr.spawnAt(e.x,e.y,3,arena);
          this.enemyScore+=e.score;
          this._audio?.playExplosion(2);
        } else {
          arena.spawnParticles(e.x,e.y,e.color,16,180);
          itemMgr.spawnAt(e.x,e.y,2,arena);
          this.enemyScore+=e.score;
          this._audio?.playExplosion(1.5);
        }
        next.push(e); // mantém no array durante animação
      } else if (e._dying) {
        if (!e.dead) next.push(e); // ainda animando
        // se dead=true após animação, descarta
      } else {
        next.push(e);
      }
    }
    this.enemies=next;

    // Verifica fim da onda (não-Contra1)
    if (this.mode!=='contra1'&&this.waveActive&&this.toSpawn.length===0&&this.enemies.length===0) {
      this.wave++;
      this._prepareWave();
      return this.wave-1;
    }

    return null;
  }

  // Chamado quando inimigo chega a 0 hp no modo contra1 (mas não morreu — perde vida)
  enemyLostLife(enemy, arena, itemMgr) {
    if (this.mode!=='contra1' || !this._maxLives) return;
    this._enemyLives--;
    enemy.lives=this._enemyLives;
    if (this._enemyLives<=0) {
      enemy.dead=true;
      // animação de morte completa é acionada no loop principal
    } else {
      enemy.loseLife();
      this._audio?.playExplosion(1);
      arena.spawnParticles(enemy.x,enemy.y,enemy.color||'#ff4466',12,160);
    }
  }

  draw(ctx) {
    for (const e of this.enemies) e.draw(ctx);
    drawDamageNumbers(ctx);
  }

  get currentWave()   { return this.wave; }
  get isWaveActive()  { return this.waveActive; }
  get waveCountdown() { return Math.ceil(this.waveTimer); }
}

// ── SwarmerEnemy: inimigo pequeno de enxame (modo Cards) ─────
export class SwarmerEnemy {
  constructor(x, y, difficulty, cardMode=false) {
    const m = DIFF[difficulty]||1;
    this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.r=16; this.angle=0; this._age=0;
    this.maxHp=28+8*m; this.hp=this.maxHp;
    this.lives=1; this.maxLives=1;
    this.speed=340+60*m;
    this.damage=8*m;
    this.score=5;
    this.color=cardMode ? '#66ff44' : '#ff8822';
    this.dead=false; this._dying=false; this._dyingAge=0;
    this.shards=[];
    this._wobble=Math.random()*Math.PI*2;
    this._flockOffset={ x:(Math.random()-0.5)*80, y:(Math.random()-0.5)*80 };
    this.isAlien=true;
    this._audio=null;
    this._respawnTimer=0; this._respawnDuration=0;
    this._respawnX=x; this._respawnY=y;
    // SwarmerEnemy não atira — só dano por colisão
  }

  setAudio(a) { this._audio=a; }
  get isRespawning() { return this._respawnTimer > 0; }

  update(dt, player, bullets) {
    if (this.dead) return;
    this._age+=dt;
    // Movimento em direção ao player com wobble de enxame
    tickHitFlash(this, dt);
    const dx=player.x+this._flockOffset.x-this.x;
    const dy=player.y+this._flockOffset.y-this.y;
    const dist=Math.hypot(dx,dy)||1;
    this.vx=dx/dist*this.speed;
    this.vy=dy/dist*this.speed;
    this.x+=this.vx*dt;
    this.y+=this.vy*dt;
    this.angle=Math.atan2(dy,dx);
    // Colisão com player — dano corpo a corpo
    const pd=Math.hypot(this.x-player.x, this.y-player.y);
    if (pd < this.r+player.r && !player.invincible && !this._hitCooldown) {
      player.takeDamage(this.damage);
      this._hitCooldown=0.6;
      this._audio?.playHit?.();
    }
    if (this._hitCooldown>0) this._hitCooldown-=dt;
    // Colisão com balas
    for (const b of bullets) {
      if (b.team==='enemy' || b.dead) continue;
      if (Math.hypot(this.x-b.x, this.y-b.y) < this.r+b.r) {
        b.dead=true;
        this.hp-=b.damage||20;
        triggerHitFlash(this);
        if (this.hp<=0) this.dead=true;
      }
    }
  }

  startDeath() {
    this._dying=true; this._dyingAge=0;
    this.shards=Array.from({length:6},()=>({
      x:this.x,y:this.y,
      vx:(Math.random()-0.5)*220,vy:(Math.random()-0.5)*220,
      life:0.5+Math.random()*0.3,age:0,
      r:3+Math.random()*4,
    }));
  }

  draw(ctx) {
    if (this.dead && !this._dying) return;
    if (this._dying) {
      this._dyingAge+=0.016;
      for (const s of this.shards) {
        s.age+=0.016; s.x+=s.vx*0.016; s.y+=s.vy*0.016;
        const a=Math.max(0,1-s.age/s.life);
        ctx.globalAlpha=a;
        ctx.fillStyle=this.color;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
      if (this._dyingAge>0.5) this.dead=true;
      return;
    }
    // Corpo: triângulo pequeno apontando para o player
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.beginPath();
    ctx.moveTo(this.r,0); ctx.lineTo(-this.r*0.7,this.r*0.6); ctx.lineTo(-this.r*0.7,-this.r*0.6);
    ctx.closePath();
    ctx.fillStyle=this.color;
    ctx.shadowColor=this.color; ctx.shadowBlur=8;
    ctx.fill();
    ctx.restore();
    drawHitFlash(ctx, this, this.r);
    ctx.globalAlpha=0.4;
    ctx.strokeStyle=this.color; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r+4,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=1;
    // HP bar
    const bw=28;
    ctx.fillStyle='#0d1e32bb'; ctx.fillRect(this.x-bw/2,this.y-this.r-8,bw,3);
    ctx.fillStyle=this.color; ctx.fillRect(this.x-bw/2,this.y-this.r-8,bw*Math.max(0,this.hp/this.maxHp),3);
  }
}

// ── TitanEnemy: tanque pesado (modo Cards, levels 5/13/17/25) ─
export class TitanEnemy {
  constructor(x, y, difficulty, hpMult=1) {
    const m = DIFF[difficulty]||1;
    this.x=x; this.y=y; this.vx=0; this.vy=0; this.angle=0;
    this.r=70;
    this.maxHp=Math.round((800+200*m)*hpMult); this.hp=this.maxHp;
    this.shield=120*hpMult; this.maxShield=this.shield;
    this.lives=1; this.maxLives=1;
    this.speed=90+20*m;
    this.damage=45*m;
    this.score=200+Math.round(100*hpMult);
    this.color='#226633';
    this.shieldColor='#00ff66';
    this.dead=false; this._age=0;
    this.shards=[]; this._dying=false; this._dyingAge=0;
    this._respawnTimer=0; this._respawnDuration=0;
    this._respawnX=x; this._respawnY=y;
    this._shootTimer=1.5+Math.random()*0.5;
    this._shootCd=2.2-m*0.2;
    this._shieldRegen=20; // HP escudo por segundo
    this.isAlien=true;
    this._audio=null;
  }

  setAudio(a) { this._audio=a; }
  get isRespawning() { return this._respawnTimer > 0; }

  update(dt, player, bullets) {
    if (this.dead) return;
    this._age+=dt;
    tickHitFlash(this, dt);
    // Regen de escudo
    if (this.shield < this.maxShield) this.shield=Math.min(this.maxShield, this.shield+this._shieldRegen*dt);
    // Movimento em direção ao player
    const dx=player.x-this.x, dy=player.y-this.y;
    const dist=Math.hypot(dx,dy)||1;
    if (dist > this.r+player.r+20) {
      this.x+=dx/dist*this.speed*dt;
      this.y+=dy/dist*this.speed*dt;
    }
    this.angle=Math.atan2(dy,dx);
    // Tiro em leque (3 projéteis)
    this._shootTimer-=dt;
    if (this._shootTimer<=0) {
      this._shootTimer=this._shootCd;
      this._audio?.playShoot?.();
      for (let a=-1;a<=1;a++) {
        const ang=this.angle+a*0.35;
        bullets.push({
          x:this.x+Math.cos(ang)*(this.r+10),
          y:this.y+Math.sin(ang)*(this.r+10),
          vx:Math.cos(ang)*320, vy:Math.sin(ang)*320,
          r:8, damage:this.damage, team:'enemy',
          life:3, dead:false, color:'#00ff44',
          update(dt2){ this.x+=this.vx*dt2; this.y+=this.vy*dt2; this.life-=dt2; if(this.life<=0)this.dead=true; },
          draw(ctx){ ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fillStyle='#00ff44'; ctx.shadowColor='#00ff44'; ctx.shadowBlur=12; ctx.fill(); },
        });
      }
    }
    // Colisão com balas do jogador
    for (const b of bullets) {
      if (b.team==='enemy' || b.dead) continue;
      if (Math.hypot(this.x-b.x, this.y-b.y) < this.r+b.r) {
        b.dead=true;
        const dmg=b.damage||20;
        if (this.shield>0) {
          const absorbed=Math.min(this.shield,dmg);
          this.shield-=absorbed;
          const rest=dmg-absorbed;
          if (rest>0) this.hp-=rest;
        } else {
          this.hp-=dmg;
        }
        triggerHitFlash(this);
        if (this.hp<=0) this.dead=true;
      }
    }
  }

  startDeath() {
    this._dying=true; this._dyingAge=0;
    this.shards=Array.from({length:18},()=>({
      x:this.x,y:this.y,
      vx:(Math.random()-0.5)*300,vy:(Math.random()-0.5)*300,
      life:0.8+Math.random()*0.5,age:0,
      r:6+Math.random()*10,
    }));
  }

  draw(ctx) {
    if (this.dead && !this._dying) return;
    if (this._dying) {
      this._dyingAge+=0.016;
      for (const s of this.shards) {
        s.age+=0.016; s.x+=s.vx*0.016; s.y+=s.vy*0.016;
        const a=Math.max(0,1-s.age/s.life);
        ctx.globalAlpha=a;
        ctx.fillStyle=this.color;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
      if (this._dyingAge>1) this.dead=true;
      return;
    }
    // Corpo hexagonal
    ctx.save();
    ctx.translate(this.x,this.y); ctx.rotate(this.angle);
    ctx.beginPath();
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3;
      i===0 ? ctx.moveTo(Math.cos(a)*this.r, Math.sin(a)*this.r)
             : ctx.lineTo(Math.cos(a)*this.r, Math.sin(a)*this.r);
    }
    ctx.closePath();
    ctx.fillStyle=this.color; ctx.shadowColor='#00ff44'; ctx.shadowBlur=20;
    ctx.fill();
    ctx.strokeStyle='#44ff88'; ctx.lineWidth=3; ctx.stroke();
    ctx.restore();
    drawHitFlash(ctx, this, this.r);
    // Anel de escudo
    if (this.shield>0) {
      const shieldAlpha=0.25+0.45*(this.shield/this.maxShield);
      ctx.globalAlpha=shieldAlpha;
      ctx.strokeStyle=this.shieldColor; ctx.lineWidth=6;
      ctx.shadowColor=this.shieldColor; ctx.shadowBlur=18;
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r+12,0,Math.PI*2); ctx.stroke();
      ctx.globalAlpha=1; ctx.shadowBlur=0;
    }
    // HP bar
    const bw=80;
    ctx.fillStyle='#0d1e32bb'; ctx.fillRect(this.x-bw/2,this.y-this.r-18,bw,8);
    ctx.fillStyle='#44ff88'; ctx.fillRect(this.x-bw/2,this.y-this.r-18,bw*Math.max(0,this.hp/this.maxHp),8);
    // Shield bar
    ctx.fillStyle='#003322'; ctx.fillRect(this.x-bw/2,this.y-this.r-28,bw,4);
    ctx.fillStyle=this.shieldColor; ctx.fillRect(this.x-bw/2,this.y-this.r-28,bw*Math.max(0,this.shield/this.maxShield),4);
    ctx.fillStyle='#44ff88'; ctx.font='bold 10px system-ui'; ctx.textAlign='center';
    ctx.fillText('TITAN',this.x,this.y-this.r-34);
  }
}

// ── CardDefenseManager: gerencia os 25 levels do modo Cards ──
export class CardDefenseManager {
  constructor(difficulty='moderado') {
    this.difficulty=difficulty;
    this.enemies=[];
    this.completedWaves=0;   // ondas concluídas desde o início
    this.currentLevel=1;     // 1-25
    this.waveInLevel=0;      // 0-2 (3 ondas por level)
    this.waveActive=false;
    this.waveTimer=99;       // espera carta inicial antes da 1ª onda
    this.toSpawn=[];
    this.spawnTimer=0;
    this.enemyScore=0;
    this._audio=null;
    this._pendingCardLevel=null; // level que disparou evento de carta
    this._initialCardPending=true; // mostra carta de build antes da onda 1
    this._prepareWave();

    // Levels que disparam escolha de carta (ao completar)
    this._cardLevels=new Set([1,3,5,7,9,11,13,15,17,19,21,23,24,25]);
  }

  setAudio(a) { this._audio=a; }

  get maxSimultaneous() {
    // Escala com o level: mínimo 4, máximo 12
    return Math.min(4 + Math.floor(this.currentLevel/3), 12);
  }

  _levelScale() {
    // Multiplicador de força dos inimigos por level
    const l=this.currentLevel;
    if (l<=4)  return 1;
    if (l<=8)  return 1+0.15*(l-4);
    if (l<=12) return 1.6+0.2*(l-8);
    if (l<=16) return 2.4+0.25*(l-12);
    if (l<=20) return 3.4+0.3*(l-16);
    return Math.min(3.5, 4.6+0.2*(l-20)); // cap em 3.5×
  }

  _edge() {
    const W=ARENA_W, H=ARENA_H;
    const side=Math.floor(Math.random()*4);
    if (side===0) return {x:Math.random()*W, y:-80};
    if (side===1) return {x:Math.random()*W, y:H+80};
    if (side===2) return {x:-80, y:Math.random()*H};
    return {x:W+80, y:Math.random()*H};
  }

  _prepareWave() {
    const l=this.currentLevel;
    const scale=this._levelScale();
    this.toSpawn=[];
    // Quantidade base de inimigos
    const base=Math.min(2+Math.floor(l*0.7), 10);
    // Composição por level
    if (l<=2) {
      // Só SmartEnemy e DroneEnemy
      for (let i=0;i<base;i++)
        this.toSpawn.push(Math.random()<0.4 ? 'drone' : 'smart');
    } else if (l<=4) {
      // Adiciona SwarmerEnemy
      for (let i=0;i<base;i++) {
        const r=Math.random();
        this.toSpawn.push(r<0.3?'drone': r<0.55?'swarm':'smart');
      }
    } else if (l===5) {
      // Onda especial: chefe Titan ao final
      for (let i=0;i<base;i++) this.toSpawn.push(Math.random()<0.5?'swarm':'smart');
      this.toSpawn.push('titan_1'); // HP×1
    } else if (l<=12) {
      // Mistura crescente com swarmers
      for (let i=0;i<base;i++) {
        const r=Math.random();
        this.toSpawn.push(r<0.35?'swarm': r<0.6?'drone':'smart');
      }
    } else if (l===13) {
      for (let i=0;i<base;i++) this.toSpawn.push(Math.random()<0.5?'swarm':'smart');
      this.toSpawn.push('titan_15'); // HP×1.5
    } else if (l<=16) {
      for (let i=0;i<base;i++) {
        const r=Math.random();
        this.toSpawn.push(r<0.4?'swarm': r<0.65?'drone':'smart');
      }
    } else if (l===17) {
      for (let i=0;i<base;i++) this.toSpawn.push(Math.random()<0.5?'swarm':'drone');
      this.toSpawn.push('titan_2'); // HP×2
    } else if (l<=23) {
      // Escalamento máximo
      for (let i=0;i<base;i++) {
        const r=Math.random();
        this.toSpawn.push(r<0.4?'swarm': r<0.65?'drone':'smart');
      }
    } else if (l===24) {
      for (let i=0;i<base;i++) this.toSpawn.push(Math.random()<0.5?'swarm':'smart');
      this.toSpawn.push('titan_15'); this.toSpawn.push('titan_15');
    } else {
      // Level 25 — boss: 3 Titans HP×3.5
      this.toSpawn=['titan_35','titan_35','titan_35'];
    }
    this.waveActive=false;
    this.waveTimer=this.waveInLevel===0 ? 5 : 3;
    this.spawnTimer=0;
  }

  update(dt, player, bullets, arena, itemMgr) {
    // Carta de build inicial — dispara antes da primeira onda começar
    if (this._initialCardPending) {
      this._initialCardPending = false;
      return { waveComplete:false, levelComplete:false, cardLevel:0 };
    }

    // Contagem de timer entre ondas
    if (!this.waveActive) {
      this.waveTimer-=dt;
      if (this.waveTimer<=0) { this.waveActive=true; this._audio?.playWaveStart?.(); }
      this._updateEnemies(dt, player, bullets, arena, itemMgr);
      return null;
    }

    // Spawn
    this.spawnTimer-=dt;
    const alive=this.enemies.filter(e=>!e.dead&&!e.isRespawning).length;
    if (this.spawnTimer<=0 && this.toSpawn.length>0 && alive<this.maxSimultaneous) {
      this.spawnTimer=0.6;
      const type=this.toSpawn.pop();
      const {x,y}=this._edge();
      const d=this.difficulty;
      let e;
      if (type==='swarm')        e=new SwarmerEnemy(x,y,d,true);
      else if (type==='drone')   e=new DroneEnemy(x,y,d);
      else if (type==='titan_1') e=new TitanEnemy(x,y,d,1);
      else if (type==='titan_15')e=new TitanEnemy(x,y,d,1.5);
      else if (type==='titan_2') e=new TitanEnemy(x,y,d,2);
      else if (type==='titan_35')e=new TitanEnemy(x,y,d,3.5);
      else {
        // SmartEnemy com cor verde/alien para o modo Cards
        e=new SmartEnemy(x,y,d,this.currentLevel,1);
        e.color='#44ff88';
      }
      e.setAudio(this._audio);
      this.enemies.push(e);
    }

    this._updateEnemies(dt, player, bullets, arena, itemMgr);

    // Verificar fim de onda
    if (this.waveActive && this.toSpawn.length===0 && this.enemies.filter(e=>!e.dead).length===0) {
      this.completedWaves++;
      this.waveInLevel++;

      if (this.waveInLevel>=3) {
        // Level concluído
        const finishedLevel=this.currentLevel;
        this.waveInLevel=0;
        if (this.currentLevel < 25) this.currentLevel++;
        this._prepareWave();

        if (this._cardLevels.has(finishedLevel)) {
          this._pendingCardLevel=finishedLevel;
          return { waveComplete:true, levelComplete:true, cardLevel:finishedLevel };
        }
        return { waveComplete:true, levelComplete:true, cardLevel:null };
      } else {
        // Próxima onda dentro do mesmo level
        this._prepareWave();
        return { waveComplete:true, levelComplete:false, cardLevel:null };
      }
    }
    return null;
  }

  _updateEnemies(dt, player, bullets, arena, itemMgr) {
    const next=[];
    for (const e of this.enemies) {
      if (e.dead && !e._dying) {
        e.startDeath?.();
        arena.spawnParticles(e.x,e.y,e.color||'#44ff88',16,180);
        itemMgr.spawnAt(e.x,e.y,2,arena);
        this.enemyScore+=e.score||10;
        this._audio?.playExplosion?.(1.5);
        next.push(e);
      } else if (e._dying) {
        if (!e.dead) next.push(e);
      } else {
        if (e instanceof TitanEnemy) e.update(dt, player, bullets);
        else if (e instanceof SwarmerEnemy) e.update(dt, player, bullets);
        else e.update(dt, player, bullets);
        next.push(e);
      }
    }
    this.enemies=next;
  }

  draw(ctx) {
    for (const e of this.enemies) e.draw(ctx);
    drawDamageNumbers(ctx);
  }

  get currentWave()   { return this.completedWaves+1; }
  get isWaveActive()  { return this.waveActive; }
  get waveCountdown() { return Math.ceil(this.waveTimer); }

  // Pilha de cartas rejeitadas: { id, rejectCount }
  _rejectedCards = [];

  recordRejection(cardId) {
    const existing = this._rejectedCards.find(r => r.id === cardId);
    if (existing) existing.rejectCount++;
    else this._rejectedCards.push({ id: cardId, rejectCount: 1 });
  }

  generateCardOptions(level, ownedCardIds=[]) {
    // Decks por tipo de level
    const positive = ['iron_hull','shield_wall','rapid_core','adrenaline','mana_surge','vampire_shot','lucky_drop','multi_barrel','magnet_field','burst_dash','rapid_charge','freeze_core','nova_core','shield_charge','regen_core'];
    const structures= ['tower_card','trap_card'];
    const negative  = ['glass_cannon','cursed_engine','blind_fire','berserker'];
    const upgrades  = ['power_surge','life_weave','speed_overclock'];
    const special   = ['fortify'];

    let pool = [];
    if (level <= 2) {
      pool = [...positive];
    } else if (level <= 4) {
      pool = [...positive, ...structures];
    } else if (level <= 8) {
      pool = [...positive, ...structures, ...negative];
    } else if ([9,13,17].includes(level)) {
      pool = [...upgrades, ...structures, ...positive.slice(0,5)];
    } else if ([24,25].includes(level)) {
      pool = [...special, ...upgrades, ...positive.slice(0,4)];
    } else {
      pool = [...positive, ...structures, ...negative, ...upgrades];
    }

    // Remove já escolhidos (se já ownership de 3 levels — máximo)
    const owned3 = new Set(ownedCardIds.filter(id => ownedCardIds.filter(x=>x===id).length>=3));
    pool = pool.filter(id => !owned3.has(id));
    if (!pool.length) pool = [...positive]; // fallback

    // Embaralha
    for (let i=pool.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }

    // Pega 3 cartas únicas
    const chosen = [];
    const seen = new Set();
    for (const id of pool) {
      if (!seen.has(id)) { seen.add(id); chosen.push(id); }
      if (chosen.length >= 3) break;
    }
    while (chosen.length < 3) chosen.push(positive[Math.floor(Math.random()*positive.length)]);

    // Prioriza upgrade de habilidades permanentes de slot ja escolhidas.
    const slotCards = new Set(['rapid_charge','freeze_core','nova_core','shield_charge','regen_core','tower_card','trap_card']);
    const upgradableSlots = [...new Set(ownedCardIds)]
      .filter(id => slotCards.has(id) && ownedCardIds.filter(x=>x===id).length < 3 && pool.includes(id));
    const slotUpgradeId = upgradableSlots.length
      ? upgradableSlots[Math.floor(Math.random()*upgradableSlots.length)]
      : null;

    // Sorteia 1 carta rejeitada para incluir (substitui uma das 3)
    let returnedCard = null;
    if (this._rejectedCards.length > 0) {
      const ri = Math.floor(Math.random() * this._rejectedCards.length);
      const rejected = this._rejectedCards[ri];
      returnedCard = { id: rejected.id, level: Math.min(3, rejected.rejectCount + 1), returned: true };
      chosen[0] = rejected.id; // substitui a primeira
    }
    if (slotUpgradeId) chosen[returnedCard ? 1 : 0] = slotUpgradeId;

    // Determina level das cartas
    return chosen.map((id, idx) => {
      if (idx === 0 && returnedCard && returnedCard.id === id) return returnedCard;
      const ownedCount = ownedCardIds.filter(x => x === id).length;
      return { id, level: Math.min(3, ownedCount + 1), returned: false };
    });
  }
}
