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
  player: '#00d4ff',
  enemy:  '#ff3355',
};

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
    if (this.dead||this.emerging) return false;
    this.hp=Math.max(0,this.hp-amount);
    this._hitFlash=0.15;
    spawnDamageNumber(this.x+(Math.random()-0.5)*this.r, this.y-this.r-10, amount);
    if (this.hp<=0) return true;
    return false;
  }

  // Recaptura: a torre "renasce" sob controle de quem a destruiu
  captureBy(newOwner) {
    this.owner=newOwner;
    this.hp=this.maxHp;
    this.dead=false;
    this.captures++;
    this._destroyedFlash=0.6;
  }

  update(dt, player, enemies, bullets) {
    // ── Fase de montagem/surgimento ───────────────────────────
    if (this.emerging) {
      this._emergeT=Math.min(1,this._emergeT+dt/EMERGE_DUR);
      if (this._emergeT>=1) this.emerging=false;
      return; // torre ainda não combate enquanto surge
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
    if (this.emerging) { this._drawEmerging(ctx); return; }

    const col=this.color;
    const r=this.r;

    ctx.save();
    ctx.translate(this.x,this.y);

    // Aura/anel de alcance (sutil)
    ctx.globalAlpha=0.045;
    ctx.strokeStyle=col; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,0,TOWER_RANGE,0,Math.PI*2); ctx.stroke();
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

    // Label
    ctx.save();
    ctx.fillStyle=col; ctx.font='bold 13px system-ui'; ctx.textAlign='center';
    ctx.shadowColor=col; ctx.shadowBlur=6;
    ctx.fillText('TORRE ASTRAL', this.x, by-10);
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

  // Desenha a estrutura completa da torre em camadas pseudo-3D.
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

    // ── Base octogonal "inferior" (face de baixo, mais escura = volume) ──
    ctx.save();
    ctx.translate(0, r*0.30);
    ctx.scale(1, 0.62);
    ctx.fillStyle='#050b14';
    ctx.strokeStyle=col; ctx.globalAlpha=0.9*assembly; ctx.lineWidth=3;
    this._octagon(ctx, r*1.05);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // ── Corpo cilíndrico central (camadas verticais simulam volume) ──
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

    // linhas verticais de painel (dão textura/volume ao cilindro)
    ctx.strokeStyle=col+'33'; ctx.lineWidth=1.4;
    for (let i=-3;i<=3;i++) {
      const px=i*r*0.27;
      ctx.beginPath();
      ctx.moveTo(px, -Math.sqrt(Math.max(0,r*r*0.85-px*px))*0.0+0);
      ctx.lineTo(px*0.97, bodyH*0.55+ (1-Math.abs(i)/3.4)*r*0.20);
      ctx.stroke();
    }
    ctx.restore();

    // ── Anel de energia rotativo no meio do corpo (brilho neon) ──
    ctx.save();
    ctx.globalAlpha=0.8*assembly;
    ctx.translate(0, bodyH*0.30);
    ctx.scale(1, 0.34);
    const ringPulse=0.65+0.35*Math.sin(this._ringPulse*2.2);
    ctx.strokeStyle=col;
    ctx.lineWidth=3.5;
    ctx.shadowColor=col; ctx.shadowBlur=18*ringPulse;
    ctx.beginPath(); ctx.arc(0,0, r*0.97, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.restore();

    // ── Topo octogonal (face superior, mais clara = recebe "luz") ──
    const topY=-bodyH*0.50;
    ctx.save();
    ctx.translate(0, topY);
    ctx.scale(1, 0.62);
    const topGrad=ctx.createRadialGradient(0,0,0,0,0,r*1.05);
    topGrad.addColorStop(0,'#16314f');
    topGrad.addColorStop(1,'#060f1c');
    ctx.fillStyle=topGrad;
    ctx.strokeStyle=col; ctx.globalAlpha=assembly; ctx.lineWidth=3;
    this._octagon(ctx, r*1.0);
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // ── Núcleo pulsante (esfera de energia no topo) ──
    const pulse=0.7+0.3*Math.sin(Date.now()*0.005);
    ctx.save();
    ctx.translate(0, topY);
    ctx.globalAlpha=assembly;
    const coreR=r*0.46;
    const g=ctx.createRadialGradient(0,0,0,0,0,coreR);
    g.addColorStop(0,'#ffffff'); g.addColorStop(0.35,col+'dd'); g.addColorStop(1,col+'00');
    ctx.globalAlpha=pulse*assembly;
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(0,0,coreR,0,Math.PI*2); ctx.fill();
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
    ctx.beginPath(); ctx.arc(0,0,11,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();

    // ── Antenas/detalhes laterais (profundidade extra) ──
    ctx.save();
    ctx.globalAlpha=0.85*assembly;
    ctx.strokeStyle=col; ctx.lineWidth=2.4; ctx.shadowColor=col; ctx.shadowBlur=8;
    for (const side of [-1,1]) {
      ctx.beginPath();
      ctx.moveTo(side*r*0.62, topY+r*0.18);
      ctx.lineTo(side*r*0.95, topY-r*0.55);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(side*r*0.95, topY-r*0.55, 3.6, 0, Math.PI*2); ctx.fill();
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

  _octagon(ctx, radius) {
    ctx.beginPath();
    for (let i=0;i<8;i++) {
      const a=i*Math.PI/4 - Math.PI/8;
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
      ctx.beginPath(); ctx.arc(px,py,p.size*(0.4+ease*0.6),0,Math.PI*2); ctx.fill();
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
      ctx.fillText(t<0.45 ? 'CONVERGINDO ENERGIA…' : 'MONTANDO TORRE…', 0, -r*2.1);
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
