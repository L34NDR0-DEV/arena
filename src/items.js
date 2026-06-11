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

    // ── Mina de proximidade ───────────────────────────────────
    case 'MINE': {
      ctx.beginPath(); ctx.arc(0,s*0.1,s*0.55,0,Math.PI*2); ctx.fill();
      ctx.lineWidth = s*0.16; ctx.strokeStyle = ctx.fillStyle;
      for (let i=0;i<6;i++) {
        const a = i*Math.PI/3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*s*0.55, s*0.1+Math.sin(a)*s*0.55);
        ctx.lineTo(Math.cos(a)*s*0.95, s*0.1+Math.sin(a)*s*0.95);
        ctx.stroke();
      }
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

    // ── OFENSIVOS ─────────────────────────────────────────────
    case 'STUN': {
      // Raio elétrico (zigzag) — símbolo de atordoamento
      ctx.lineWidth=s*0.15; ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(s*0.25,-s); ctx.lineTo(-s*0.1,-s*0.1);
      ctx.lineTo(s*0.2,-s*0.1); ctx.lineTo(-s*0.25,s);
      ctx.stroke();
      break;
    }
    case 'DEEP_FREEZE': {
      // Floco de neve simplificado (6 linhas radiais com branchinhas)
      ctx.lineWidth=s*0.12; ctx.strokeStyle=ctx.fillStyle;
      for (let i=0;i<6;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/3);
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s*0.25,-s*0.55); ctx.lineTo(0,-s*0.35); ctx.lineTo(s*0.25,-s*0.55); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'CONFUSE': {
      // Espiral / olho torto — símbolo de confusão
      ctx.lineWidth=s*0.15; ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(0,0,s*0.65,0,Math.PI*1.5);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0,-s*0.1,s*0.25,0,Math.PI*2); ctx.stroke();
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

    // ── Itens de tiro arcade ──────────────────────────────────
    case 'LASER': {
      ctx.lineWidth=s*0.12; ctx.strokeStyle=ctx.fillStyle;
      ctx.shadowBlur=8; ctx.shadowColor=ctx.fillStyle;
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(0,s); ctx.stroke();
      ctx.lineWidth=s*0.05;
      ctx.beginPath(); ctx.moveTo(-s*0.2,-s); ctx.lineTo(-s*0.2,s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s*0.2,-s); ctx.lineTo(s*0.2,s); ctx.stroke();
      break;
    }
    case 'SHOTGUN': {
      const sang=[-0.5,-0.25,0,0.25,0.5];
      ctx.lineWidth=s*0.14; ctx.strokeStyle=ctx.fillStyle; ctx.lineCap='round';
      for (const a of sang) {
        ctx.beginPath(); ctx.moveTo(0,s*0.2);
        ctx.lineTo(Math.sin(a)*s*0.9,-Math.cos(a)*s*0.9); ctx.stroke();
      }
      ctx.fillStyle=ctx.strokeStyle;
      ctx.beginPath(); ctx.rect(-s*0.3,s*0.1,s*0.6,s*0.4); ctx.fill();
      break;
    }
    case 'SNIPER': {
      ctx.lineWidth=s*0.12; ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0,0,s*0.6,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(0,s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s,0); ctx.lineTo(s,0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,s*0.15,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'BOUNCER': {
      ctx.beginPath(); ctx.arc(0,0,s*0.4,0,Math.PI*2); ctx.fill();
      ctx.lineWidth=s*0.12; ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath(); ctx.moveTo(-s,-s*0.5); ctx.lineTo(-s*0.5,-s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s*0.5,-s); ctx.lineTo(-s*0.3,-s*0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s,-s*0.5); ctx.lineTo(s*0.5,-s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s*0.5,-s); ctx.lineTo(s*0.3,-s*0.7); ctx.stroke();
      break;
    }
    case 'FLAMETHROWER': {
      for (let i=0;i<5;i++) {
        const a=-0.5+i*0.25;
        ctx.globalAlpha*=0.75+i*0.05;
        ctx.beginPath(); ctx.moveTo(0,s*0.3);
        ctx.bezierCurveTo(Math.sin(a)*s*0.4,-s*0.2,Math.sin(a)*s*0.8,-s*0.6,Math.sin(a)*s,-s);
        ctx.lineWidth=s*(0.18-i*0.02); ctx.strokeStyle=ctx.fillStyle; ctx.stroke();
      }
      break;
    }
    case 'PLASMA': {
      ctx.beginPath(); ctx.arc(0,0,s*0.55,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha*=0.5;
      ctx.beginPath(); ctx.arc(0,0,s*0.8,0,Math.PI*2);
      ctx.lineWidth=s*0.1; ctx.strokeStyle=ctx.fillStyle; ctx.stroke();
      ctx.globalAlpha=1;
      ctx.fillStyle='#ffffff66'; ctx.beginPath(); ctx.arc(-s*0.18,-s*0.18,s*0.16,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'RAILGUN': {
      ctx.lineWidth=s*0.22; ctx.strokeStyle=ctx.fillStyle; ctx.lineCap='butt';
      ctx.beginPath(); ctx.moveTo(-s*0.3,-s); ctx.lineTo(-s*0.3,s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s*0.3,-s); ctx.lineTo(s*0.3,s); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0,0,s*0.15,s*0.4,0,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'HOMING': {
      ctx.lineWidth=s*0.13; ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath(); ctx.arc(s*0.3,0,s*0.5,-Math.PI*0.9,Math.PI*0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,-s*0.55); ctx.lineTo(s*0.2,-s*0.85); ctx.lineTo(s*0.4,-s*0.55); ctx.stroke();
      break;
    }
    case 'BURST': {
      for (let i=0;i<3;i++) {
        const off=(i-1)*s*0.28;
        ctx.beginPath(); ctx.moveTo(off,-s*0.8); ctx.lineTo(off+s*0.1,-s*0.1); ctx.lineTo(off-s*0.1,-s*0.1); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'BOOMERANG': {
      ctx.lineWidth=s*0.2; ctx.strokeStyle=ctx.fillStyle; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-s,-s*0.3); ctx.quadraticCurveTo(0,-s*0.8,s,-s*0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s,-s*0.3); ctx.quadraticCurveTo(s*0.2,s*0.5,-s*0.3,s*0.7); ctx.stroke();
      break;
    }
    case 'GRAVITY': {
      ctx.lineWidth=s*0.1; ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath(); ctx.arc(0,0,s*0.3,0,Math.PI*2); ctx.fill();
      for (let i=0;i<4;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/2);
        ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(0,-s*0.4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s*0.15,-s*0.55); ctx.lineTo(0,-s*0.4); ctx.lineTo(s*0.15,-s*0.55); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'EXPLOSIVE': {
      ctx.beginPath(); ctx.arc(0,s*0.1,s*0.55,0,Math.PI*2); ctx.fill();
      ctx.lineWidth=s*0.15; ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath(); ctx.moveTo(0,-s*0.45); ctx.quadraticCurveTo(s*0.4,-s*0.9,s*0.2,-s); ctx.stroke();
      ctx.fillStyle='#ffffff88';
      ctx.beginPath(); ctx.arc(-s*0.18,-s*0.05,s*0.14,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'CHAIN': {
      ctx.lineWidth=s*0.14; ctx.strokeStyle=ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(0,-s); ctx.lineTo(s*0.3,-s*0.4);
      ctx.lineTo(-s*0.3,-s*0.1); ctx.lineTo(s*0.3,s*0.3);
      ctx.lineTo(-s*0.1,s*0.8); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s*0.1,s*0.8,s*0.1,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'STORM': {
      for (let i=-2;i<=2;i++) {
        const ox=i*s*0.3;
        ctx.beginPath(); ctx.moveTo(ox,-s*0.9); ctx.lineTo(ox+s*0.07,s*0.9);
        ctx.strokeStyle=ctx.fillStyle; ctx.lineWidth=s*0.1; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox-s*0.12,-s*0.6); ctx.lineTo(ox,-s*0.9); ctx.lineTo(ox+s*0.12,-s*0.6); ctx.stroke();
      }
      break;
    }
    case 'DUAL': {
      for (const ox of [-s*0.35, s*0.35]) {
        ctx.beginPath(); ctx.moveTo(ox,-s*0.9); ctx.lineTo(ox+s*0.15,-s*0.1); ctx.lineTo(ox-s*0.15,-s*0.1); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.rect(ox-s*0.12,-s*0.1,s*0.24,s*0.4); ctx.fill();
      }
      break;
    }
    case 'SPREAD': {
      for (let i=0;i<7;i++) {
        const a=-0.75+i*0.25;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(0,s*0.3); ctx.lineTo(0,-s*0.9);
        ctx.lineWidth=s*0.1; ctx.strokeStyle=ctx.fillStyle; ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'TOXIC': {
      const tpos=[[0,-s*0.3],[s*0.4,-s*0.1],[-s*0.4,-s*0.1],[0,s*0.35],[s*0.35,s*0.3],[-s*0.35,s*0.3]];
      for (const [tx,ty] of tpos) { ctx.beginPath(); ctx.arc(tx,ty,s*0.32,0,Math.PI*2); ctx.fill(); }
      break;
    }
    case 'VOID_SHOT': {
      ctx.beginPath(); ctx.arc(0,0,s*0.45,0,Math.PI*2); ctx.fill();
      for (let i=2;i<=4;i++) {
        ctx.globalAlpha*=0.5;
        ctx.beginPath(); ctx.arc(0,0,s*i*0.22,0,Math.PI*2);
        ctx.lineWidth=s*0.08; ctx.strokeStyle=ctx.fillStyle; ctx.stroke();
      }
      break;
    }
    case 'PHOTON': {
      for (let i=0;i<4;i++) {
        ctx.save(); ctx.rotate(i*Math.PI/2);
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(s*0.2,s*0.2); ctx.lineTo(0,s*1.05); ctx.lineTo(-s*0.2,s*0.2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0,0,s*0.2,0,Math.PI*2); ctx.fill();
      break;
    }
    case 'QUANTUM': {
      for (let i=0;i<3;i++) {
        const a=i*Math.PI*2/3-Math.PI/2, r=s*0.6;
        ctx.globalAlpha=0.3+i*0.35;
        ctx.beginPath(); ctx.arc(Math.cos(a)*r,Math.sin(a)*r,s*0.25,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
      ctx.lineWidth=s*0.08; ctx.strokeStyle=ctx.fillStyle; ctx.setLineDash([s*0.1,s*0.08]);
      for (let i=0;i<3;i++) {
        const a1=i*Math.PI*2/3-Math.PI/2, a2=(i+1)*Math.PI*2/3-Math.PI/2, r=s*0.6;
        ctx.beginPath(); ctx.moveTo(Math.cos(a1)*r,Math.sin(a1)*r); ctx.lineTo(Math.cos(a2)*r,Math.sin(a2)*r); ctx.stroke();
      }
      ctx.setLineDash([]);
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

    const isWeapon = this.def.weaponType;
    const bgColor = harmful ? '#1a0420' : (legendary ? '#18120a' : (rarity==='epic' ? '#0a0818' : '#08101e'));
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = color;
    ctx.lineWidth = legendary ? 3 : (rarity==='epic' ? 2.5 : 2);
    ctx.shadowColor = color;
    ctx.shadowBlur = legendary ? 20 : (harmful ? 14 : 8);

    if (isWeapon) {
      // Armas: quadrado com cantos retos (arcade)
      const r = 3, sz = vr;
      ctx.beginPath();
      ctx.moveTo(-sz+r,-sz); ctx.lineTo(sz-r,-sz); ctx.lineTo(sz,-sz+r);
      ctx.lineTo(sz,sz-r); ctx.lineTo(sz-r,sz); ctx.lineTo(-sz+r,sz);
      ctx.lineTo(-sz,sz-r); ctx.lineTo(-sz,-sz+r); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // linha decorativa no topo do quadrado
      ctx.strokeStyle = color+'66'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-sz*.5,-sz+2); ctx.lineTo(sz*.5,-sz+2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0,0,vr,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
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

    // Anel/borda giratória decorativa
    ctx.save(); ctx.rotate(this.age * (harmful?-1.5:1.5));
    ctx.strokeStyle = color+(harmful?'55':(legendary?'88':'33'));
    ctx.lineWidth = legendary ? 2 : 1.2;
    ctx.setLineDash(legendary ? [4,3] : [3,6]);
    if (isWeapon) {
      const os = vr+7;
      ctx.beginPath(); ctx.rect(-os,-os,os*2,os*2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0,0,vr+7,0,Math.PI*2); ctx.stroke();
    }
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

  trackEffect(type, duration) {
    this.activeEffects = this.activeEffects.filter(e => e.type !== type);
    this.activeEffects.push({ type, timer: duration, maxTimer: duration });
  }

  update(dt) {
    this.activeEffects = this.activeEffects.filter(e => { e.timer -= dt; return e.timer > 0; });
  }

  isFull()      { return this.slots.every(s => s !== null); }
  isExtraFull() { return this.extraSlot !== null; }

  // Cartas de item permanente — ficam no slot e não são consumidas ao usar
  addPermanent(type, levelOrDuration) {
    const existing = this.slots.find(s => s && s.type === type && s.permanent);
    if (existing) {
      existing.cardLevel = (existing.cardLevel || 1) + 1;
      existing.permanentValue = levelOrDuration;
      return;
    }
    const idx = this.slots.indexOf(null);
    if (idx !== -1) {
      this.slots[idx] = {
        type,
        def: ITEM_DEFS[type] || { label: type, color: '#88ff88', usable: true },
        permanent: true,
        cardLevel: 1,
        permanentValue: levelOrDuration,
      };
    }
  }

  use(idx) {
    if (idx < 0 || idx > 5) return null;
    if (idx === 5) {
      const item = this.extraSlot;
      if (!item) return null;
      if (item.permanent) return { ...item, bonus: false }; // permanente: não consome
      this.extraSlot = null;
      return { ...item, bonus: true };
    }
    const item = this.slots[idx];
    if (!item) return null;
    if (item.permanent) return { ...item, bonus: false }; // permanente: não consome
    this.slots[idx] = null;
    return item;
  }
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

const WEAPON_TYPES = [
  'LASER','SHOTGUN','SNIPER','BOUNCER','FLAMETHROWER','PLASMA','RAILGUN',
  'HOMING','BURST','BOOMERANG','GRAVITY','EXPLOSIVE','CHAIN','STORM',
  'VOID_SHOT','PHOTON','DUAL','SPREAD','TOXIC','QUANTUM',
];

// ── Gerenciador de itens ──────────────────────────────────────
export class ItemManager {
  constructor() {
    this.items      = [];
    this.spawnTimer = 5;
    this.maxItems   = 35;
  }

  // Spawna o lote inicial: 30 armas + 40 itens aleatórios, espaçados pela arena
  spawnInitial(arena) {
    const pad = 120;
    const W = ARENA_W, H = ARENA_H;
    const place = (type) => {
      let x, y, tries = 0;
      do {
        x = pad + Math.random() * (W - pad*2);
        y = pad + Math.random() * (H - pad*2);
        tries++;
      } while (arena?.checkObstacleCollision(x, y, 14) && tries < 12);
      this.items.push(new Item(x, y, type));
    };
    // 10 armas espalhadas (1 de cada tipo principal)
    const weaponPool = [...WEAPON_TYPES];
    for (let i = 0; i < 10; i++) place(weaponPool[i % weaponPool.length]);
    // 15 itens aleatórios
    for (let i = 0; i < 15; i++) place(randomType(false));
  }

  spawnAt(x, y, count=1, arena=null) {
    for (let i=0;i<count;i++) {
      if (this.items.length >= this.maxItems+5) return;
      let cx, cy, tries=0;
      do {
        const ox=(Math.random()-.5)*80, oy=(Math.random()-.5)*80;
        cx=x+ox; cy=y+oy; tries++;
      } while (arena?.checkObstacleCollision(cx,cy,14) && tries<8);
      this.items.push(new Item(cx, cy));
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

  update(dt, px, py, hasMagnet, hasExtraSlot=false, arena=null) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.items.length < this.maxItems) {
      this.spawnTimer = 5 + Math.random()*3;
      const n = 1;
      for (let i=0;i<n;i++) {
        let x, y, tries=0;
        do {
          x = 100 + Math.random()*(ARENA_W-200);
          y = 100 + Math.random()*(ARENA_H-200);
          tries++;
        } while (arena?.checkObstacleCollision(x,y,14) && tries<10);
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
