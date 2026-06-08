// Torres Astrais — defesas fixas nos 4 cantos da arena.
// Começam neutras em pares (2 lado jogador / 2 lado inimigo) e mudam de dono ao serem destruídas.
// Renderizadas em pseudo-3D (camadas + gradientes + sombras) com animação de
// montagem e surgimento ao nascerem na arena.
import { ARENA_W, ARENA_H } from './arena.js';
import { spawnDamageNumber } from './enemies.js';

const TOWER_R       = 78;
const TOWER_MAX_HP  = 260;
const TOWER_RANGE   = 560;
const TOWER_DAMAGE  = 14;
const TOWER_SHOOT_CD= 1.1;
const MARGIN        = 360;
const EMERGE_DUR    = 2.6; // duração da animação de montagem/surgimento

const COLORS = {
  player:  '#00d4ff',
  enemy:   '#ff3355',
  red:     '#ff3355',
  blue:    '#00d4ff',
  neutral: '#a98cff',
};

// Torre central do Torneio "Tower Defense" — núcleo vivo que defende a si
// mesmo: muito mais resistente que as torres astrais clássicas (é o objetivo
// de uma partida 2x2 inteira) e agora REAGE a quem se aproxima — atira em
// qualquer nave (de qualquer time) que entrar no seu raio de alcance, com
// dano alto e cadência rápida. Nasce neutra ('neutral'), sem dono, no centro.
const CENTRAL_TOWER_MAX_HP   = 3500;  // muito mais resistente — objetivo central de uma partida
const CENTRAL_TOWER_RANGE    = 820;   // alcance maior — pressiona quem fica parado longe
const CENTRAL_TOWER_DAMAGE   = 55;    // tiro doído — obriga coordenação de time
const CENTRAL_TOWER_SHOOT_CD = 0.38;  // cadência alta — chuva de tiros sob foco

export class Tower {
  constructor(x, y, side, corner) {
    this.x=x; this.y=y;
    this.r=TOWER_R;
    this.side=side;       // 'player' | 'enemy' — lado de origem (geográfico)
    this.owner=side;      // 'player' | 'enemy' — dono atual (muda ao ser destruída)
    this.corner=corner;   // identificador do canto (0-3), p/ debug/HUD
    this.maxHp=TOWER_MAX_HP; this.hp=this.maxHp;
    this.dead=false;
    this._shootCd=Math.random()*TOWER_SHOOT_CD;
    this._turretAngle=0;
    this._hitFlash=0;
    this._destroyedFlash=0;
    this.captures=0; // quantas vezes já trocou de dono (visual/estatística)

    // ── Animação de surgimento/montagem ──────────────────────
    this._emergeT=0;          // 0 → 1 ao longo de EMERGE_DUR
    this.emerging=true;       // true enquanto a torre está sendo montada (sem combate)
    this._emergeParticles=this._spawnEmergeParticles();
    this._ringPulse=Math.random()*Math.PI*2;
  }

  get color() { return COLORS[this.owner]; }

  _spawnEmergeParticles() {
    const list=[];
    for (let i=0;i<22;i++) {
      const a=Math.random()*Math.PI*2;
      const dist=this.r*(1.4+Math.random()*1.6);
      list.push({
        a, dist,
        h: Math.random()*260+40,
        speed: 0.55+Math.random()*0.5,
        delay: Math.random()*0.9,
        size: 2+Math.random()*3,
      });
    }
    return list;
  }

  takeDamage(amount) {
    // Torres surgindo, reconstruindo ou já mortas são invulneráveis
    if (this.dead||this.emerging||this._rebuilding) return false;
    this.hp=Math.max(0,this.hp-amount);
    this._hitFlash=0.15;
    spawnDamageNumber(this.x+(Math.random()-0.5)*this.r, this.y-this.r-10, amount);
    if (this.hp<=0) return true;
    return false;
  }

  // Recaptura com reconstrução: em vez de renascer instantaneamente, a torre
  // entra em fase de reconstrução (EMERGE_DUR segundos, igual ao surgimento
  // inicial) — durante esse tempo não atira e não recebe dano, dando uma janela
  // de oportunidade tática para o time atacante.
  captureBy(newOwner) {
    this.owner=newOwner;
    this.hp=this.maxHp;
    this.dead=false;
    this.captures++;
    this._destroyedFlash=0.6;
    // Inicia fase de reconstrução (reaproveita a animação de surgimento)
    this._rebuilding=true;
    this._rebuildT=0;
    this._emergeParticles=this._spawnEmergeParticles(); // partículas frescas
  }

  // Nome da torre baseado em capturas — "transforma" com o histórico de batalha
  get _tierLabel() {
    if (this.captures>=3) return 'TORRE ANCESTRAL';
    if (this.captures>=1) return 'TORRE FORJADA';
    return 'TORRE ASTRAL';
  }

  // Raio visual aumenta levemente a cada captura (max +25%) — torre "cresce"
  get _visualR() { return this.r * (1 + Math.min(this.captures, 3)*0.08); }

  update(dt, player, enemies, bullets) {
    // ── Fase de montagem/surgimento inicial ───────────────────
    if (this.emerging) {
      this._emergeT=Math.min(1,this._emergeT+dt/EMERGE_DUR);
      if (this._emergeT>=1) this.emerging=false;
      return; // torre ainda não combate enquanto surge
    }

    // ── Fase de reconstrução (após ser capturada) ─────────────
    if (this._rebuilding) {
      this._rebuildT=Math.min(1,(this._rebuildT||0)+dt/EMERGE_DUR);
      // Reutiliza _emergeT para a animação _drawEmerging
      this._emergeT=this._rebuildT;
      if (this._rebuildT>=1) {
        this._rebuilding=false;
        this._emergeT=1; // garante que _drawBody receba rise=1,assembly=1
      }
      return; // não atira durante reconstrução
    }

    if (this._hitFlash>0) this._hitFlash-=dt;
    if (this._destroyedFlash>0) this._destroyedFlash-=dt;
    this._ringPulse+=dt;
    if (this.dead) return;

    // Procura alvo mais próximo que NÃO seja do mesmo time da torre
    let target=null, bestD=TOWER_RANGE;
    if (this.owner==='enemy') {
      // Torre inimiga atira no jogador
      if (!player.dead && !player.isInvisible) {
        const d=Math.hypot(player.x-this.x,player.y-this.y);
        if (d<bestD) { target=player; bestD=d; }
      }
    } else {
      // Torre do jogador atira nos inimigos
      for (const e of enemies) {
        if (e.dead||e.isRespawning) continue;
        const d=Math.hypot(e.x-this.x,e.y-this.y);
        if (d<bestD) { target=e; bestD=d; }
      }
    }

    if (target) {
      this._turretAngle=Math.atan2(target.y-this.y,target.x-this.x);
      this._shootCd-=dt;
      if (this._shootCd<=0) {
        this._shootCd=TOWER_SHOOT_CD;
        this._fire(target,bullets);
      }
    }
  }

  _fire(target,bullets) {
    const bspd=300;
    const dx=target.x-this.x, dy=target.y-this.y;
    const d=Math.hypot(dx,dy)||1;
    const nx=this.x+Math.cos(this._turretAngle)*(this.r+10);
    const ny=this.y+Math.sin(this._turretAngle)*(this.r+10);
    bullets.push({
      x:nx, y:ny,
      vx:(dx/d)*bspd, vy:(dy/d)*bspd,
      damage:TOWER_DAMAGE, owner:'tower', team:this.owner,
      life:1.8, owner_color:this.color, dirX:dx/d, dirY:dy/d, r:5,
    });
  }

  draw(ctx) {
    // Reconstrução e surgimento inicial usam a mesma animação _drawEmerging
    if (this.emerging||this._rebuilding) { this._drawEmerging(ctx); return; }

    const col=this.color;
    const r=this._visualR; // cresce com captures (transformação)

    ctx.save();
    ctx.translate(this.x,this.y);

    // Aura/anel de alcance (sutil) — anel extra para torres mais experientes
    ctx.globalAlpha=0.045;
    ctx.strokeStyle=col; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,0,TOWER_RANGE,0,Math.PI*2); ctx.stroke();
    if (this.captures>=1) {
      ctx.globalAlpha=0.025;
      ctx.beginPath(); ctx.arc(0,0,TOWER_RANGE*1.12,0,Math.PI*2); ctx.stroke();
    }
    ctx.globalAlpha=1;

    this._drawBody(ctx, col, r, 1, 1);

    // Barra de HP
    ctx.restore();
    const w=110,h=9, bx=this.x-w/2, by=this.y-r*1.55-26;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(bx-2,by-2,w+4,h+4);
    ctx.fillStyle='#222'; ctx.fillRect(bx,by,w,h);
    const pct=this.hp/this.maxHp;
    const hpGrad=ctx.createLinearGradient(bx,0,bx+w,0);
    hpGrad.addColorStop(0,col+'88'); hpGrad.addColorStop(1,col);
    ctx.fillStyle=hpGrad; ctx.shadowColor=col; ctx.shadowBlur=8;
    ctx.fillRect(bx,by,w*pct,h);
    ctx.shadowBlur=0;
    ctx.strokeStyle=col+'66'; ctx.lineWidth=1; ctx.strokeRect(bx,by,w,h);
    ctx.restore();

    // Label com tier (transforma conforme histórico de batalha)
    ctx.save();
    ctx.fillStyle=col; ctx.font='bold 13px system-ui'; ctx.textAlign='center';
    ctx.shadowColor=col; ctx.shadowBlur=6;
    ctx.fillText(this._tierLabel, this.x, by-10);
    // Contador de capturas para torres experientes
    if (this.captures>0) {
      ctx.font='10px system-ui'; ctx.shadowBlur=3;
      ctx.fillText(`★`.repeat(Math.min(this.captures,3)), this.x, by-24);
    }
    ctx.shadowBlur=0;
    ctx.restore();

    // Flash de captura
    if (this._destroyedFlash>0) {
      ctx.save();
      ctx.globalAlpha=this._destroyedFlash/0.6*0.5;
      ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(this.x,this.y,r*2.6,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  // Desenha a estrutura completa da torre — cristal hexagonal facetado com
  // anéis de energia rotativos, em camadas pseudo-3D.
  // `rise` (0-1) controla quanto da torre já "subiu" do chão (animação de surgimento).
  // `assembly` (0-1) controla o quanto das peças já se encaixaram (escala/opacidade).
  _drawBody(ctx, col, r, rise, assembly) {
    const liftY = (1-rise) * r*1.4; // desloca a estrutura para baixo enquanto "emerge"

    ctx.save();
    ctx.translate(0, liftY);

    // ── Sombra projetada no "chão" (achatada, dá noção de profundidade) ──
    ctx.save();
    ctx.globalAlpha=0.35*assembly;
    ctx.fillStyle='#000814';
    ctx.beginPath();
    ctx.ellipse(0, r*0.92 - liftY*0.5, r*1.08, r*0.34, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // ── Base hexagonal "inferior" (face de baixo, mais escura = volume) ──
    ctx.save();
    ctx.translate(0, r*0.30);
    ctx.scale(1, 0.62);
    ctx.fillStyle='#050b14';
    ctx.strokeStyle=col; ctx.globalAlpha=0.9*assembly; ctx.lineWidth=3;
    this._hexagon(ctx, r*1.05, 0);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // ── Corpo cristalino central (faces facetadas tipo gema) ──
    const bodyH=r*0.95;
    const bodyGrad=ctx.createLinearGradient(-r,0,r,0);
    bodyGrad.addColorStop(0,'#040b16');
    bodyGrad.addColorStop(0.5,'#0d1c30');
    bodyGrad.addColorStop(1,'#040b16');
    ctx.save();
    ctx.globalAlpha=assembly;
    ctx.fillStyle=bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-r*0.92, 0);
    ctx.lineTo(-r*0.92, bodyH*0.55);
    ctx.lineTo(0, bodyH*0.55+r*0.30);
    ctx.lineTo(r*0.92, bodyH*0.55);
    ctx.lineTo(r*0.92, 0);
    ctx.closePath();
    ctx.fill();

    // facetas angulares de cristal (linhas convergindo para o ápice central,
    // como cortes de gema, em vez de painéis verticais retos)
    ctx.strokeStyle=col+'3a'; ctx.lineWidth=1.4;
    const apex={x:0, y:bodyH*0.55+r*0.30};
    for (let i=-3;i<=3;i++) {
      if (i===0) continue;
      const px=i*r*0.30;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(apex.x, apex.y);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(apex.x,apex.y); ctx.stroke();
    ctx.restore();

    // ── Anéis de energia concêntricos e rotativos (brilho neon) ──
    // Anel externo gira lento em sentido horário, interno gira mais rápido
    // em sentido anti-horário — reforça a leitura "estrutura cristalina viva".
    const ringPulse=0.65+0.35*Math.sin(this._ringPulse*2.2);
    ctx.save();
    ctx.globalAlpha=0.75*assembly;
    ctx.translate(0, bodyH*0.30);
    ctx.scale(1, 0.34);
    ctx.rotate(this._ringPulse*0.45);
    ctx.strokeStyle=col;
    ctx.lineWidth=3;
    ctx.shadowColor=col; ctx.shadowBlur=16*ringPulse;
    this._hexagon(ctx, r*1.05, 0);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha=0.55*assembly;
    ctx.translate(0, bodyH*0.30);
    ctx.scale(1, 0.34);
    ctx.rotate(-this._ringPulse*0.85);
    ctx.strokeStyle='#ffffff';
    ctx.lineWidth=1.6;
    ctx.shadowColor=col; ctx.shadowBlur=10*ringPulse;
    this._hexagon(ctx, r*0.78, Math.PI/6);
    ctx.stroke();
    ctx.restore();

    // ── Topo hexagonal (face superior, mais clara = recebe "luz") ──
    const topY=-bodyH*0.50;
    ctx.save();
    ctx.translate(0, topY);
    ctx.scale(1, 0.62);
    const topGrad=ctx.createRadialGradient(0,0,0,0,0,r*1.05);
    topGrad.addColorStop(0,'#16314f');
    topGrad.addColorStop(1,'#060f1c');
    ctx.fillStyle=topGrad;
    ctx.strokeStyle=col; ctx.globalAlpha=assembly; ctx.lineWidth=3;
    this._hexagon(ctx, r*1.0, 0);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // ── Núcleo de cristal pulsante (gema hexagonal brilhante no topo) ──
    const pulse=0.7+0.3*Math.sin(Date.now()*0.005);
    ctx.save();
    ctx.translate(0, topY);
    ctx.globalAlpha=assembly;
    const coreR=r*0.46;
    // halo de luz por trás da gema
    const halo=ctx.createRadialGradient(0,0,0,0,0,coreR*1.4);
    halo.addColorStop(0,'#ffffff'); halo.addColorStop(0.35,col+'dd'); halo.addColorStop(1,col+'00');
    ctx.globalAlpha=pulse*assembly;
    ctx.fillStyle=halo;
    ctx.beginPath(); ctx.arc(0,0,coreR*1.4,0,Math.PI*2); ctx.fill();
    // gema hexagonal facetada (gradiente vertical do branco-quente ao tom do dono)
    ctx.save();
    ctx.rotate(this._ringPulse*0.6);
    const gemGrad=ctx.createLinearGradient(0,-coreR,0,coreR);
    gemGrad.addColorStop(0,'#ffffff');
    gemGrad.addColorStop(0.45,col);
    gemGrad.addColorStop(1,col+'aa');
    ctx.fillStyle=gemGrad;
    ctx.shadowColor=col; ctx.shadowBlur=20*pulse;
    this._hexagon(ctx, coreR, 0);
    ctx.fill();
    // facetas internas da gema (cortes de luz)
    ctx.strokeStyle='#ffffff77'; ctx.lineWidth=1;
    for (let i=0;i<3;i++) {
      const a=i*Math.PI/3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*coreR, Math.sin(a)*coreR);
      ctx.lineTo(Math.cos(a+Math.PI)*coreR, Math.sin(a+Math.PI)*coreR);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha=assembly;

    // ── Canhão/torreta apontando pro alvo (saliência 3D) ──
    ctx.save();
    ctx.rotate(this._turretAngle);
    const turretGrad=ctx.createLinearGradient(0,-9,0,9);
    turretGrad.addColorStop(0,'#ffffff66');
    turretGrad.addColorStop(0.5,col);
    turretGrad.addColorStop(1,'#00000066');
    ctx.fillStyle=turretGrad; ctx.shadowColor=col; ctx.shadowBlur=14;
    ctx.fillRect(0,-9,r+30,18);
    ctx.fillStyle='#ffffffaa';
    ctx.fillRect(r*0.55,-3,r*0.55,4);
    ctx.restore();

    ctx.fillStyle='#ffffff';
    ctx.shadowColor='#fff'; ctx.shadowBlur=10;
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();

    // ── Espiras de cristal laterais (substituem as antenas mecânicas) ──
    ctx.save();
    ctx.globalAlpha=0.85*assembly;
    ctx.strokeStyle=col; ctx.lineWidth=2.4; ctx.shadowColor=col; ctx.shadowBlur=8;
    for (const side of [-1,1]) {
      const bx=side*r*0.62, by=topY+r*0.18;
      const tx=side*r*0.95, ty=topY-r*0.55;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // ponta em diamante (espira de cristal) em vez de círculo
      ctx.save();
      ctx.translate(tx,ty);
      ctx.fillStyle=col;
      ctx.beginPath();
      ctx.moveTo(0,-4.6); ctx.lineTo(3.2,0); ctx.lineTo(0,4.6); ctx.lineTo(-3.2,0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur=0;
    ctx.restore();

    // ── Hit flash ──
    if (this._hitFlash>0) {
      ctx.save();
      ctx.globalAlpha=(this._hitFlash/0.15)*0.55;
      ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.arc(0, topY, r*0.7, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // translate liftY
  }

  // Hexágono regular; `rotation` permite girar o desenho (usado pelos anéis
  // rotativos e pela gema do núcleo, que giram em velocidades diferentes).
  _hexagon(ctx, radius, rotation) {
    ctx.beginPath();
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3 - Math.PI/6 + rotation;
      const px=Math.cos(a)*radius, py=Math.sin(a)*radius;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
  }

  // ── Animação de montagem + surgimento ─────────────────────────
  _drawEmerging(ctx) {
    const t=this._emergeT;
    const col=this.color;
    const r=this.r;

    ctx.save();
    ctx.translate(this.x,this.y);

    // Fase 1 (0 → 0.45): plataforma de energia se forma no chão, partículas convergem
    // Fase 2 (0.35 → 1): estrutura "sobe" do chão e se monta em camadas (rise + assembly)
    const platformPct = Math.min(1, t/0.45);
    const rise        = Math.max(0, Math.min(1, (t-0.30)/0.55));
    const assembly    = Math.max(0, Math.min(1, (t-0.45)/0.55));

    // Anel de energia no chão (plataforma de montagem)
    ctx.save();
    ctx.globalAlpha=platformPct*(1-rise*0.5);
    ctx.scale(1,0.4);
    const ringR=r*(0.4+platformPct*1.3);
    ctx.strokeStyle=col; ctx.lineWidth=4;
    ctx.shadowColor=col; ctx.shadowBlur=24;
    ctx.beginPath(); ctx.arc(0,0,ringR,0,Math.PI*2); ctx.stroke();
    ctx.lineWidth=1.4; ctx.globalAlpha*=0.5;
    ctx.beginPath(); ctx.arc(0,0,ringR*0.7,0,Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.restore();

    // Feixe de luz vertical (energia condensando)
    if (platformPct>0.05 && rise<0.95) {
      ctx.save();
      const beamA=(1-rise)*platformPct*0.5;
      const beamGrad=ctx.createLinearGradient(0,-r*2.4,0,r*0.6);
      beamGrad.addColorStop(0,col+'00');
      beamGrad.addColorStop(0.6,col+'55');
      beamGrad.addColorStop(1,col+'00');
      ctx.globalAlpha=beamA;
      ctx.fillStyle=beamGrad;
      ctx.fillRect(-r*0.22,-r*2.4,r*0.44,r*3);
      ctx.restore();
    }

    // Partículas convergindo em espiral para o centro (montagem)
    for (const p of this._emergeParticles) {
      const local=Math.max(0, Math.min(1, (t-p.delay)/(0.85*p.speed)));
      if (local<=0) continue;
      const ease=1-Math.pow(1-local,3);
      const ang=p.a + (1-ease)*4.2;
      const dist=p.dist*(1-ease);
      const py=Math.sin(ang)*dist*0.42 - p.h*(1-ease) - rise*r*0.4;
      const px=Math.cos(ang)*dist;
      ctx.save();
      ctx.globalAlpha=ease*(1-Math.max(0,(local-0.85)/0.15));
      ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=8;
      // estilhaços de cristal (diamantes) em vez de partículas circulares
      const ps=p.size*(0.4+ease*0.6);
      ctx.translate(px,py);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0,-ps); ctx.lineTo(ps*0.6,0); ctx.lineTo(0,ps); ctx.lineTo(-ps*0.6,0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Estrutura sobe e se monta
    if (rise>0||assembly>0) {
      ctx.save();
      ctx.globalAlpha=Math.max(rise,assembly);
      this._drawBody(ctx, col, r, Math.max(rise,0.001), assembly);
      ctx.restore();
    }

    // Flash final ao concluir a montagem
    if (t>0.92) {
      const fp=(t-0.92)/0.08;
      ctx.save();
      ctx.globalAlpha=(1-fp)*0.6;
      ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.arc(0,-r*0.7, r*1.6*(0.4+fp*0.8), 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // Texto de status
    if (t<0.97) {
      ctx.save();
      ctx.fillStyle=col; ctx.font='bold 12px system-ui'; ctx.textAlign='center';
      ctx.globalAlpha=0.85;
      ctx.shadowColor=col; ctx.shadowBlur=6;
      const txt = this._rebuilding
        ? (t<0.45 ? 'RECONSTITUINDO ENERGIA…' : 'RECONSTRUINDO TORRE…')
        : (t<0.45 ? 'CONVERGINDO ENERGIA…'     : 'MONTANDO TORRE…');
      ctx.fillText(txt, 0, -r*2.1);
      ctx.shadowBlur=0;
      ctx.restore();
    }

    ctx.restore();
  }
}

export class TowerManager {
  constructor() {
    this.towers=[];
    this._winner=null; // 'player' | 'enemy' | null
    this._buildTowers();
  }

  _buildTowers() {
    const m=MARGIN;
    // Cantos: 0=sup-esq, 1=sup-dir, 2=inf-esq, 3=inf-dir
    // Lado jogador (spawn ARENA_W/2,ARENA_H/2 — definimos esquerda como "lado jogador")
    const corners=[
      { x:m,             y:m,             side:'player' },
      { x:ARENA_W-m,     y:m,             side:'enemy'  },
      { x:m,             y:ARENA_H-m,     side:'player' },
      { x:ARENA_W-m,     y:ARENA_H-m,     side:'enemy'  },
    ];
    this.towers=corners.map((c,i)=>new Tower(c.x,c.y,c.side,i));
    // escalona o início da animação de surgimento de cada torre
    this.towers.forEach((t,i)=>{ t._emergeT=-i*0.35; t.emerging=true; });
    // normaliza para não começar com t negativo (apenas atrasa visualmente)
    for (const t of this.towers) {
      t._emergeDelay = Math.max(0, -t._emergeT);
      t._emergeT = 0;
    }
  }

  get winner() { return this._winner; }

  // Torres vivas controladas por um dono específico
  countByOwner(owner) {
    return this.towers.filter(t=>!t.dead&&t.owner===owner).length;
  }

  update(dt, player, enemies, bullets) {
    if (this._winner) return;
    for (const t of this.towers) {
      if (t._emergeDelay>0) { t._emergeDelay-=dt; continue; }
      t.update(dt,player,enemies,bullets);
    }
  }

  // Aplica dano de projétil/colisão a uma torre próxima; retorna info do impacto ou null
  damageNearest(x,y,radius,amount,attackerTeam) {
    for (const t of this.towers) {
      if (t.dead||t.emerging||t.owner===attackerTeam) continue;
      const d=Math.hypot(t.x-x,t.y-y);
      if (d<t.r+radius) {
        const destroyed=t.takeDamage(amount);
        if (destroyed) {
          const prevOwner=t.owner;
          t.captureBy(attackerTeam);
          this._checkWin();
          return { tower:t, destroyed:true, prevOwner, newOwner:attackerTeam };
        }
        return { tower:t, destroyed:false };
      }
    }
    return null;
  }

  _checkWin() {
    if (this._winner) return;
    // Vitória: capturar as 2 torres originárias de um lado geográfico
    const enemySide  = this.towers.filter(t=>t.side==='enemy');
    const playerSide = this.towers.filter(t=>t.side==='player');

    if (enemySide.length && enemySide.every(t=>t.owner==='player')) { this._winner='player'; return; }
    if (playerSide.length && playerSide.every(t=>t.owner==='enemy')) { this._winner='enemy'; return; }
  }

  draw(ctx) {
    for (const t of this.towers) {
      if (t._emergeDelay>0) continue; // ainda não surgiu — invisível
      t.draw(ctx);
    }
  }
}

// ── Torre central do Torneio "Tower Defense" ──────────────────────────
// Objetivo único de uma partida 2x2: nasce neutra no centro da arena, não
// atira (é um alvo a ser destruído, não uma defesa) e, ao ter o HP zerado,
// é "conquistada" pelo time atacante — fechando a partida imediatamente.
// Reaproveita toda a renderização cristalina de `Tower`/`_drawBody`, só
// substitui a lógica de alvo/disparo (que não se aplica aqui) por nada.
export class CentralTower extends Tower {
  constructor(x, y) {
    super(x, y, 'neutral', -1);
    this.maxHp=CENTRAL_TOWER_MAX_HP;
    this.hp=this.maxHp;
    this._shootCd=Math.random()*CENTRAL_TOWER_SHOOT_CD;
  }

  // A torre central é um núcleo VIVO que se defende: mira e atira na nave
  // mais próxima dentre todas as fornecidas (de ambos os times — ela não tem
  // lado, hostiliza qualquer um que se aproxime). `attackers` é uma lista de
  // objetos com {x,y,r,dead,team}; passada pelo TowerDefenseManager a cada frame.
  update(dt, attackers=[]) {
    if (this.emerging) {
      this._emergeT=Math.min(1,this._emergeT+dt/EMERGE_DUR);
      if (this._emergeT>=1) this.emerging=false;
      return;
    }
    if (this._hitFlash>0) this._hitFlash-=dt;
    if (this._destroyedFlash>0) this._destroyedFlash-=dt;
    this._ringPulse+=dt;
    if (this.dead) return;

    let target=null, bestD=CENTRAL_TOWER_RANGE;
    for (const a of attackers) {
      if (!a || a.dead) continue;
      const d=Math.hypot(a.x-this.x, a.y-this.y);
      if (d<bestD) { bestD=d; target=a; }
    }

    if (target) {
      this._turretAngle=Math.atan2(target.y-this.y,target.x-this.x);
      this._shootCd-=dt;
      if (this._shootCd<=0) {
        this._shootCd=CENTRAL_TOWER_SHOOT_CD;
        this._fireAt(target);
      }
    }
  }

  // Disparo do núcleo central — usa o array de balas do CombatSystem (injetado
  // pelo TowerDefenseManager) com dano/velocidade próprios, mais fortes que os
  // das Torres Astrais — reflete que esse é o alvo final, mais bem defendido.
  _fireAt(target) {
    if (!this._bullets) return;
    const bspd=380;
    const dx=target.x-this.x, dy=target.y-this.y;
    const d=Math.hypot(dx,dy)||1;
    const nx=this.x+Math.cos(this._turretAngle)*(this.r+12);
    const ny=this.y+Math.sin(this._turretAngle)*(this.r+12);
    this._bullets.push({
      x:nx, y:ny,
      vx:(dx/d)*bspd, vy:(dy/d)*bspd,
      damage:CENTRAL_TOWER_DAMAGE, owner:'tower', team:'neutral',
      life:2.0, owner_color:this.color, dirX:dx/d, dirY:dy/d, r:6,
    });
  }

  draw(ctx) {
    if (this.emerging) { this._drawEmerging(ctx); return; }

    const col=this.color;
    const r=this.r;

    ctx.save();
    ctx.translate(this.x,this.y);
    this._drawBody(ctx, col, r, 1, 1);
    ctx.restore();

    const w=160,h=11, bx=this.x-w/2, by=this.y-r*1.55-30;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(bx-2,by-2,w+4,h+4);
    ctx.fillStyle='#222'; ctx.fillRect(bx,by,w,h);
    const pct=this.hp/this.maxHp;
    const hpGrad=ctx.createLinearGradient(bx,0,bx+w,0);
    hpGrad.addColorStop(0,col+'88'); hpGrad.addColorStop(1,col);
    ctx.fillStyle=hpGrad; ctx.shadowColor=col; ctx.shadowBlur=10;
    ctx.fillRect(bx,by,w*pct,h);
    ctx.shadowBlur=0;
    ctx.strokeStyle=col+'66'; ctx.lineWidth=1; ctx.strokeRect(bx,by,w,h);
    ctx.restore();

    ctx.save();
    ctx.fillStyle=col; ctx.font='bold 15px system-ui'; ctx.textAlign='center';
    ctx.shadowColor=col; ctx.shadowBlur=8;
    ctx.fillText('TORRE CENTRAL — DESTRUA PARA CONQUISTAR', this.x, by-12);
    ctx.shadowBlur=0;
    ctx.restore();

    if (this._destroyedFlash>0) {
      ctx.save();
      ctx.globalAlpha=this._destroyedFlash/0.6*0.5;
      ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(this.x,this.y,r*2.6,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
}

// Gerencia a única torre central de uma partida do Torneio Tower Defense:
// nasce neutra, e o time que aplica o golpe fatal a conquista — encerrando
// a disputa (mecânica "destruir para conquistar", igual à Torre Astral, mas
// aplicada a 1 alvo central em vez de 4 cantos e a times 'red'/'blue').
export class TowerDefenseManager {
  constructor(arenaW, arenaH) {
    this.tower = new CentralTower(arenaW/2, arenaH/2);
    this._winnerTeam=null; // 'red' | 'blue' | null
  }

  get winnerTeam() { return this._winnerTeam; }

  // `bullets` é o array compartilhado do CombatSystem — a torre central
  // dispara diretamente nele. `attackers` é a lista de naves vivas (jogador
  // local + remotos + bots) que servem de alvo para a defesa automática.
  update(dt, bullets=[], attackers=[]) {
    if (this._winnerTeam) return;
    this.tower._bullets = bullets;
    this.tower.update(dt, attackers);
  }

  // Aplica dano ao alvo central; retorna info do impacto ou null.
  // `attackerTeam` é 'red' | 'blue' — times opostos no 2x2.
  damageCentral(x, y, radius, amount, attackerTeam) {
    const t=this.tower;
    if (t.dead||t.emerging||this._winnerTeam) return null;
    const d=Math.hypot(t.x-x,t.y-y);
    if (d>=t.r+radius) return null;

    const destroyed=t.takeDamage(amount);
    if (destroyed) {
      t.captureBy(attackerTeam);
      this._winnerTeam=attackerTeam;
      return { tower:t, destroyed:true, winnerTeam:attackerTeam };
    }
    return { tower:t, destroyed:false };
  }

  draw(ctx) {
    this.tower.draw(ctx);
  }
}
