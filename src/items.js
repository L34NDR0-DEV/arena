import { ARENA_W, ARENA_H }                   from './arena.js';
import { ITEM_DEFS, randomType, itemLifespan } from './balance.js';

export { ITEM_DEFS };

// ── Ícone canvas por tipo ─────────────────────────────────────
function _drawItemIcon(ctx, type, s) {
  ctx.save();
  ctx.lineWidth = s * 0.18; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (type) {

    // ── Vida ──────────────────────────────────────────────────
    case 'HEALTH':
    case 'HEALTH_BIG': {
      const b = s*0.28, a = s*0.72;
      ctx.fillRect(-b,-a,b*2,a*2); ctx.fillRect(-a,-b,a*2,b*2);
      if (type === 'HEALTH_BIG') {
        ctx.globalAlpha *= 0.6;
        ctx.fillRect(-a*1.15,-b*0.5,a*2.3,b);
      }
      break;
    }

    // ── Escudo ────────────────────────────────────────────────
    case 'SHIELD':
    case 'SHIELD_BIG':
    case 'SHIELD_AURA': {
      ctx.beginPath();
      ctx.moveTo(0,-s); ctx.lineTo(s,-s*0.4); ctx.lineTo(s,s*0.1);
      ctx.quadraticCurveTo(s,s*0.8,0,s); ctx.quadraticCurveTo(-s,s*0.8,-s,s*0.1);
      ctx.lineTo(-s,-s*0.4); ctx.closePath(); ctx.fill();
      if (type === 'SHIELD_AURA') {
        ctx.globalAlpha *= 0.5; ctx.lineWidth = s*0.15;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath(); ctx.arc(0,0,s*1.1,0,Math.PI*2); ctx.stroke();
      }
      break;
    }

    // ── Mana ──────────────────────────────────────────────────
    case 'MANA':
    case 'MANA_FULL': {
      ctx.beginPath();
      ctx.moveTo(0,-s);
      ctx.bezierCurveTo(s*0.8,-s*0.2,s*0.8,s*0.5,0,s);
      ctx.bezierCurveTo(-s*0.8,s*0.5,-s*0.8,-s*0.2,0,-s);
      ctx.closePath(); ctx.fill();
      if (type === 'MANA_FULL') {
        ctx.fillStyle = '#ffffff44';
        ctx.beginPath(); ctx.arc(-s*0.15,-s*0.2,s*0.25,0,Math.PI*2); ctx.fill();
      }
      break;
    }

    // ── Tiro rápido ───────────────────────────────────────────
    case 'RAPID': {
      for (let i=-1;i<=1;i++) {
        const ox = i*s*0.28;
        ctx.beginPath();
        ctx.moveTo(ox-s*0.5,-s*0.5); ctx.lineTo(ox,0); ctx.lineTo(ox-s*0.5,s*0.5);
        ctx.strokeStyle = ctx.fillStyle; ctx.stroke();
      }
      break;
    }

    // ── Tiro triplo ───────────────────────────────────────────
    case 'MULTISHOT': {
      const angles = [-0.4, 0, 0.4];
      for (const a of angles) {
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0,s*0.5); ctx.lineTo(0,-s*0.8);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s*0.2; ctx.stroke();
        ctx.restore();
      }
      break;
    }

    // ── Perfurante ────────────────────────────────────────────
    case 'PIERCING': {
      ctx.beginPath();
      ctx.moveTo(-s*0.7, s*0.4); ctx.lineTo(s*0.7,-s*0.4);
      ctx.moveTo(-s*0.3, s*0.7); ctx.lineTo(s*0.3,-s*0.7);
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s*0.22; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.3,s); ctx.lineTo(-s*0.3,s); ctx.closePath(); ctx.fill();
      break;
    }

    // ── Ímã ───────────────────────────────────────────────────
    case 'MAGNET': {
      ctx.lineWidth = s*0.3; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(-s*0.85,s*0.2); ctx.lineTo(-s*0.85,-s*0.3);
      ctx.arc(0,-s*0.3,s*0.85,Math.PI,0,false);
      ctx.lineTo(s*0.85,s*0.2); ctx.stroke();
      break;
    }

    // ── Velocidade ────────────────────────────────────────────
    case 'BOOST': {
      ctx.beginPath();
      ctx.moveTo(0,-s); ctx.lineTo(s*0.6,s*0.4); ctx.lineTo(0,s*0.1); ctx.lineTo(-s*0.6,s*0.4);
      ctx.closePath(); ctx.fill();
      break;
    }

    // ── Dash bônus ────────────────────────────────────────────
    case 'DASH_BOOST': {
      ctx.beginPath();
      ctx.moveTo(0,-s); ctx.lineTo(s*0.5,s*0.3); ctx.lineTo(0,s*0.05); ctx.lineTo(-s*0.5,s*0.3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff55';
      ctx.beginPath();
      ctx.moveTo(s*0.55,-s*0.3); ctx.lineTo(s,s*0.5); ctx.lineTo(s*0.35,s*0.3);
      ctx.closePath(); ctx.fill();
      break;
    }

    // ── Bomba ─────────────────────────────────────────────────
    case 'BOMB': {
      ctx.beginPath(); ctx.arc(0,s*0.15,s*0.7,0,Math.PI*2); ctx.fill();
      ctx.lineWidth = s*0.22; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.moveTo(s*0.4,-s*0.35); ctx.quadraticCurveTo(s*0.6,-s*0.8,s*0.2,-s); ctx.stroke();
      break;
    }

    // ── Nuke ──────────────────────────────────────────────────
    case 'NUKE': {
      for (let i=0;i<8;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/4);
        ctx.beginPath(); ctx.moveTo(0,s*0.25); ctx.lineTo(0,s*0.9);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s*0.2; ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0,0,s*0.3,0,Math.PI*2); ctx.fill();
      break;
    }

    // ── Congelamento ──────────────────────────────────────────
    case 'FREEZE': {
      for (let i=0;i<6;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/3);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s*0.15;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-s); ctx.stroke();
        ctx.restore();
      }
      break;
    }

    // ── Regeneração HP ────────────────────────────────────────
    case 'REGEN': {
      ctx.beginPath();
      ctx.arc(0,0,s*0.6,0,Math.PI*1.5);
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s*0.22; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s*0.6,-s*0.1); ctx.lineTo(s*0.6,-s*0.5); ctx.lineTo(s*0.25,-s*0.3);
      ctx.fill();
      break;
    }

    // ── Overclock (dano) ──────────────────────────────────────
    case 'OVERCLOCK': {
      ctx.beginPath();
      ctx.moveTo(-s*0.2,-s); ctx.lineTo(s*0.5,0); ctx.lineTo(-s*0.1,0);
      ctx.lineTo(s*0.2,s); ctx.lineTo(-s*0.5,0); ctx.lineTo(s*0.1,0);
      ctx.closePath(); ctx.fill();
      break;
    }

    // ── Cloaking ──────────────────────────────────────────────
    case 'INVISIBLE': {
      ctx.globalAlpha *= 0.9;
      ctx.beginPath();
      ctx.moveTo(-s,-s*0.2); ctx.quadraticCurveTo(-s*0.5,-s,0,-s*0.6);
      ctx.quadraticCurveTo(s*0.5,-s,s,-s*0.2);
      ctx.quadraticCurveTo(s*0.5,s*0.4,0,s*0.7);
      ctx.quadraticCurveTo(-s*0.5,s*0.4,-s,-s*0.2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#00000055';
      ctx.beginPath(); ctx.arc(0,-s*0.08,s*0.18,0,Math.PI*2); ctx.fill();
      break;
    }

    // ── Míssil teleguiado ─────────────────────────────────────
    case 'MISSILE': {
      // Corpo do míssil (3 mísseis em leque)
      const angles3 = [-0.35, 0, 0.35];
      for (const a3 of angles3) {
        ctx.save(); ctx.rotate(a3);
        // corpo
        ctx.fillStyle = ctx.fillStyle;
        ctx.beginPath(); ctx.moveTo(0,-s*0.9); ctx.lineTo(s*0.18,-s*0.3); ctx.lineTo(s*0.1,s*0.5); ctx.lineTo(-s*0.1,s*0.5); ctx.lineTo(-s*0.18,-s*0.3); ctx.closePath(); ctx.fill();
        // aleta
        ctx.beginPath(); ctx.moveTo(s*0.1,s*0.2); ctx.lineTo(s*0.4,s*0.6); ctx.lineTo(s*0.1,s*0.5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s*0.1,s*0.2); ctx.lineTo(-s*0.4,s*0.6); ctx.lineTo(-s*0.1,s*0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      break;
    }

    // ── LENDÁRIOS ─────────────────────────────────────────────
    case 'GODMODE': {
      for (let i=0;i<8;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/4);
        ctx.fillStyle = ctx.fillStyle;
        ctx.beginPath(); ctx.moveTo(0,-s*0.3); ctx.lineTo(s*0.12,-s*0.7); ctx.lineTo(0,-s); ctx.lineTo(-s*0.12,-s*0.7); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0,0,s*0.3,0,Math.PI*2); ctx.fill();
      break;
    }

    case 'NOVA': {
      for (let i=0;i<6;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/3);
        ctx.beginPath(); ctx.moveTo(0,s*0.15); ctx.lineTo(s*0.18,s*0.5); ctx.lineTo(0,s); ctx.lineTo(-s*0.18,s*0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0,0,s*0.22,0,Math.PI*2); ctx.fill();
      break;
    }

    case 'VAMPIRO': {
      ctx.beginPath();
      ctx.moveTo(0,-s); ctx.bezierCurveTo(s*0.9,0,s*0.5,s,0,s*0.4);
      ctx.bezierCurveTo(-s*0.5,s,-s*0.9,0,0,-s);
      ctx.fill();
      ctx.fillStyle = '#ff006688';
      ctx.beginPath(); ctx.arc(s*0.15,-s*0.1,s*0.22,0,Math.PI*2); ctx.fill();
      break;
    }

    case 'WARP': {
      for (let i=3;i>0;i--) {
        ctx.globalAlpha = 0.3 + i*0.2;
        ctx.beginPath(); ctx.arc(-i*s*0.2,i*s*0.15,s*0.22,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0,0,s*0.3,0,Math.PI*2); ctx.fill();
      break;
    }

    // ── Malefícios ────────────────────────────────────────────
    case 'SLOW': {
      ctx.beginPath(); ctx.arc(0,0,s*0.7,0,Math.PI*2);
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s*0.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-s*0.5); ctx.lineTo(0,0); ctx.lineTo(s*0.35,s*0.35); ctx.stroke();
      break;
    }
    case 'DRAIN': {
      ctx.beginPath();
      ctx.moveTo(0,-s); ctx.lineTo(s*0.3,-s*0.2); ctx.lineTo(s*0.15,-s*0.2);
      ctx.lineTo(s*0.15,s); ctx.lineTo(-s*0.15,s); ctx.lineTo(-s*0.15,-s*0.2);
      ctx.lineTo(-s*0.3,-s*0.2); ctx.closePath(); ctx.fill();
      break;
    }
    case 'BLIND': {
      ctx.beginPath(); ctx.ellipse(0,0,s*0.9,s*0.5,0,0,Math.PI*2);
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s*0.18; ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,s*0.22,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = s*0.22;
      ctx.beginPath(); ctx.moveTo(-s*0.7,-s*0.7); ctx.lineTo(s*0.7,s*0.7); ctx.stroke();
      break;
    }
    case 'POISON': {
      ctx.beginPath(); ctx.arc(0,s*0.15,s*0.55,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = s*0.18;
      ctx.beginPath(); ctx.moveTo(-s*0.3,-s*0.3); ctx.quadraticCurveTo(0,-s,s*0.3,-s*0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s*0.3,-s*0.3); ctx.lineTo(-s*0.3,s*0.25); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s*0.3,-s*0.3); ctx.lineTo(s*0.3,s*0.25); ctx.stroke();
      break;
    }

    default: {
      ctx.beginPath(); ctx.arc(0,0,s*0.55,0,Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
}

// ── Item no mundo ─────────────────────────────────────────────
export class Item {
  constructor(x, y, typeKey) {
    this.x = x; this.y = y;
    this.type = typeKey || randomType();
    this.def  = ITEM_DEFS[this.type];
    this.r    = 14; this.visualR = 17;
    this.age  = 0;
    this.life = itemLifespan(this.type);
    this.pulseT = Math.random()*Math.PI*2;
    this.collected = false;
    const a = Math.random()*Math.PI*2, sp = 15+Math.random()*20;
    this.vx = Math.cos(a)*sp; this.vy = Math.sin(a)*sp;
    this.mvx = 0; this.mvy = 0;
    this.attracted = false;
  }

  update(dt, px, py, hasMagnet) {
    this.age += dt; this.pulseT += dt*2.5;
    this.vx *= (1-0.55*dt); this.vy *= (1-0.55*dt);
    this.x += this.vx*dt; this.y += this.vy*dt;
    if (this.x<22){this.x=22;this.vx=Math.abs(this.vx);}
    if (this.x>ARENA_W-22){this.x=ARENA_W-22;this.vx=-Math.abs(this.vx);}
    if (this.y<22){this.y=22;this.vy=Math.abs(this.vy);}
    if (this.y>ARENA_H-22){this.y=ARENA_H-22;this.vy=-Math.abs(this.vy);}
    if (hasMagnet && !this.def.harmful) {
      const dx=px-this.x, dy=py-this.y, d=Math.hypot(dx,dy)||1;
      if (d<300) {
        this.mvx+=(dx/d)*400*dt; this.mvy+=(dy/d)*400*dt;
        const ms=Math.hypot(this.mvx,this.mvy);
        if (ms>480){this.mvx=this.mvx/ms*480;this.mvy=this.mvy/ms*480;}
        this.x+=this.mvx*dt; this.y+=this.mvy*dt; this.attracted=true;
      }
    } else { this.mvx=0; this.mvy=0; this.attracted=false; }
  }

  overlaps(px, py, r=16) { return Math.hypot(this.x-px, this.y-py) < this.r+r; }
  get expired() { return this.age >= this.life; }

  draw(ctx) {
    const pulse = 1 + 0.13*Math.sin(this.pulseT);
    const vr    = this.visualR * pulse;
    const {color, glow, harmful, legendary, rarity} = this.def;
    const fade  = this.age > this.life-2 ? (this.life-this.age)/2 : 1;
    ctx.globalAlpha = fade;
    ctx.save();
    ctx.translate(this.x, this.y);

    // ── Item ejetado: rastro de velocidade + anel laranja ────
    if (this._ejected && this.age < 3) {
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 5) {
        const trailAlpha = Math.max(0, (3 - this.age) / 3) * 0.5;
        ctx.globalAlpha = fade * trailAlpha;
        const g = ctx.createRadialGradient(0,0,0,0,0,vr*3);
        g.addColorStop(0, color+'99'); g.addColorStop(1,'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0,0,vr*3,0,Math.PI*2); ctx.fill();
        ctx.globalAlpha = fade;
      }
      // Anel laranja de "ejetado"
      ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(0, 0, vr+10, 0, Math.PI*2); ctx.stroke();
      ctx.shadowBlur = 0;
      // Label "EJETADO" acima
      ctx.fillStyle = '#ff8800';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('EJETADO', 0, -vr - 20);
    }

    // Lendários: aura maior e pulsante especial
    if (legendary) {
      const legPulse = 1 + 0.25*Math.sin(this.pulseT*2.2);
      const lg = ctx.createRadialGradient(0,0,0,0,0,vr*4.5*legPulse);
      lg.addColorStop(0, color+'88'); lg.addColorStop(0.4, color+'33'); lg.addColorStop(1,'transparent');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(0,0,vr*4.5*legPulse,0,Math.PI*2); ctx.fill();
      // Raios giratórios lendários
      ctx.save(); ctx.rotate(this.age*1.2);
      ctx.strokeStyle = color+'66'; ctx.lineWidth = 1.5;
      for (let i=0;i<6;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/3);
        ctx.beginPath(); ctx.moveTo(vr+4,0); ctx.lineTo(vr+18,0); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // Halo externo
    const g = ctx.createRadialGradient(0,0,vr*.1,0,0,vr*2.8);
    g.addColorStop(0, glow); g.addColorStop(1,'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0,0,vr*2.8,0,Math.PI*2); ctx.fill();

    // Círculo base — cor diferente por raridade
    const bgColor = harmful ? '#1a0420' : (legendary ? '#18120a' : (rarity==='epic' ? '#0a0818' : '#08101e'));
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = color;
    ctx.lineWidth = legendary ? 3 : (rarity==='epic' ? 2.5 : 2);
    ctx.shadowColor = color;
    ctx.shadowBlur = legendary ? 20 : (harmful ? 14 : 8);
    ctx.beginPath(); ctx.arc(0,0,vr,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // Caveira em itens maléficos
    if (harmful) {
      ctx.fillStyle = color+'44';
      ctx.beginPath(); ctx.arc(0,-vr*0.18,vr*0.25,0,Math.PI*2); ctx.fill();
    }

    // Ícone
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = legendary ? 10 : 4;
    _drawItemIcon(ctx, this.type, vr*0.52);
    ctx.shadowBlur = 0;

    // Anel giratório decorativo
    ctx.save(); ctx.rotate(this.age * (harmful?-1.5:1.5));
    ctx.strokeStyle = color+(harmful?'55':(legendary?'88':'33'));
    ctx.lineWidth = legendary ? 2 : 1.2;
    ctx.setLineDash(legendary ? [4,3] : [3,6]);
    ctx.beginPath(); ctx.arc(0,0,vr+7,0,Math.PI*2); ctx.stroke();
    if (legendary) {
      ctx.save(); ctx.rotate(Math.PI/6);
      ctx.strokeStyle = color+'44'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(0,0,vr+12,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]); ctx.restore();

    // Anel de tempo restante
    const R2 = vr + 13;
    const pct = Math.max(0, 1 - this.age / this.life);
    ctx.save();
    ctx.rotate(-Math.PI/2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0,0,R2,0,Math.PI*2); ctx.stroke();
    const arcColor = legendary
      ? (pct > 0.5 ? color : '#ff8800')
      : (pct > 0.4 ? color : (pct > 0.18 ? '#ffcc00' : '#ff3355'));
    ctx.strokeStyle = arcColor; ctx.lineWidth = 2.5;
    ctx.shadowColor = arcColor; ctx.shadowBlur = (pct < 0.3 || legendary) ? 6 : 0;
    ctx.beginPath(); ctx.arc(0,0,R2,0,Math.PI*2*pct); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Nome do item abaixo
    ctx.fillStyle = color;
    ctx.font = legendary ? 'bold 10px monospace' : 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = color; ctx.shadowBlur = legendary ? 8 : 5;
    ctx.fillText(this.def.label, 0, vr + 17);
    ctx.shadowBlur = 0;

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ── Inventário do jogador (5 slots + 1 slot extra "X") ───────
export class Inventory {
  constructor() {
    this.slots     = [null, null, null, null, null];
    this.extraSlot = null;
    this.activeEffects = [];
  }

  add(type) {
    const idx = this.slots.indexOf(null);
    if (idx !== -1) {
      this.slots[idx] = { type, def: ITEM_DEFS[type] };
      return { stored: true, slot: idx, extra: false };
    }
    if (!this.extraSlot) {
      this.extraSlot = { type, def: ITEM_DEFS[type], bonus: true };
      return { stored: true, slot: 5, extra: true };
    }
    return false;
  }

  use(idx) {
    if (idx < 0 || idx > 5) return null;
    if (idx === 5) {
      const item = this.extraSlot;
      if (!item) return null;
      this.extraSlot = null;
      return { ...item, bonus: true };
    }
    const item = this.slots[idx];
    if (!item) return null;
    this.slots[idx] = null;
    return item;
  }

  trackEffect(type, duration) {
    this.activeEffects = this.activeEffects.filter(e => e.type !== type);
    this.activeEffects.push({ type, timer: duration, maxTimer: duration });
  }

  update(dt) {
    this.activeEffects = this.activeEffects.filter(e => { e.timer -= dt; return e.timer > 0; });
  }

  isFull()      { return this.slots.every(s => s !== null); }
  isExtraFull() { return this.extraSlot !== null; }
}

// ── Efeito visual de borda ao usar item ───────────────────────
export class BorderEffect {
  constructor() { this._effects = []; }

  trigger(color, duration=1.2) {
    this._effects.push({ color, t: duration, maxT: duration });
  }

  update(dt) {
    this._effects = this._effects.filter(e => { e.t -= dt; return e.t > 0; });
  }

  draw(ctx, W, H) {
    for (const e of this._effects) {
      const progress = e.t / e.maxT;
      const alpha    = Math.sin(progress * Math.PI) * 0.7;
      const thickness = 18 + 12*(1-progress);
      ctx.save();
      ctx.globalAlpha = alpha;
      const gL = ctx.createLinearGradient(0,0,W,0);
      gL.addColorStop(0, e.color); gL.addColorStop(0.5, e.color+'88'); gL.addColorStop(1, e.color);
      ctx.shadowColor = e.color; ctx.shadowBlur = 24;
      ctx.fillStyle = gL; ctx.fillRect(0,0,W,thickness);
      ctx.fillRect(0,H-thickness,W,thickness);
      const gV = ctx.createLinearGradient(0,0,0,H);
      gV.addColorStop(0,e.color); gV.addColorStop(0.5,e.color+'88'); gV.addColorStop(1,e.color);
      ctx.fillStyle = gV; ctx.fillRect(0,0,thickness,H);
      ctx.fillRect(W-thickness,0,thickness,H);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}

// ── Gerenciador de itens ──────────────────────────────────────
export class ItemManager {
  constructor() {
    this.items      = [];
    this.spawnTimer = 4;
    this.maxItems   = 22; // arena maior precisa de mais itens espalhados
  }

  spawnAt(x, y, count=1) {
    for (let i=0;i<count;i++) {
      if (this.items.length >= this.maxItems+5) return;
      const ox=(Math.random()-.5)*80, oy=(Math.random()-.5)*80;
      this.items.push(new Item(x+ox, y+oy));
    }
  }

  // Spawna item descartado pelo player com velocidade inicial e visual de ejeção
  spawnEjected(x, y, typeKey, vx, vy) {
    const it = new Item(x, y, typeKey);
    // Sobrescreve velocidade com a de ejeção
    it.vx = vx; it.vy = vy;
    // Item descartado tem vida um pouco mais longa (foi cuidado no inventário)
    it.life = it.life * 1.3;
    it._ejected = true; // marca visual especial
    this.items.push(it);
    return it;
  }

  update(dt, px, py, hasMagnet, hasExtraSlot=false) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.items.length < this.maxItems) {
      this.spawnTimer = 5 + Math.random()*4;
      const n = 1 + Math.floor(Math.random()*2);
      for (let i=0;i<n;i++) {
        const x = 100 + Math.random()*(ARENA_W-200);
        const y = 100 + Math.random()*(ARENA_H-200);
        this.items.push(new Item(x, y, randomType(hasExtraSlot)));
      }
    }
    this.items = this.items.filter(it => {
      if (it.collected || it.expired) return false;
      it.update(dt, px, py, hasMagnet);
      return true;
    });
  }

  collect(px, py, r=16) {
    const got = [];
    this.items = this.items.filter(it => {
      if (!it.collected && it.overlaps(px, py, r)) {
        it.collected = true; got.push(it); return false;
      }
      return true;
    });
    return got;
  }

  draw(ctx) { for (const it of this.items) it.draw(ctx); }
}
