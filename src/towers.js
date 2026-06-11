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
const CENTRAL_RELAY_COUNT    = 3;
const CENTRAL_RELAY_R        = 34;
const CENTRAL_RELAY_CAPTURE_R= 128;
const CENTRAL_RELAY_RATE     = 0.36;
const CENTRAL_RELAY_DECAY    = 0.18;
const CENTRAL_MIN_DAMAGE     = 0.22;
const CENTRAL_RELAY_STEP     = 0.26;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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
    const w=120, h=9, bx=this.x-w/2, by=this.y-r*1.42-22;
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(bx-2,by-2,w+4,h+4);
    ctx.fillStyle='#1a1a1a'; ctx.fillRect(bx,by,w,h);
    const pct=this.hp/this.maxHp;
    const hpGrad=ctx.createLinearGradient(bx,0,bx+w,0);
    hpGrad.addColorStop(0,col+'88'); hpGrad.addColorStop(1,col);
    ctx.fillStyle=hpGrad; ctx.shadowColor=col; ctx.shadowBlur=8;
    ctx.fillRect(bx,by,w*pct,h);
    ctx.shadowBlur=0;
    ctx.strokeStyle=col+'66'; ctx.lineWidth=1; ctx.strokeRect(bx,by,w,h);
    ctx.restore();

    // Label com tier e capturas
    ctx.save();
    ctx.fillStyle=col; ctx.font='bold 13px system-ui'; ctx.textAlign='center';
    ctx.shadowColor=col; ctx.shadowBlur=6;
    ctx.fillText(this._tierLabel, this.x, by-10);
    if (this.captures>0) {
      ctx.font='10px system-ui'; ctx.shadowBlur=3;
      ctx.fillText('*'.repeat(Math.min(this.captures,3)), this.x, by-24);
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

  // Desenha a estrutura da torre — plataforma de guerra orbital:
  // base cilíndrica de blindagem, escudo de plasma hexagonal, canhão pesado,
  // braços de antena rotativos e núcleo de reactor pulsante.
  // `rise` (0-1) e `assembly` (0-1) controlam a animação de surgimento.
  _drawBody(ctx, col, r, rise, assembly) {
    const liftY = (1 - rise) * r * 1.5;
    const pulse  = 0.7 + 0.3 * Math.sin(this._ringPulse * 2.4);
    const rot    = this._ringPulse;

    ctx.save();
    ctx.translate(0, liftY);

    // ── Sombra no "chão" ──────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.40 * assembly;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.85 - liftY * 0.4, r * 1.1, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Braços de antena rotativos (4 braços, giram devagar) ──
    ctx.save();
    ctx.globalAlpha = 0.80 * assembly;
    ctx.rotate(rot * 0.35);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 2);
      // haste principal
      ctx.strokeStyle = col + 'aa'; ctx.lineWidth = 3;
      ctx.shadowColor = col; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.moveTo(r * 0.45, 0); ctx.lineTo(r * 1.28, 0); ctx.stroke();
      // prato da antena (semicírculo na ponta)
      ctx.translate(r * 1.28, 0);
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, 10, -Math.PI/2, Math.PI/2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
      // luz de sinalização pulsante na ponta
      ctx.globalAlpha = pulse * 0.9 * assembly;
      ctx.fillStyle = col; ctx.shadowBlur = 10 * pulse;
      ctx.beginPath(); ctx.arc(12, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── Base cilíndrica de blindagem (anel inferior) ──────────
    ctx.save();
    ctx.globalAlpha = assembly;
    const baseGrad = ctx.createLinearGradient(-r * 0.9, 0, r * 0.9, 0);
    baseGrad.addColorStop(0,   '#1a1f2a');
    baseGrad.addColorStop(0.45,'#2d3548');
    baseGrad.addColorStop(1,   '#1a1f2a');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.35, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col + '55'; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // ── Corpo central da plataforma (cilindro hexagonal) ──────
    ctx.save();
    ctx.globalAlpha = assembly;
    const bodyGrad = ctx.createLinearGradient(-r * 0.8, 0, r * 0.8, 0);
    bodyGrad.addColorStop(0,   '#10151e');
    bodyGrad.addColorStop(0.3, '#1e2a3a');
    bodyGrad.addColorStop(0.7, '#1e2a3a');
    bodyGrad.addColorStop(1,   '#10151e');
    ctx.fillStyle = bodyGrad;
    // seis faces de painel blindado
    this._hexagon(ctx, r * 0.82, 0);
    ctx.fill();
    ctx.strokeStyle = col + '66'; ctx.lineWidth = 2.5;
    ctx.stroke();
    // linhas de painel entre as faces (detalhes industriais)
    ctx.strokeStyle = col + '28'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
      ctx.stroke();
    }
    ctx.restore();

    // ── Escudo de plasma hexagonal (gira devagar, pulsa) ──────
    ctx.save();
    ctx.globalAlpha = (0.45 + 0.20 * pulse) * assembly;
    ctx.rotate(-rot * 0.28);
    ctx.shadowColor = col; ctx.shadowBlur = 18 * pulse;
    ctx.strokeStyle = col; ctx.lineWidth = 2.8;
    this._hexagon(ctx, r * 1.0, Math.PI / 6);
    ctx.stroke();
    ctx.globalAlpha = (0.20 + 0.10 * pulse) * assembly;
    ctx.lineWidth = 1.2;
    this._hexagon(ctx, r * 0.96, Math.PI / 6);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── Anel de plasma interior (gira no sentido contrário) ───
    ctx.save();
    ctx.globalAlpha = 0.50 * assembly;
    ctx.rotate(rot * 0.55);
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 1.2;
    this._hexagon(ctx, r * 0.65, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── Topo da plataforma (disco blindado superior) ──────────
    ctx.save();
    ctx.translate(0, -r * 0.28);
    ctx.globalAlpha = assembly;
    const topGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.82);
    topGrad.addColorStop(0, '#252e40');
    topGrad.addColorStop(0.6, '#15202e');
    topGrad.addColorStop(1, '#0a1018');
    ctx.fillStyle = topGrad;
    this._hexagon(ctx, r * 0.80, 0);
    ctx.fill();
    ctx.strokeStyle = col + '88'; ctx.lineWidth = 2;
    ctx.stroke();
    // detalhes de parafuso nos cantos (hexágonos pequenos)
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const bx = Math.cos(a) * r * 0.62, by = Math.sin(a) * r * 0.62;
      ctx.fillStyle = '#0a1018';
      ctx.strokeStyle = col + '55'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // ── Canhão pesado (apontado para o alvo) ─────────────────
    ctx.save();
    ctx.translate(0, -r * 0.28);
    ctx.rotate(this._turretAngle);
    // base do canhão (disco giratório)
    const baseDisc = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.38);
    baseDisc.addColorStop(0, '#2c3a50');
    baseDisc.addColorStop(1, '#131a24');
    ctx.fillStyle = baseDisc;
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col + '66'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2); ctx.stroke();
    // cano do canhão (duplo, separados verticalmente)
    const cG = ctx.createLinearGradient(0, -14, 0, 14);
    cG.addColorStop(0, '#3a4a60'); cG.addColorStop(0.5, '#5c7090'); cG.addColorStop(1, '#1a2030');
    ctx.fillStyle = cG; ctx.shadowBlur = 0;
    // cano superior
    ctx.fillRect(r * 0.28, -11, r * 0.72, 8);
    // cano inferior
    ctx.fillRect(r * 0.28, 3, r * 0.72, 8);
    // reforço de aço entre os canos
    ctx.fillStyle = col + '44';
    ctx.fillRect(r * 0.30, -3, r * 0.65, 6);
    // bocal de plasma na ponta do canhão
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12 * pulse;
    ctx.beginPath(); ctx.arc(r * 0.98, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── Núcleo de reactor (centro pulsante) ───────────────────
    ctx.save();
    ctx.translate(0, -r * 0.28);
    ctx.globalAlpha = assembly;
    const coreR = r * 0.22;
    // halo externo
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 2.2);
    halo.addColorStop(0, col + 'cc');
    halo.addColorStop(0.4, col + '44');
    halo.addColorStop(1, col + '00');
    ctx.globalAlpha = pulse * 0.85 * assembly;
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, coreR * 2.2, 0, Math.PI * 2); ctx.fill();
    // núcleo sólido
    ctx.globalAlpha = assembly;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = col; ctx.shadowBlur = 22 * pulse;
    ctx.beginPath(); ctx.arc(0, 0, coreR * 0.55, 0, Math.PI * 2); ctx.fill();
    // anel de reactor
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowBlur = 14 * pulse;
    ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // ── Hit flash ─────────────────────────────────────────────
    if (this._hitFlash > 0) {
      ctx.save();
      ctx.globalAlpha = (this._hitFlash / 0.15) * 0.60;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, -r * 0.28, r * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // liftY
  }

  // Hexágono regular; `rotation` gira o ponto inicial.
  _hexagon(ctx, radius, rotation=0) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 - Math.PI / 6 + rotation;
      const px = Math.cos(a) * radius, py = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // ── Animação de montagem/surgimento (estilo orbital drop) ────
  _drawEmerging(ctx) {
    const t   = this._emergeT;
    const col = this.color;
    const r   = this.r;

    ctx.save();
    ctx.translate(this.x, this.y);

    const platformPct = Math.min(1, t / 0.45);
    const rise        = Math.max(0, Math.min(1, (t - 0.30) / 0.55));
    const assembly    = Math.max(0, Math.min(1, (t - 0.45) / 0.55));

    // Grade de implantação no chão (círculos concêntricos de targeting)
    ctx.save();
    ctx.globalAlpha = platformPct * (1 - rise * 0.7);
    ctx.scale(1, 0.35);
    for (let i = 1; i <= 3; i++) {
      const ringR = r * (0.3 + platformPct * i * 0.42);
      ctx.strokeStyle = i === 1 ? col : col + (i === 2 ? '88' : '44');
      ctx.lineWidth = i === 1 ? 3 : 1.5;
      ctx.shadowColor = col; ctx.shadowBlur = i === 1 ? 20 : 8;
      ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke();
    }
    // cruz de mira
    ctx.strokeStyle = col + '66'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
    const cr = r * (0.3 + platformPct * 1.26);
    ctx.beginPath(); ctx.moveTo(-cr, 0); ctx.lineTo(cr, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -cr); ctx.lineTo(0, cr); ctx.stroke();
    ctx.restore();

    // Feixe de queda orbital (vem de cima)
    if (platformPct > 0.05 && rise < 0.90) {
      ctx.save();
      const beamA = (1 - rise) * platformPct * 0.55;
      const bGrad = ctx.createLinearGradient(0, -r * 2.8, 0, r * 0.5);
      bGrad.addColorStop(0, col + '00');
      bGrad.addColorStop(0.55, col + '66');
      bGrad.addColorStop(1, col + '00');
      ctx.globalAlpha = beamA;
      ctx.fillStyle = bGrad;
      ctx.fillRect(-r * 0.18, -r * 2.8, r * 0.36, r * 3.3);
      ctx.restore();
    }

    // Fragmentos de metal caindo em espiral (detritos da implantação)
    for (const p of this._emergeParticles) {
      const local = Math.max(0, Math.min(1, (t - p.delay) / (0.85 * p.speed)));
      if (local <= 0) continue;
      const ease = 1 - Math.pow(1 - local, 3);
      const ang  = p.a + (1 - ease) * 3.8;
      const dist = p.dist * (1 - ease);
      const px   = Math.cos(ang) * dist;
      const py   = Math.sin(ang) * dist * 0.38 - p.h * (1 - ease) - rise * r * 0.3;
      ctx.save();
      ctx.globalAlpha = ease * (1 - Math.max(0, (local - 0.82) / 0.18));
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6;
      // retângulo girado = fragmento metálico
      const ps = p.size * (0.5 + ease * 0.5);
      ctx.translate(px, py);
      ctx.rotate(ang * 2.5);
      ctx.fillRect(-ps, -ps * 0.4, ps * 2, ps * 0.8);
      ctx.restore();
    }

    // Estrutura desce do alto e se monta
    if (rise > 0 || assembly > 0) {
      ctx.save();
      ctx.globalAlpha = Math.max(rise, assembly);
      this._drawBody(ctx, col, r, Math.max(rise, 0.001), assembly);
      ctx.restore();
    }

    // Flash de impacto ao pousar
    if (t > 0.92) {
      const fp = (t - 0.92) / 0.08;
      ctx.save();
      ctx.globalAlpha = (1 - fp) * 0.65;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, r * 1.8 * (0.5 + fp * 0.6), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Texto de status
    if (t < 0.97) {
      ctx.save();
      ctx.fillStyle = col; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
      ctx.globalAlpha = 0.88;
      ctx.shadowColor = col; ctx.shadowBlur = 6;
      const txt = this._rebuilding
        ? (t < 0.45 ? 'RECARREGANDO DEFESAS…' : 'RECONSTITUINDO…')
        : (t < 0.45 ? 'IMPLANTANDO PLATAFORMA…' : 'ATIVANDO SISTEMAS…');
      ctx.fillText(txt, 0, -r * 2.2);
      ctx.shadowBlur = 0;
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
    this._relayStatus='CAPTURE RELES PARA QUEBRAR A BLINDAGEM';
    this._shieldDamageScale=CENTRAL_MIN_DAMAGE;
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

    const col = this.color;
    const r   = this.r * 1.22; // central é 22% maior visualmente

    ctx.save();
    ctx.translate(this.x, this.y);

    // Aura de alcance pulsante (mais visível na torre central)
    const pulse = 0.55 + 0.45 * Math.sin(this._ringPulse * 1.8);
    ctx.globalAlpha = 0.06 * pulse;
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.shadowColor = col; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, 0, this.r * (820/78), 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    // Segundo anel extra de presença (torre central tem 2 anéis de aura)
    ctx.globalAlpha = 0.035 * pulse;
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, this.r * (820/78) * 0.78, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    // Carcaca orbital segmentada exclusiva da torre central.
    ctx.save();
    ctx.rotate(this._ringPulse * 0.24);
    ctx.lineCap = 'round';
    for (let i=0;i<8;i++) {
      const a = i * Math.PI / 4;
      const segGrad = ctx.createLinearGradient(Math.cos(a)*r, Math.sin(a)*r, Math.cos(a+0.45)*r, Math.sin(a+0.45)*r);
      segGrad.addColorStop(0, '#17202c');
      segGrad.addColorStop(0.5, '#435068');
      segGrad.addColorStop(1, '#141b26');
      ctx.strokeStyle = segGrad;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, -r*0.06, r*1.34, a+0.06, a+0.54);
      ctx.stroke();
      ctx.strokeStyle = col + '88';
      ctx.lineWidth = 2;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10 * pulse;
      ctx.beginPath();
      ctx.arc(0, -r*0.06, r*1.18, a+0.16, a+0.44);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();

    // Tres estabilizadores apontados para fora, dando leitura de fortaleza.
    ctx.save();
    ctx.rotate(-this._ringPulse * 0.18);
    for (let i=0;i<3;i++) {
      ctx.save();
      ctx.rotate(i * Math.PI * 2 / 3);
      const finGrad = ctx.createLinearGradient(r*0.85, 0, r*1.65, 0);
      finGrad.addColorStop(0, '#101722');
      finGrad.addColorStop(0.5, '#2b3547');
      finGrad.addColorStop(1, '#070b12');
      ctx.fillStyle = finGrad;
      ctx.strokeStyle = col + '77';
      ctx.lineWidth = 2;
      ctx.shadowColor = col;
      ctx.shadowBlur = 8 * pulse;
      ctx.beginPath();
      ctx.moveTo(r*0.78, -10);
      ctx.lineTo(r*1.55, -20);
      ctx.lineTo(r*1.80, 0);
      ctx.lineTo(r*1.55, 20);
      ctx.lineTo(r*0.78, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    this._drawBody(ctx, col, r, 1, 1);

    // Cristal central por cima da base reaproveitada.
    ctx.save();
    ctx.translate(0, -r * 0.28);
    ctx.rotate(Math.PI / 4 + this._ringPulse * 0.08);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = col;
    ctx.shadowBlur = 20 + 12 * pulse;
    ctx.beginPath();
    ctx.moveTo(0, -r*0.22);
    ctx.lineTo(r*0.22, 0);
    ctx.lineTo(0, r*0.22);
    ctx.lineTo(-r*0.22, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // Barra de HP (mais larga para a torre central)
    const w = 180, h = 13, bx = this.x - w / 2, by = this.y - r * 1.45 - 32;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.60)'; ctx.fillRect(bx - 2, by - 2, w + 4, h + 4);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(bx, by, w, h);
    const pct = this.hp / this.maxHp;
    // muda de cor conforme HP: verde → amarelo → vermelho
    const hpColor = pct > 0.6 ? col : pct > 0.3 ? '#ffcc00' : '#ff3333';
    const hpGrad  = ctx.createLinearGradient(bx, 0, bx + w, 0);
    hpGrad.addColorStop(0, hpColor + '88'); hpGrad.addColorStop(1, hpColor);
    ctx.fillStyle = hpGrad; ctx.shadowColor = hpColor; ctx.shadowBlur = 12;
    ctx.fillRect(bx, by, w * pct, h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = hpColor + '55'; ctx.lineWidth = 1.5; ctx.strokeRect(bx, by, w, h);
    ctx.restore();

    // Label
    ctx.save();
    ctx.fillStyle = col; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center';
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fillText('NEXO ORBITAL - CONTROLE OS RELES', this.x, by - 13);
    ctx.font = '11px system-ui'; ctx.shadowBlur = 5;
    ctx.fillText(this._relayStatus, this.x, by - 1);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Flash de captura/impacto
    if (this._destroyedFlash > 0) {
      ctx.save();
      ctx.globalAlpha = (this._destroyedFlash / 0.6) * 0.55;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(this.x, this.y, r * 2.8, 0, Math.PI * 2); ctx.fill();
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
    this._time=0;
    const orbit = Math.max(220, Math.min(arenaW, arenaH) * 0.32);
    this.relays = Array.from({length:CENTRAL_RELAY_COUNT}, (_, i) => {
      const a = -Math.PI/2 + i * Math.PI * 2 / CENTRAL_RELAY_COUNT;
      return {
        x: arenaW/2 + Math.cos(a) * orbit,
        y: arenaH/2 + Math.sin(a) * orbit,
        a,
        owner:null,
        progress:0, // -1 azul, +1 vermelho
        pulse:Math.random()*Math.PI*2,
        contested:false,
        presence:0,
      };
    });
  }

  get winnerTeam() { return this._winnerTeam; }

  _relayCount(team) {
    return this.relays.filter(r=>r.owner===team).length;
  }

  _damageScale(team) {
    const owned = this._relayCount(team);
    return Math.min(1, CENTRAL_MIN_DAMAGE + owned * CENTRAL_RELAY_STEP);
  }

  _relayStatus() {
    const red = this._relayCount('red');
    const blue = this._relayCount('blue');
    return `RELES V:${red}/3 A:${blue}/3 | 3 RELES = DANO TOTAL`;
  }

  _updateRelays(dt, attackers=[]) {
    for (const r of this.relays) {
      let red=0, blue=0;
      for (const a of attackers) {
        if (!a || a.dead || !a.team) continue;
        const d=Math.hypot(a.x-r.x, a.y-r.y);
        if (d>CENTRAL_RELAY_CAPTURE_R) continue;
        if (a.team==='red') red++;
        else if (a.team==='blue') blue++;
      }

      const influence = red - blue;
      r.contested = red>0 && blue>0;
      r.presence = Math.min(1, red + blue);

      if (influence !== 0) {
        r.progress = clamp(r.progress + influence * CENTRAL_RELAY_RATE * dt, -1, 1);
      } else if (!r.owner) {
        const drift = CENTRAL_RELAY_DECAY * dt;
        if (Math.abs(r.progress) <= drift) r.progress = 0;
        else r.progress -= Math.sign(r.progress) * drift;
      }

      if (r.progress >= 0.98) {
        r.progress = 1;
        r.owner = 'red';
      } else if (r.progress <= -0.98) {
        r.progress = -1;
        r.owner = 'blue';
      } else if (Math.abs(r.progress) < 0.38) {
        r.owner = null;
      }
      r.pulse += dt;
    }
  }

  // `bullets` é o array compartilhado do CombatSystem — a torre central
  // dispara diretamente nele. `attackers` é a lista de naves vivas (jogador
  // local + remotos + bots) que servem de alvo para a defesa automática.
  update(dt, bullets=[], attackers=[]) {
    if (this._winnerTeam) return;
    this._time+=dt;
    this._updateRelays(dt, attackers);
    this.tower._relayStatus = this._relayStatus();
    this.tower._shieldDamageScale = Math.max(this._damageScale('red'), this._damageScale('blue'));
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

    const relayCount=this._relayCount(attackerTeam);
    const damageScale=this._damageScale(attackerTeam);
    const finalDamage=amount*damageScale;
    const destroyed=t.takeDamage(finalDamage);
    if (destroyed) {
      t.captureBy(attackerTeam);
      this._winnerTeam=attackerTeam;
      return { tower:t, destroyed:true, winnerTeam:attackerTeam, damageScale, relayCount };
    }
    return { tower:t, destroyed:false, damageScale, relayCount };
  }

  _drawRelayLinks(ctx) {
    for (const r of this.relays) {
      if (!r.owner) continue;
      const col = COLORS[r.owner];
      const pulse = 0.55 + 0.45 * Math.sin(this._time * 3 + r.a);
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -this._time * 34;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(this.tower.x, this.tower.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawRelay(ctx, r, idx) {
    const ownerCol = r.owner ? COLORS[r.owner] : COLORS.neutral;
    const signCol = r.progress >= 0 ? COLORS.red : COLORS.blue;
    const capture = Math.abs(r.progress);
    const pulse = 0.55 + 0.45 * Math.sin(r.pulse * 3);

    ctx.save();
    ctx.translate(r.x, r.y);

    if (r.presence || r.owner) {
      ctx.save();
      ctx.globalAlpha = r.contested ? 0.12 : 0.06 + 0.04 * pulse;
      ctx.strokeStyle = r.contested ? '#ffffff' : ownerCol;
      ctx.lineWidth = r.contested ? 2 : 1;
      ctx.setLineDash(r.contested ? [8, 8] : []);
      ctx.beginPath();
      ctx.arc(0, 0, CENTRAL_RELAY_CAPTURE_R, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    const shell = ctx.createRadialGradient(-12, -14, 8, 0, 0, CENTRAL_RELAY_R*1.3);
    shell.addColorStop(0, '#4a5468');
    shell.addColorStop(0.42, '#18202c');
    shell.addColorStop(1, '#070a10');
    ctx.fillStyle = shell;
    ctx.shadowColor = ownerCol;
    ctx.shadowBlur = 8 + 10 * pulse * (r.owner ? 1 : 0.35);
    ctx.beginPath();
    ctx.arc(0, 0, CENTRAL_RELAY_R, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let i=0;i<4;i++) {
      const a=i*Math.PI/2 + this._time*0.18;
      ctx.strokeStyle = '#596276';
      ctx.beginPath();
      ctx.arc(0, 0, CENTRAL_RELAY_R+3, a+0.18, a+0.72);
      ctx.stroke();
    }

    ctx.strokeStyle = signCol;
    ctx.lineWidth = 3;
    ctx.shadowColor = signCol;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    const start = -Math.PI/2;
    const end = start + Math.PI*2*capture*(r.progress < 0 ? -1 : 1);
    ctx.arc(0, 0, CENTRAL_RELAY_R+9, start, end, r.progress < 0);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.rotate(this._time*0.7 + idx);
    ctx.strokeStyle = ownerCol + 'aa';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i=0;i<6;i++) {
      const a=i*Math.PI/3 - Math.PI/6;
      const px=Math.cos(a)*CENTRAL_RELAY_R*0.56;
      const py=Math.sin(a)*CENTRAL_RELAY_R*0.56;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = r.owner ? ownerCol : '#d8e4ff';
    ctx.shadowColor = ownerCol;
    ctx.shadowBlur = 14 * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, 8 + pulse*2, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = ownerCol;
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`R${idx+1}`, 0, CENTRAL_RELAY_R + 13);
    ctx.restore();
  }

  draw(ctx) {
    this._drawRelayLinks(ctx);
    this.relays.forEach((r, idx)=>this._drawRelay(ctx, r, idx));
    this.tower.draw(ctx);
  }
}
