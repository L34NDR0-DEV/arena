// IA do inimigo — Contra1: nave inteligente com sistema de VIDAS.
import { ARENA_W, ARENA_H } from './arena.js';

const DIFF = { facil:0.6, moderado:1.0, dificil:1.5, insano:2.2 };
const MAX_LIVES = 5;

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

const ENEMY_SHIP_IMG    = loadEnemyImg('skininimiga.png');
const ENEMY_DISC_IMG    = loadEnemyImg('skininimigas.png');

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

export function spawnDamageNumber(x, y, value) {
  _dmgNums.push({ x, y: y - 10, value: Math.round(value), age: 0, maxAge: 1.1, vy: -48 - Math.random()*22, vx: (Math.random()-0.5)*30 });
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
    this.maxHp=120+40*m; this.hp=this.maxHp;
    this.lives=lives; this.maxLives=lives;
    this.speed=160+40*m;
    this.damage=22*m;
    this.score=15+5*wave;
    this.color='#ff3355';
    this.dead=false; this._age=0;
    this.isAlien=false; this._alienAngle=0;
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
    if (this._shootTimer<=0&&dist<520) {
      this._shootTimer=this._shootCd;
      this._firePredictive(tx,ty,pvx,pvy,dist,bullets);
      this._audio?.playEnemyShoot();
    }
  }

  _firePredictive(tx,ty,pvx,pvy,dist,bullets) {
    const bspd=340, tof=dist/bspd;
    const px=tx+pvx*tof*this._predictMult, py=ty+pvy*tof*this._predictMult;
    const nozzle=this._getNozzle();
    const dx=px-nozzle.x, dy=py-nozzle.y;
    const d=Math.hypot(dx,dy)||1;
    bullets.push({ x:nozzle.x,y:nozzle.y, vx:(dx/d)*bspd,vy:(dy/d)*bspd, damage:this.damage, owner:'enemy', life:1.6, owner_color:'#ff4466', dirX:dx/d,dirY:dy/d });
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
    drawEnemySprite(ctx, ENEMY_SHIP_IMG, this.r*2.4, 0);
    ctx.restore();

    // HP bar
    const bw=58;
    ctx.fillStyle='#0d1e32bb'; ctx.fillRect(this.x-bw/2,this.y-this.r-14,bw,6);
    ctx.fillStyle='#ff3355'; ctx.fillRect(this.x-bw/2,this.y-this.r-14,bw*Math.max(0,this.hp/this.maxHp),6);

    // Vidas
    drawLives(ctx,this.x,this.y-this.r-24,this.lives,this.maxLives,'#ff4466');

    // Label
    ctx.fillStyle='#ff6677'; ctx.font='10px system-ui'; ctx.textAlign='center';
    ctx.fillText('INIMIGO',this.x,this.y-this.r-36);
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
// skinIndex evita ids "somente recompensa" (REWARD_ONLY_SKIN_IDS = [10,12]
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
  get angle() { return this._brain.angle; }
  get hp() { return this._brain.hp; }
  get maxHp() { return this._brain.maxHp; }
  get r() { return this._brain.r; }
  get dead() { return this._brain.dead; }
  set dead(v) { this._brain.dead = v; }
  set hp(v) { this._brain.hp = v; }

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

  draw(ctx) {
    if (this.dead) return;
    this._brain.draw(ctx);
    const teamColor=TEAM_COLORS[this.team]||'#aaccff';
    ctx.save();
    ctx.strokeStyle=teamColor; ctx.globalAlpha=0.55; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r+14,0,Math.PI*2); ctx.stroke();
    ctx.restore();
    ctx.fillStyle=teamColor; ctx.font='11px system-ui'; ctx.textAlign='center';
    ctx.fillText(`[BOT] ${this.name}`, this.x, this.y-this.r-46);
  }
}

// ── Drone: inimigo rápido e pequeno ──────────────────────────
export class DroneEnemy {
  constructor(x, y, difficulty) {
    const m = DIFF[difficulty]||1;
    this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.r=22; this.angle=0; this._age=0;
    this.maxHp=40+14*m; this.hp=this.maxHp;
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
    if (this._shootTimer<=0&&dist<380) {
      this._shootTimer=this._shootCd;
      const noz={x:this.x+Math.sin(this.angle-Math.PI/2)*(-20),y:this.y-Math.cos(this.angle-Math.PI/2)*(-20)};
      const bspd=400, da=dx/dist, db=dy/dist;
      bullets.push({x:noz.x,y:noz.y,vx:da*bspd,vy:db*bspd,damage:this.damage,owner:'enemy',life:1.2,owner_color:'#ff8800',dirX:da,dirY:db});
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

    // HP bar
    const bw=34;
    ctx.fillStyle='#0d1e32bb'; ctx.fillRect(this.x-bw/2,this.y-this.r-10,bw,4);
    ctx.fillStyle='#ff8800'; ctx.fillRect(this.x-bw/2,this.y-this.r-10,bw*Math.max(0,this.hp/this.maxHp),4);

    // Label
    ctx.fillStyle='#ffaa44'; ctx.font='8px system-ui'; ctx.textAlign='center';
    ctx.fillText('DRONE',this.x,this.y-this.r-14);
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
    this.maxHp=140+40*m; this.hp=this.maxHp;
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
    if (this._shootTimer<=0) {
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
    bullets.push({ x:nozzle.x,y:nozzle.y, vx:(dx/d)*bspd,vy:(dy/d)*bspd, damage:this.damage, owner:'enemy', life:1.6, owner_color:'#ffaa00', dirX:dx/d,dirY:dy/d });
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

    // HP bar
    const bw=52;
    ctx.fillStyle='#0d1e32bb'; ctx.fillRect(this.x-bw/2,this.y-this.r-13,bw,5);
    ctx.fillStyle='#ffaa00'; ctx.fillRect(this.x-bw/2,this.y-this.r-13,bw*Math.max(0,this.hp/this.maxHp),5);

    // Label + indicador de estado
    ctx.fillStyle='#ffcc66'; ctx.font='9px system-ui'; ctx.textAlign='center';
    const stLabel = this._state==='defend' ? 'GUARDIÃO ▣ DEFENDENDO' : 'GUARDIÃO ▶ ATACANDO';
    ctx.fillText(stLabel,this.x,this.y-this.r-22);
  }
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

    // Contra 1: sistema de vidas compartilhado
    this._enemyLives=MAX_LIVES;
    this._playerLives=MAX_LIVES;
    this._livesResult=null; // 'player_win' | 'enemy_win'
  }

  setAudio(a) { this._audio=a; }

  // Para o modo Contra1: informa quantas vidas o player tem
  setPlayerLives(n) { this._playerLives=n; }

  get enemyLives() { return this._enemyLives; }
  get playerLives() { return this._playerLives; }
  get maxLives() { return MAX_LIVES; }
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
      this.toSpawn=['smart'];
    } else {
      const count=Math.min(2+this.wave,6);
      this.toSpawn=[];
      for (let i=0;i<count;i++) {
        // A partir da onda 2, mistura drones (~40%)
        if (this.wave>=2 && Math.random()<0.4) this.toSpawn.push('drone');
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
    if (this.mode!=='contra1') return;
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
          this._enemyLives=0;
          this._livesResult='player_win';
          arena.spawnParticles(e.x,e.y,e.color,22,200);
          itemMgr.spawnAt(e.x,e.y,3);
          this.enemyScore+=e.score;
          this._audio?.playExplosion(2);
        } else {
          arena.spawnParticles(e.x,e.y,e.color,16,180);
          itemMgr.spawnAt(e.x,e.y,2);
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
    if (this.mode!=='contra1') return;
    this._enemyLives--;
    enemy.lives=this._enemyLives;
    if (this._enemyLives<=0) {
      enemy.dead=true;
      // animação de morte completa é acionada no loop principal
    } else {
      enemy.loseLife();
      this._audio?.playExplosion(1);
      arena.spawnParticles(enemy.x,enemy.y,'#ff4466',12,160);
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
