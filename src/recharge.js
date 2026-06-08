import { ARENA_W, ARENA_H } from './arena.js';

const STATION_RADIUS    = 52;   // raio da plataforma (colisão + visual)
const CHARGE_DELAY      = 2.0;  // segundos parado sobre a estação para ativar
const COOLDOWN_AFTER    = 30;   // cooldown após uso (segundos)
const REGEN_HP          = 15;   // HP/s enquanto carrega
const BONUS_MANA        = 40;   // mana instantânea ao ativar
// Tower Defense: recarga 2x mais rápida
const CHARGE_DELAY_TD   = 1.0;

export class RechargeManager {
  constructor(mode) {
    this.mode = mode;
    this._delay = mode === 'tower_defense' ? CHARGE_DELAY_TD : CHARGE_DELAY;
    // 2 estações simétricas: quadrantes superior-esquerdo e inferior-direito
    const mx = ARENA_W / 2, my = ARENA_H / 2;
    const ox = ARENA_W * 0.28, oy = ARENA_H * 0.28;
    this.stations = [
      new RechargeStation(mx - ox, my - oy, this._delay),
      new RechargeStation(mx + ox, my + oy, this._delay),
    ];
  }

  update(dt, player, peers = {}, bots = []) {
    for (const st of this.stations) {
      st.update(dt, player, peers, bots);
    }
  }

  draw(ctx) {
    for (const st of this.stations) st.draw(ctx);
  }
}

class RechargeStation {
  constructor(x, y, chargeDelay) {
    this.x = x;
    this.y = y;
    this.r = STATION_RADIUS;
    this._chargeDelay = chargeDelay;
    this._cooldown   = 0;    // segundos restantes de cooldown
    this._chargeT    = 0;    // segundos que o player está sobre a estação
    this._active     = false; // player está sobre a estação agora
    this._age        = 0;
  }

  update(dt, player, peers, bots) {
    this._age += dt;
    if (this._cooldown > 0) {
      this._cooldown -= dt;
      if (this._cooldown < 0) this._cooldown = 0;
      this._chargeT = 0;
      return;
    }

    const onStation = !player.dead && !player.rebuilding &&
      Math.hypot(player.x - this.x, player.y - this.y) < this.r;

    if (onStation) {
      this._chargeT += dt;
      // Regen de HP contínua enquanto na estação (após delay inicial)
      if (this._chargeT >= this._chargeDelay) {
        player.heal(REGEN_HP * dt);
        this._active = true;
      }
      // Mana instantânea ao ativar (uma vez por uso)
      if (this._chargeT >= this._chargeDelay && !this._manaGiven) {
        player.addMana(BONUS_MANA);
        this._manaGiven = true;
        this._cooldown  = COOLDOWN_AFTER;
        this._chargeT   = 0;
      }
    } else {
      this._chargeT = 0;
      this._active  = false;
      this._manaGiven = false;
    }
  }

  draw(ctx) {
    const t = this._age;
    const coolPct = this._cooldown / COOLDOWN_AFTER; // 1=cheio cooldown, 0=pronto
    const ready    = this._cooldown <= 0;
    const charging = ready && this._chargeT > 0;
    const chargePct = Math.min(this._chargeT / this._chargeDelay, 1);

    ctx.save();
    ctx.translate(this.x, this.y);

    // ── Base hexagonal ──────────────────────────────────────────
    const col  = ready ? '#00d4ff' : '#3a5a6a';
    const glow = ready ? 18 : 4;
    ctx.shadowColor = col; ctx.shadowBlur = glow;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 - Math.PI / 6;
      const px = Math.cos(a) * this.r * 0.88;
      const py = Math.sin(a) * this.r * 0.88;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    const bg = ctx.createRadialGradient(0, 0, 0, 0, this.r * 0.88, this.r * 0.88);
    bg.addColorStop(0, ready ? '#051820' : '#0a0f14');
    bg.addColorStop(1, '#030810');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = col + (ready ? 'cc' : '44');
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Anel giratório externo ──────────────────────────────────
    if (ready) {
      const rot = t * (charging ? 2.2 : 0.6);
      ctx.save();
      ctx.rotate(rot);
      ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 3);
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        const px = Math.cos(a) * this.r * 1.06;
        const py = Math.sin(a) * this.r * 1.06;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ── Núcleo pulsante ─────────────────────────────────────────
    const pulse = 0.7 + 0.3 * Math.sin(t * (ready ? 4 : 1.5));
    const coreR = this.r * 0.3 * pulse;
    const coreCol = ready ? `rgba(0,212,255,${0.5 + 0.3 * pulse})` : 'rgba(40,80,100,0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fillStyle = coreCol;
    if (ready) { ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 14 * pulse; }
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Barra de carregamento (enquanto player está sobre ela) ──
    if (charging && chargePct < 1) {
      const bw = this.r * 1.6, bh = 6;
      const bx = -bw / 2, by = this.r + 10;
      ctx.fillStyle = '#0a1a24';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#00d4ff';
      ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 8;
      ctx.fillRect(bx, by, bw * chargePct, bh);
      ctx.shadowBlur = 0;
    }

    // ── Barra de cooldown (cinza) ───────────────────────────────
    if (this._cooldown > 0) {
      const bw = this.r * 1.6, bh = 5;
      const bx = -bw / 2, by = this.r + 10;
      ctx.fillStyle = '#0a1a24';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#3a5a6a';
      ctx.fillRect(bx, by, bw * (1 - coolPct), bh);
    }

    // ── Cruz central (ícone de recarga) ─────────────────────────
    const ic = this.r * 0.18;
    ctx.fillStyle = ready ? 'rgba(0,212,255,0.7)' : 'rgba(50,90,110,0.5)';
    ctx.fillRect(-ic * 0.4, -ic, ic * 0.8, ic * 2);
    ctx.fillRect(-ic, -ic * 0.4, ic * 2, ic * 0.8);

    ctx.restore();
  }
}
