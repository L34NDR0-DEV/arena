// Portais e Buracos Negros da arena
// Portal: par de entrada/saída; nave entra em um e é teleportada para o outro com cooldown.
// Buraco Negro: puxa naves próximas e causa dano por esmagamento.
import { ARENA_W, ARENA_H } from './arena.js';

const PORTAL_R       = 40;
const PORTAL_COOLDOWN= 6;    // segundos de recarga após uso
const PORTAL_PAIR_COUNT = 3; // pares de portais por arena

const BLACKHOLE_R    = 60;
const BLACKHOLE_PULL = 340;  // força de atração (px/s²)
const BLACKHOLE_DMG  = 28;   // dano/s ao centro
const BLACKHOLE_COUNT= 2;

// Cores de cada par de portais (entrada/saída mesma cor)
const PAIR_COLORS = ['#55aaff', '#ff55aa', '#55ffaa'];

// ── Portal ────────────────────────────────────────────────────────────────────
class Portal {
  constructor(x, y, color, pairId, role) {
    this.x = x; this.y = y;
    this.r = PORTAL_R;
    this.color = color;
    this.pairId = pairId;
    this.role = role;          // 'A' ou 'B'
    this.cooldown = 0;         // segundos restantes de recarga
    this._age = 0;
    this._particles = [];
  }

  get active() { return this.cooldown <= 0; }

  update(dt) {
    this._age += dt;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    // Partículas orbitais
    if (this.active && Math.random() < 0.4) {
      const a = Math.random() * Math.PI * 2;
      const dist = this.r * (0.5 + Math.random() * 0.6);
      this._particles.push({
        x: this.x + Math.cos(a)*dist,
        y: this.y + Math.sin(a)*dist,
        vx: -Math.sin(a)*(30+Math.random()*40),
        vy:  Math.cos(a)*(30+Math.random()*40),
        life: 0.4 + Math.random()*0.4,
        maxLife: 0,
        r: 2+Math.random()*2,
      });
      this._particles[this._particles.length-1].maxLife = this._particles[this._particles.length-1].life;
    }
    for (const p of this._particles) {
      p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
    }
    this._particles = this._particles.filter(p => p.life > 0);
  }

  tryEnter(entity) {
    if (!this.active) return false;
    const d = Math.hypot(entity.x - this.x, entity.y - this.y);
    return d < this.r * 0.72;
  }

  triggerCooldown() {
    this.cooldown = PORTAL_COOLDOWN;
  }

  draw(ctx) {
    const pulse = 0.85 + 0.15 * Math.sin(this._age * 4);
    const vr = this.r * pulse;
    const alpha = this.active ? 1 : 0.35;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Anel externo
    const grad = ctx.createRadialGradient(this.x, this.y, vr*0.3, this.x, this.y, vr);
    grad.addColorStop(0, this.color + 'cc');
    grad.addColorStop(0.6, this.color + '55');
    grad.addColorStop(1, this.color + '00');
    ctx.beginPath();
    ctx.arc(this.x, this.y, vr, 0, Math.PI*2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Borda brilhante
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(this.x, this.y, vr*0.75, 0, Math.PI*2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Espiral interior
    ctx.strokeStyle = this.color + 'aa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const angle = t * Math.PI * 6 + this._age * 3;
      const r2 = vr * 0.7 * t;
      const px2 = this.x + Math.cos(angle) * r2;
      const py2 = this.y + Math.sin(angle) * r2;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();

    // Rótulo A ou B
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.role, this.x, this.y - vr - 8);

    // Recarga em arco
    if (!this.active) {
      const pct = 1 - this.cooldown / PORTAL_COOLDOWN;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = this.color; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(this.x, this.y, vr + 6, -Math.PI/2, -Math.PI/2 + Math.PI*2*pct);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Partículas
    for (const p of this._particles) {
      ctx.globalAlpha = alpha * (p.life / p.maxLife) * 0.8;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (p.life/p.maxLife), 0, Math.PI*2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ── Buraco Negro ──────────────────────────────────────────────────────────────
class BlackHole {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.r = BLACKHOLE_R;
    this._age = 0;
    this._particles = [];
  }

  update(dt) {
    this._age += dt;
    // Partículas sendo sugadas
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      const dist = BLACKHOLE_R * (1.2 + Math.random() * 1.5);
      this._particles.push({
        x: this.x + Math.cos(a)*dist,
        y: this.y + Math.sin(a)*dist,
        life: 0.5 + Math.random()*0.4,
        maxLife: 0,
        color: ['#8844ff','#4422aa','#cc66ff','#ffffff22'][Math.floor(Math.random()*4)],
        r: 1.5 + Math.random()*2.5,
      });
      this._particles[this._particles.length-1].maxLife = this._particles[this._particles.length-1].life;
    }
    for (const p of this._particles) {
      const dx = this.x - p.x, dy = this.y - p.y;
      const d = Math.hypot(dx,dy) || 1;
      const spd = 80 + (1 - d/(BLACKHOLE_R*3)) * 160;
      p.x += (dx/d)*spd*dt; p.y += (dy/d)*spd*dt;
      p.life -= dt;
    }
    this._particles = this._particles.filter(p => p.life > 0 && Math.hypot(p.x-this.x,p.y-this.y) > 4);
  }

  // Aplica gravidade e dano a uma entidade; retorna dano causado (0 se fora de alcance)
  applyTo(entity, dt) {
    const dx = this.x - entity.x;
    const dy = this.y - entity.y;
    const d  = Math.hypot(dx, dy) || 1;
    const influence = BLACKHOLE_R * 4;
    if (d > influence) return 0;

    // Move posição diretamente (funciona tanto para player com vx/vy
    // quanto para inimigos cuja IA redefine vx/vy a cada frame)
    const force = BLACKHOLE_PULL * (1 - d/influence) * dt;
    entity.x += (dx/d) * force;
    entity.y += (dy/d) * force;
    // Também aplica à velocidade do player para sentir o "puxão" ao soltar tecla
    if ('vx' in entity && 'vy' in entity) {
      entity.vx += (dx/d) * force * 2;
      entity.vy += (dy/d) * force * 2;
    }

    // Dano ao centro
    if (d < this.r * 0.9) {
      return BLACKHOLE_DMG * dt;
    }
    return 0;
  }

  draw(ctx) {
    const pulse = 0.92 + 0.08 * Math.sin(this._age * 5);

    ctx.save();

    // Disco de acreção (anéis coloridos)
    for (let i = 3; i >= 0; i--) {
      const frac = i / 3;
      const ringR = this.r * (1.1 + frac * 1.4) * pulse;
      const colors = ['#8844ff','#aa33dd','#cc55ff','#ff88ff'];
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 4 - i * 0.6;
      ctx.globalAlpha = (1 - frac) * 0.6;
      ctx.shadowColor = '#8844ff'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(this.x, this.y, ringR, 0, Math.PI*2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Centro completamente preto
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.65 * pulse, 0, Math.PI*2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Halo roxo
    const grad = ctx.createRadialGradient(this.x, this.y, this.r*0.5, this.x, this.y, this.r*2.5);
    grad.addColorStop(0, '#8844ff44');
    grad.addColorStop(1, '#8844ff00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r*2.5, 0, Math.PI*2);
    ctx.fill();

    // Partículas sendo sugadas
    for (const p of this._particles) {
      ctx.globalAlpha = (p.life/p.maxLife) * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (p.life/p.maxLife), 0, Math.PI*2);
      ctx.fill();
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
    const margin = 300;
    const safe   = (x, y) => {
      if (!arena?.checkObstacleCollision) return true;
      return !arena.checkObstacleCollision(x, y, PORTAL_R + 30);
    };
    const rand   = (min, max) => min + Math.random()*(max-min);
    const tryPos = () => {
      let x, y, tries=0;
      do {
        x = rand(margin, ARENA_W - margin);
        y = rand(margin, ARENA_H - margin);
        tries++;
      } while (!safe(x, y) && tries < 20);
      return { x, y };
    };

    // Portais em pares (A→B)
    for (let i=0; i<PORTAL_PAIR_COUNT; i++) {
      const color = PAIR_COLORS[i % PAIR_COLORS.length];
      const posA = tryPos();
      let posB;
      // B deve estar distante de A (ao menos 1000px)
      let attempts = 0;
      do {
        posB = tryPos();
        attempts++;
      } while (Math.hypot(posB.x-posA.x, posB.y-posA.y) < 1000 && attempts < 15);

      this.portals.push(new Portal(posA.x, posA.y, color, i, 'A'));
      this.portals.push(new Portal(posB.x, posB.y, color, i, 'B'));
    }

    // Buracos negros
    for (let i=0; i<BLACKHOLE_COUNT; i++) {
      const pos = tryPos();
      this.blackHoles.push(new BlackHole(pos.x, pos.y));
    }
  }

  // Retorna o portal parceiro de um dado portal
  _partner(portal) {
    return this.portals.find(p => p.pairId === portal.pairId && p.role !== portal.role);
  }

  // Tenta teleportar entidade (player ou inimigo); retorna true se teleportou
  tryTeleport(entity) {
    for (const portal of this.portals) {
      if (!portal.tryEnter(entity)) continue;
      const dest = this._partner(portal);
      if (!dest || !dest.active) continue;

      // Teleporta
      entity.x = dest.x + (Math.random()-.5)*20;
      entity.y = dest.y + (Math.random()-.5)*20;
      // Cancela velocidade para evitar slide incontrolável após teleporte
      if ('vx' in entity) { entity.vx = 0; entity.vy = 0; }

      // Ambos os portais do par entram em recarga
      portal.triggerCooldown();
      dest.triggerCooldown();
      return true;
    }
    return false;
  }

  update(dt, entities=[]) {
    for (const p of this.portals)    p.update(dt);
    for (const b of this.blackHoles) b.update(dt);

    // Teleporte de entidades
    for (const e of entities) {
      if (e.dead) continue;
      this.tryTeleport(e);
    }
  }

  // Aplica gravidade dos buracos negros a uma entidade; retorna dano total
  applyBlackHoles(entity, dt) {
    let dmg = 0;
    for (const b of this.blackHoles) dmg += b.applyTo(entity, dt);
    return dmg;
  }

  draw(ctx) {
    for (const b of this.blackHoles) b.draw(ctx);
    for (const p of this.portals)    p.draw(ctx);
  }
}
