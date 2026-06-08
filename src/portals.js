// Portais e Buracos Negros da arena
import { ARENA_W, ARENA_H } from './arena.js';

const PORTAL_R        = 72;          // maior e mais visível
const PORTAL_COOLDOWN = 6;
const PORTAL_PAIR_COUNT = 3;

const BLACKHOLE_R        = 55;       // núcleo visual
const BLACKHOLE_INFLUENCE= 480;      // raio de gravidade
const BLACKHOLE_PULL_MAX = 260;      // força máxima no núcleo (px/s)
const BLACKHOLE_PULL_MIN = 30;       // força mínima na borda da influência
const BLACKHOLE_CORE_DMG = 180;      // dano/s dentro do núcleo (mortal, mas escapável)
const BLACKHOLE_CAPTURE_TIME = 1.4;  // segundos no núcleo antes de destruição instantânea
const BLACKHOLE_COUNT    = 2;

const PAIR_COLORS = ['#00cfff', '#ff44cc', '#44ffaa'];

// ── Portal tecnológico ────────────────────────────────────────────────────────
class Portal {
  constructor(x, y, color, pairId, role) {
    this.x = x; this.y = y;
    this.r = PORTAL_R;
    this.color = color;
    this.pairId = pairId;
    this.role = role;
    this.cooldown = 0;
    this._age = 0;
    this._ringAngle = 0;
    this._outerRingAngle = 0;
    this._scanLine = 0;    // ângulo do scanner rotativo
    this._sparks = [];
    this._hexPulse = 0;
  }

  get active() { return this.cooldown <= 0; }

  update(dt) {
    this._age += dt;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    // Anéis giram em direções opostas com velocidades diferentes
    this._ringAngle      += dt * 1.8;
    this._outerRingAngle -= dt * 0.9;
    this._scanLine       += dt * 3.2;
    this._hexPulse        = Math.sin(this._age * 2.5) * 0.5 + 0.5;

    // Faíscas no anel externo
    if (this.active && Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      const dist = this.r * (0.88 + Math.random() * 0.18);
      this._sparks.push({
        x: this.x + Math.cos(a)*dist,
        y: this.y + Math.sin(a)*dist,
        vx: Math.cos(a)*(20+Math.random()*60),
        vy: Math.sin(a)*(20+Math.random()*60),
        life: 0.2 + Math.random()*0.3,
        maxLife: 0,
        r: 1.5 + Math.random()*2,
      });
      this._sparks[this._sparks.length-1].maxLife = this._sparks[this._sparks.length-1].life;
    }
    for (const s of this._sparks) {
      s.x += s.vx*dt; s.y += s.vy*dt;
      s.vx *= 0.88; s.vy *= 0.88;
      s.life -= dt;
    }
    this._sparks = this._sparks.filter(s => s.life > 0);
  }

  tryEnter(entity) {
    if (!this.active) return false;
    return Math.hypot(entity.x - this.x, entity.y - this.y) < this.r * 0.6;
  }

  triggerCooldown() { this.cooldown = PORTAL_COOLDOWN; }

  draw(ctx) {
    const alpha = this.active ? 1 : 0.3;
    const pulse = 0.92 + 0.08 * Math.sin(this._age * 3.5);
    const vr = this.r * pulse;
    const c = this.color;

    ctx.save();
    ctx.globalAlpha = alpha;

    // ── Halo de energia de fundo ─────────────────────────────
    const halo = ctx.createRadialGradient(this.x, this.y, vr*0.3, this.x, this.y, vr*1.4);
    halo.addColorStop(0, c + '40');
    halo.addColorStop(0.5, c + '18');
    halo.addColorStop(1, c + '00');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(this.x, this.y, vr*1.4, 0, Math.PI*2); ctx.fill();

    // ── Interior escuro (portal aberto) ─────────────────────
    const interior = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, vr*0.72);
    interior.addColorStop(0, '#000820');
    interior.addColorStop(0.7, '#001030');
    interior.addColorStop(1, c + '44');
    ctx.fillStyle = interior;
    ctx.beginPath(); ctx.arc(this.x, this.y, vr*0.72, 0, Math.PI*2); ctx.fill();

    // ── Grade hexagonal pulsante no interior ─────────────────
    ctx.save();
    ctx.clip(); // clipar ao círculo interior
    ctx.globalAlpha = alpha * (0.12 + this._hexPulse * 0.1);
    ctx.strokeStyle = c;
    ctx.lineWidth = 0.8;
    const hexSize = 18;
    for (let hx = -vr; hx < vr; hx += hexSize * 1.73) {
      for (let hy = -vr; hy < vr; hy += hexSize * 1.5) {
        const offX = (Math.floor(hy / (hexSize*1.5)) % 2) * hexSize * 0.865;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ha = (k / 6) * Math.PI * 2 - Math.PI/6;
          const hpx = this.x + hx + offX + Math.cos(ha)*hexSize*0.5;
          const hpy = this.y + hy + Math.sin(ha)*hexSize*0.5;
          if (k===0) ctx.moveTo(hpx, hpy); else ctx.lineTo(hpx, hpy);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
    ctx.restore();

    // ── Espiral de warp no interior ──────────────────────────
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = c + 'cc';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const angle = t * Math.PI * 8 + this._ringAngle;
      const r2 = vr * 0.68 * t;
      const px2 = this.x + Math.cos(angle) * r2;
      const py2 = this.y + Math.sin(angle) * r2;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();

    // ── Scanner (linha de varredura giratória) ───────────────
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = c; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(
      this.x + Math.cos(this._scanLine) * vr * 0.7,
      this.y + Math.sin(this._scanLine) * vr * 0.7
    );
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Anel interno giratório (segmentado) ──────────────────
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = c; ctx.shadowBlur = 14;
    const segments = 8;
    for (let i = 0; i < segments; i++) {
      const aStart = this._ringAngle + (i / segments) * Math.PI * 2;
      const aEnd   = aStart + (Math.PI * 2 / segments) * 0.65;
      ctx.beginPath();
      ctx.arc(this.x, this.y, vr * 0.76, aStart, aEnd);
      ctx.stroke();
    }

    // ── Anel externo giratório (contra-rotação, mais espaçado) ──
    ctx.strokeStyle = c + 'bb';
    ctx.lineWidth = 1.8;
    const outerSeg = 6;
    for (let i = 0; i < outerSeg; i++) {
      const aStart = this._outerRingAngle + (i / outerSeg) * Math.PI * 2;
      const aEnd   = aStart + (Math.PI * 2 / outerSeg) * 0.4;
      ctx.beginPath();
      ctx.arc(this.x, this.y, vr * 0.96, aStart, aEnd);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // ── Conectores radiais (spokes) ──────────────────────────
    ctx.globalAlpha = alpha * 0.3;
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    const spokes = 12;
    for (let i = 0; i < spokes; i++) {
      const a = this._ringAngle * 0.3 + (i / spokes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(a)*vr*0.4, this.y + Math.sin(a)*vr*0.4);
      ctx.lineTo(this.x + Math.cos(a)*vr*0.75, this.y + Math.sin(a)*vr*0.75);
      ctx.stroke();
    }

    // ── Nó central pulsante ──────────────────────────────────
    ctx.globalAlpha = alpha;
    const coreR = 7 + 3 * Math.sin(this._age * 6);
    const coreGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, coreR*1.5);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.4, c);
    coreGrad.addColorStop(1, c + '00');
    ctx.fillStyle = coreGrad;
    ctx.beginPath(); ctx.arc(this.x, this.y, coreR*1.5, 0, Math.PI*2); ctx.fill();

    // ── Rótulo ──────────────────────────────────────────────
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = c; ctx.shadowBlur = 8;
    ctx.fillText(`PORTAL ${this.role}`, this.x, this.y - vr - 10);
    ctx.shadowBlur = 0;

    // ── Barra de recarga ────────────────────────────────────
    if (!this.active) {
      const pct = 1 - this.cooldown / PORTAL_COOLDOWN;
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      ctx.shadowColor = c; ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(this.x, this.y, vr + 8, -Math.PI/2, -Math.PI/2 + Math.PI*2*pct);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = c + 'cc';
      ctx.font = '7px monospace';
      ctx.fillText(`${this.cooldown.toFixed(1)}s`, this.x, this.y + vr + 18);
    }

    // ── Faíscas ──────────────────────────────────────────────
    for (const s of this._sparks) {
      ctx.globalAlpha = alpha * (s.life / s.maxLife) * 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = c; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r*(s.life/s.maxLife), 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── Buraco Negro ──────────────────────────────────────────────────────────────
// Mecânica: puxa naves para o centro com força crescente.
// Fora da zona de influência: sem efeito.
// Na zona de influência: puxão escalado — fraco na borda, forte no meio.
// O player pode escapar empurrando na direção oposta.
// No núcleo (<= BLACKHOLE_R * 0.55): dano pesado; se ficar >1.4s → destruição.
// Não destrói instantaneamente — há sempre uma janela de escape.
class BlackHole {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = BLACKHOLE_R;
    this._age = 0;
    this._particles = [];   // detritos sugados
    this._warnRings = [];   // anéis de aviso pulsantes
    this._captureTimers = new WeakMap(); // entidade → segundos no núcleo
  }

  update(dt) {
    this._age += dt;

    // Detritos sugados em espiral
    if (Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2;
      const dist = BLACKHOLE_INFLUENCE * (0.4 + Math.random() * 0.6);
      this._particles.push({
        x: this.x + Math.cos(a)*dist,
        y: this.y + Math.sin(a)*dist,
        angle: a,
        orbitR: dist,
        orbitSpeed: (0.8 + Math.random()*1.2) * (dist < BLACKHOLE_INFLUENCE*0.5 ? 2 : 1),
        inSpeed: 40 + Math.random()*80,
        life: 0.6 + Math.random()*0.8,
        maxLife: 0,
        color: ['#8844ff','#5522cc','#cc44ff','#ff88ff','#aaaaff','#ffffff33'][Math.floor(Math.random()*6)],
        r: 1 + Math.random()*3,
      });
      this._particles[this._particles.length-1].maxLife = this._particles[this._particles.length-1].life;
    }
    for (const p of this._particles) {
      p.orbitR   -= p.inSpeed * dt;
      p.angle    += p.orbitSpeed * dt;
      p.x = this.x + Math.cos(p.angle) * p.orbitR;
      p.y = this.y + Math.sin(p.angle) * p.orbitR;
      p.life -= dt;
    }
    this._particles = this._particles.filter(p => p.life > 0 && p.orbitR > 3);

    // Anéis de choque de aviso
    if (Math.random() < 0.06) {
      this._warnRings.push({ r: this.r * 1.2, maxR: BLACKHOLE_INFLUENCE * 0.6, life: 1, maxLife: 1 });
    }
    for (const w of this._warnRings) {
      w.r += (w.maxR - w.r) * dt * 2;
      w.life -= dt;
    }
    this._warnRings = this._warnRings.filter(w => w.life > 0);
  }

  // Aplica gravidade; retorna { dmg, inCore, destroyed }
  // `entity` deve ter .x, .y; player tem .vx/.vy
  applyTo(entity, dt) {
    const dx = this.x - entity.x;
    const dy = this.y - entity.y;
    const d  = Math.hypot(dx, dy) || 0.01;
    if (d > BLACKHOLE_INFLUENCE) {
      // Fora do alcance — zera o timer de captura se existir
      this._captureTimers.delete(entity);
      return { dmg: 0, inCore: false, destroyed: false };
    }

    // Força de puxão: linear de PULL_MIN (na borda) até PULL_MAX (no núcleo)
    // — o player ainda consegue resistir com velocidade de 220px/s vs puxão de até 260px/s
    // quando está próximo, então tem que se mover ativamente para sair
    const frac  = 1 - d / BLACKHOLE_INFLUENCE;          // 0 na borda → 1 no núcleo
    const force = (BLACKHOLE_PULL_MIN + frac * (BLACKHOLE_PULL_MAX - BLACKHOLE_PULL_MIN)) * dt;

    entity.x += (dx/d) * force;
    entity.y += (dy/d) * force;
    if ('vx' in entity) {
      entity.vx += (dx/d) * force * 1.5;
      entity.vy += (dy/d) * force * 1.5;
    }

    const coreR = this.r * 0.55;
    const inCore = d < coreR;
    let dmg = 0, destroyed = false;

    if (inCore) {
      dmg = BLACKHOLE_CORE_DMG * dt;
      const prev = this._captureTimers.get(entity) || 0;
      const next = prev + dt;
      this._captureTimers.set(entity, next);
      if (next >= BLACKHOLE_CAPTURE_TIME) {
        destroyed = true;
        this._captureTimers.delete(entity);
      }
    } else {
      this._captureTimers.delete(entity);
    }

    return { dmg, inCore, destroyed };
  }

  draw(ctx) {
    const pulse = 0.95 + 0.05 * Math.sin(this._age * 7);
    ctx.save();

    // ── Halo de distorção gravitacional ─────────────────────
    const distGrad = ctx.createRadialGradient(this.x, this.y, this.r*0.5, this.x, this.y, BLACKHOLE_INFLUENCE);
    distGrad.addColorStop(0,   '#8844ff22');
    distGrad.addColorStop(0.4, '#4422aa18');
    distGrad.addColorStop(1,   '#00000000');
    ctx.fillStyle = distGrad;
    ctx.beginPath(); ctx.arc(this.x, this.y, BLACKHOLE_INFLUENCE, 0, Math.PI*2); ctx.fill();

    // ── Anéis de aviso (choque pulsante) ────────────────────
    for (const w of this._warnRings) {
      ctx.globalAlpha = (w.life / w.maxLife) * 0.35;
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(this.x, this.y, w.r, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── Indicador de zona de captura (círculo pontilhado vermelho) ──
    ctx.globalAlpha = 0.5 + 0.3*Math.sin(this._age*6);
    ctx.strokeStyle = '#ff2222';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.55, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur = 0;

    // ── Texto de aviso acima ─────────────────────────────────
    ctx.globalAlpha = 0.7 + 0.3*Math.sin(this._age*4);
    ctx.fillStyle   = '#ff4444';
    ctx.font        = 'bold 9px monospace';
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 8;
    ctx.fillText('BURACO NEGRO', this.x, this.y - this.r*1.9 - 6);
    ctx.fillText('ESCAPE!', this.x, this.y - this.r*1.9 + 10);
    ctx.shadowBlur  = 0;

    // ── Disco de acreção com espiral de distorção ────────────
    const rings = [
      { frac: 2.4, color: '#5522aa', alpha: 0.25, lw: 14 },
      { frac: 1.9, color: '#7733cc', alpha: 0.4,  lw: 10 },
      { frac: 1.5, color: '#9944ee', alpha: 0.5,  lw: 7  },
      { frac: 1.25,color: '#cc55ff', alpha: 0.6,  lw: 5  },
      { frac: 1.05,color: '#ff88ff', alpha: 0.7,  lw: 3  },
    ];
    for (const ring of rings) {
      ctx.globalAlpha = ring.alpha;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth   = ring.lw * pulse;
      ctx.shadowColor = '#8844ff'; ctx.shadowBlur = ring.lw * 2;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * ring.frac * pulse, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── Linhas de distorção giratórias ───────────────────────
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#cc88ff';
    ctx.lineWidth   = 1;
    const distLines = 16;
    for (let i = 0; i < distLines; i++) {
      const a  = (i / distLines) * Math.PI * 2 + this._age * 0.6;
      const r1 = this.r * 1.1;
      const r2 = this.r * 2.3;
      // Curva ligeiramente arqueada em direção ao centro
      const cp = this.r * 1.7;
      const cpa = a + 0.25;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(a)*r1,  this.y + Math.sin(a)*r1);
      ctx.quadraticCurveTo(
        this.x + Math.cos(cpa)*cp, this.y + Math.sin(cpa)*cp,
        this.x + Math.cos(a+0.5)*r2, this.y + Math.sin(a+0.5)*r2
      );
      ctx.stroke();
    }

    // ── Núcleo — buraco absolutamente preto ──────────────────
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.7 * pulse, 0, Math.PI*2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Brilho roxo intenso no limiar do horizonte de eventos
    ctx.strokeStyle = '#cc44ff';
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = '#aa00ff'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.7 * pulse, 0, Math.PI*2); ctx.stroke();
    ctx.shadowBlur  = 0;

    // ── Detritos em espiral ──────────────────────────────────
    for (const p of this._particles) {
      ctx.globalAlpha = (p.life/p.maxLife) * 0.8;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = '#8844ff'; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.life/p.maxLife), 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur  = 0;
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── PortalManager ─────────────────────────────────────────────────────────────
export class PortalManager {
  constructor(arena) {
    this.portals    = [];
    this.blackHoles = [];
    this._build(arena);
  }

  _build(arena) {
    const margin = 400;
    const safe = (x, y, r) => {
      if (!arena?.checkObstacleCollision) return true;
      return !arena.checkObstacleCollision(x, y, r + 40);
    };
    const rand   = (min, max) => min + Math.random()*(max-min);
    const tryPos = (r) => {
      let x, y, tries = 0;
      do {
        x = rand(margin, ARENA_W - margin);
        y = rand(margin, ARENA_H - margin);
        tries++;
      } while (!safe(x, y, r) && tries < 25);
      return { x, y };
    };

    // Portais em pares (A→B) com distância mínima entre si
    const placed = []; // todos os pontos já colocados para evitar sobreposição
    const minDist = (x, y, minD) => placed.every(p => Math.hypot(p.x-x, p.y-y) >= minD);

    for (let i = 0; i < PORTAL_PAIR_COUNT; i++) {
      const color = PAIR_COLORS[i % PAIR_COLORS.length];
      let posA, posB, att = 0;

      do { posA = tryPos(PORTAL_R); att++; }
      while (!minDist(posA.x, posA.y, PORTAL_R*3) && att < 20);
      placed.push(posA);

      att = 0;
      do {
        posB = tryPos(PORTAL_R); att++;
      } while ((Math.hypot(posB.x-posA.x, posB.y-posA.y) < 1200 || !minDist(posB.x, posB.y, PORTAL_R*3)) && att < 25);
      placed.push(posB);

      this.portals.push(new Portal(posA.x, posA.y, color, i, 'A'));
      this.portals.push(new Portal(posB.x, posB.y, color, i, 'B'));
    }

    // Buracos negros — longe dos portais e entre si
    for (let i = 0; i < BLACKHOLE_COUNT; i++) {
      let pos, att = 0;
      do { pos = tryPos(BLACKHOLE_R*2); att++; }
      while (!minDist(pos.x, pos.y, BLACKHOLE_INFLUENCE * 0.7) && att < 20);
      placed.push(pos);
      this.blackHoles.push(new BlackHole(pos.x, pos.y));
    }
  }

  _partner(portal) {
    return this.portals.find(p => p.pairId === portal.pairId && p.role !== portal.role);
  }

  tryTeleport(entity) {
    for (const portal of this.portals) {
      if (!portal.tryEnter(entity)) continue;
      const dest = this._partner(portal);
      if (!dest || !dest.active) continue;
      entity.x = dest.x + (Math.random()-.5)*16;
      entity.y = dest.y + (Math.random()-.5)*16;
      if ('vx' in entity) { entity.vx *= 0.3; entity.vy *= 0.3; }
      portal.triggerCooldown();
      dest.triggerCooldown();
      return true;
    }
    return false;
  }

  update(dt, entities=[]) {
    for (const p of this.portals)    p.update(dt);
    for (const b of this.blackHoles) b.update(dt);
    for (const e of entities) {
      if (e.dead) continue;
      this.tryTeleport(e);
    }
  }

  // Retorna { dmg, destroyed } agregado de todos os buracos negros para uma entidade
  applyBlackHoles(entity, dt) {
    let dmg = 0, destroyed = false;
    for (const b of this.blackHoles) {
      const res = b.applyTo(entity, dt);
      dmg += res.dmg;
      if (res.destroyed) destroyed = true;
    }
    return { dmg, destroyed };
  }

  draw(ctx) {
    for (const b of this.blackHoles) b.draw(ctx);
    for (const p of this.portals)    p.draw(ctx);
  }
}
