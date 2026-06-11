// Efeitos visuais compartilhados: particulas, aneis, flashes e faiscas.
// A API e pequena de proposito para manter arena/combat/player desacoplados.
const DEFAULT_MAX_PARTICLES = 300;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export class EffectsManager {
  constructor({ maxParticles = DEFAULT_MAX_PARTICLES } = {}) {
    this.maxParticles = maxParticles;
    this.particles = [];
    this.rings = [];
    this.flashes = new Set();
  }

  _pushParticle(p) {
    this.particles.push(p);
    const overflow = this.particles.length - this.maxParticles;
    if (overflow > 0) this.particles.splice(0, overflow);
  }

  burst(x, y, opts = {}) {
    const color = opts.color || '#ffffff';
    const count = opts.count ?? 8;
    const speed = opts.speed ?? 130;
    const lifeBase = opts.life ?? 1;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * randRange(0.3, 1.2);
      const life = lifeBase * randRange(0.75, 1.2);
      this._pushParticle({
        kind:'dot',
        x, y,
        vx:Math.cos(a)*v,
        vy:Math.sin(a)*v,
        life,
        maxLife:life,
        decay:opts.decay ?? randRange(0.9, 1.6),
        r:opts.size ?? randRange(2, 5),
        color,
      });
    }
  }

  ring(x, y, opts = {}) {
    const duration = opts.duration ?? 0.38;
    this.rings.push({
      x, y,
      color:opts.color || '#ffffff',
      radius:opts.startRadius ?? 4,
      maxRadius:opts.maxRadius ?? 42,
      duration,
      life:duration,
      width:opts.width ?? 3,
    });
  }

  flash(entity, opts = {}) {
    if (!entity) return;
    entity._hitFlash = Math.max(entity._hitFlash || 0, opts.duration ?? 0.08);
    entity._hitFlashMax = Math.max(entity._hitFlashMax || 0, entity._hitFlash);
    entity._hitFlashColor = opts.color || '#ffffff';
    entity._hitFlashManaged = true;
    this.flashes.add(entity);
  }

  spark(x, y, angle, opts = {}) {
    const color = opts.color || '#ffffff';
    const count = opts.count ?? 5;
    const speed = opts.speed ?? 190;
    const spread = opts.spread ?? 0.75;
    for (let i = 0; i < count; i++) {
      const a = angle + randRange(-spread, spread) * 0.5;
      const v = speed * randRange(0.55, 1.25);
      const life = randRange(0.12, 0.26);
      this._pushParticle({
        kind:'spark',
        x, y,
        vx:Math.cos(a)*v,
        vy:Math.sin(a)*v,
        angle:a,
        life,
        maxLife:life,
        decay:1,
        r:randRange(1, 2.5),
        color,
      });
    }
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - 4 * dt);
      p.vy *= Math.max(0, 1 - 4 * dt);
      p.life -= (p.decay ?? 1) * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }

    for (const entity of this.flashes) {
      entity._hitFlash = Math.max(0, (entity._hitFlash || 0) - dt);
      if (entity._hitFlash <= 0) {
        entity._hitFlash = 0;
        entity._hitFlashMax = 0;
        entity._hitFlashManaged = false;
        this.flashes.delete(entity);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const r of this.rings) {
      const t = clamp01(r.life / r.duration);
      const radius = r.maxRadius * (1 - t) + r.radius * t;
      ctx.globalAlpha = t * 0.75;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(0.5, r.width * t);
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 10 * t;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const p of this.particles) {
      const t = clamp01(p.life / p.maxLife);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.kind === 'spark' ? 8 * t : 0;

      if (p.kind === 'spark') {
        const len = (p.r * 5 + 5) * t;
        ctx.lineWidth = Math.max(0.6, p.r * t);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(p.angle) * len, p.y - Math.sin(p.angle) * len);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
