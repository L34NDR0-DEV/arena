// HUD + minimap + overlay de reconstrução + recarga no canto direito.
import { ITEM_DEFS } from './items.js';

// Desenha ícone de item num canvas pequeno
function _drawItemIconSmall(ctx, type, W, H) {
  ctx.clearRect(0, 0, W, H);
  const def = ITEM_DEFS[type];
  if (!def) return;
  const s = Math.min(W, H) * 0.32;
  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.fillStyle = def.color;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = s * 0.2;
  ctx.lineCap = 'round';
  ctx.shadowColor = def.color;
  ctx.shadowBlur = 4;
  switch (type) {
    case 'HEALTH': { const b=s*.28,a=s*.72; ctx.fillRect(-b,-a,b*2,a*2); ctx.fillRect(-a,-b,a*2,b*2); break; }
    case 'SHIELD': { ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s,-s*.4); ctx.lineTo(s,s*.1); ctx.quadraticCurveTo(s,s*.8,0,s); ctx.quadraticCurveTo(-s,s*.8,-s,s*.1); ctx.lineTo(-s,-s*.4); ctx.closePath(); ctx.fill(); break; }
    case 'MANA': { ctx.beginPath(); ctx.moveTo(0,-s); ctx.bezierCurveTo(s*.8,-s*.2,s*.8,s*.5,0,s); ctx.bezierCurveTo(-s*.8,s*.5,-s*.8,-s*.2,0,-s); ctx.closePath(); ctx.fill(); break; }
    case 'RAPID': { for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*s*.28-s*.4,-s*.5);ctx.lineTo(i*s*.28,0);ctx.lineTo(i*s*.28-s*.4,s*.5);ctx.stroke();} break; }
    case 'MAGNET': { ctx.lineWidth=s*.3; ctx.strokeStyle=def.color; ctx.beginPath(); ctx.moveTo(-s*.8,s*.2); ctx.lineTo(-s*.8,-s*.3); ctx.arc(0,-s*.3,s*.8,Math.PI,0,false); ctx.lineTo(s*.8,s*.2); ctx.stroke(); break; }
    case 'BOOST': { ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*.6,s*.4); ctx.lineTo(0,s*.1); ctx.lineTo(-s*.6,s*.4); ctx.closePath(); ctx.fill(); break; }
    case 'BOMB': { ctx.beginPath(); ctx.arc(0,s*.15,s*.65,0,Math.PI*2); ctx.fill(); break; }
    case 'FREEZE': { for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.lineWidth=s*.15;ctx.strokeStyle=def.color;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-s);ctx.stroke();ctx.restore();} break; }
    case 'SLOW': { ctx.beginPath(); ctx.arc(0,0,s*.65,0,Math.PI*2); ctx.lineWidth=s*.18; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-s*.45); ctx.lineTo(0,0); ctx.lineTo(s*.3,s*.3); ctx.stroke(); break; }
    case 'DRAIN': { ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*.3,-s*.2); ctx.lineTo(s*.15,-s*.2); ctx.lineTo(s*.15,s); ctx.lineTo(-s*.15,s); ctx.lineTo(-s*.15,-s*.2); ctx.lineTo(-s*.3,-s*.2); ctx.closePath(); ctx.fill(); break; }
    case 'BLIND': { ctx.beginPath(); ctx.ellipse(0,0,s*.85,s*.45,0,0,Math.PI*2); ctx.lineWidth=s*.16; ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,s*.2,0,Math.PI*2); ctx.fill(); break; }
    default: { ctx.beginPath(); ctx.arc(0,0,s*.55,0,Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

export class UI {
  constructor() {
    this._hp     = document.getElementById('hp-fill');
    this._shield = document.getElementById('shield-fill');
    this._xp     = document.getElementById('xp-fill');
    this._mana   = document.getElementById('mana-fill');
    this._lvl    = document.getElementById('player-level');
    this._score  = document.getElementById('score-player');
    this._scoreE = document.getElementById('score-enemy');
    this._timer  = document.getElementById('timer');
    this._center = document.getElementById('hud-center');
    this._wave   = null;
    this._notify = document.getElementById('notify');
    this._kfeed  = document.getElementById('kill-feed');
    this._puSlots      = [0,1,2,3,4].map(i=>document.getElementById('pu'+i));
    this._extraSlot    = document.getElementById('pu-extra');
    this._effectsCanvas= document.getElementById('active-effects-canvas');
    this._notTO  = null;
    this._lastMode = null;
  }

  update(player, timeLeft, enemyScore, pLives, eLives, maxLives, mode) {
    if (this._hp)     this._hp.style.width     = Math.max(0,player.hp/player.maxHp*100)+'%';
    if (this._shield) this._shield.style.width = Math.max(0,player.shield/player.maxShield*100)+'%';
    if (this._xp)     this._xp.style.width     = Math.max(0,player.xp/player.xpToNext*100)+'%';
    if (this._mana)   this._mana.style.width   = Math.max(0,player.mana/player.maxMana*100)+'%';
    if (this._lvl)    this._lvl.textContent     = `NV.${player.level}`;

    // Placar: visível apenas fora do Contra1
    if (this._center) {
      if (mode === 'contra1') { this._center.classList.add('hidden'); }
      else {
        this._center.classList.remove('hidden');
        if (this._score)  this._score.textContent  = player.score;
        if (this._scoreE) this._scoreE.textContent = enemyScore;
      }
    }

    // Timer: oculta no Contra1
    if (this._timer) {
      if (mode==='contra1') {
        this._timer.textContent='';
      } else {
        const min=Math.floor(timeLeft/60), sec=Math.floor(timeLeft%60);
        this._timer.textContent=`${min}:${sec.toString().padStart(2,'0')}`;
        this._timer.style.color=timeLeft<30?'#ff2255':'#00d4ff';
      }
    }

    // Slots de inventário (5 slots + extra X)
    if (this._puSlots && player.inventory) {
      // Slots 0-4
      this._puSlots.forEach((slot, i) => {
        if (!slot) return;
        const item = player.inventory.slots[i];
        const cv = slot.querySelector('.pu-icon');
        if (item) {
          slot.classList.add('has-item');
          slot.classList.remove('harmful-item');
          if (cv) _drawItemIconSmall(cv.getContext('2d'), item.type, cv.width, cv.height);
          slot.title = item.def.label + ': ' + item.def.desc;
        } else {
          slot.classList.remove('has-item','harmful-item');
          if (cv) cv.getContext('2d').clearRect(0,0,cv.width,cv.height);
          slot.title = '';
        }
      });

      // Slot extra X
      const extraSlot = this._extraSlot;
      if (extraSlot) {
        const ex = player.inventory.extraSlot;
        const cv = extraSlot.querySelector('.pu-icon');
        if (ex) {
          extraSlot.classList.add('has-item','extra-slot-active');
          extraSlot.classList.remove('hidden-slot');
          if (cv) _drawItemIconSmall(cv.getContext('2d'), ex.type, cv.width, cv.height);
          extraSlot.title = '[X] ' + ex.def.label + ' (BÔNUS +50%)';
        } else {
          extraSlot.classList.remove('has-item','extra-slot-active');
          extraSlot.classList.add('hidden-slot');
          if (cv) cv.getContext('2d').clearRect(0,0,cv.width,cv.height);
        }
      }

      // Efeitos ativos: timers abaixo dos slots — lê direto do player
      if (this._effectsCanvas) {
        this._drawActiveEffects(player);
      }
    }
  }

  _drawActiveEffects(player) {
    const cv = this._effectsCanvas;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0,0,cv.width,cv.height);

    // Coleta timers ativos direto do player
    const active = [];
    const check = (type, timer, maxTimer) => { if (timer > 0) active.push({type, timer, maxTimer}); };
    check('RAPID',       player.rapidTimer,       8);
    check('MAGNET',      player.magnetTimer,      10);
    check('BOOST',       player.boostTimer,       6);
    check('FREEZE',      player.freezeTimer,      4);
    check('SLOW',        player.slowTimer,        5);
    check('BLIND',       player.blindTimer,       4);
    check('MULTISHOT',   player.multishotTimer,   6);
    check('PIERCING',    player.piercingTimer,    7);
    check('DASH_BOOST',  player.dashBoostTimer,   8);
    check('REGEN',       player.regenTimer,       8);
    check('SHIELD_AURA', player.shieldAuraTimer,  8);
    check('OVERCLOCK',   player.overclockTimer,   5);
    check('INVISIBLE',   player.invisibleTimer,   5);
    check('GODMODE',     player.godmodeTimer,     4);
    check('VAMPIRO',     player.vampireTimer,     6);
    check('POISON',      player.poisonTimer,      5);

    if (!active.length) return;

    const slotW = 44, gap = 3;
    const totalNeeded = active.length * (slotW+gap) - gap;
    // Redimensiona o canvas se precisar
    if (cv.width < totalNeeded) cv.width = totalNeeded + 4;

    active.forEach((e, i) => {
      const def = ITEM_DEFS[e.type];
      if (!def) return;
      const x = i*(slotW+gap);
      const pct = Math.max(0, e.timer / e.maxTimer);

      // Fundo
      ctx.fillStyle = 'rgba(4,10,22,0.9)';
      ctx.fillRect(x, 0, slotW, cv.height);

      // Label
      ctx.fillStyle = def.color;
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = def.color; ctx.shadowBlur = 4;
      ctx.fillText(def.label, x+slotW/2, 2);
      ctx.shadowBlur = 0;

      // Tempo restante
      ctx.fillStyle = pct > 0.35 ? '#aaccee' : '#ff5566';
      ctx.font = 'bold 8px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(Math.ceil(e.timer)+'s', x+slotW/2, 11);

      // Barra de tempo na base
      const barH = 4, barY = cv.height - barH - 1;
      ctx.fillStyle = '#0a1828';
      ctx.fillRect(x+2, barY, slotW-4, barH);
      const barColor = pct > 0.35 ? def.color : '#ff3355';
      ctx.fillStyle = barColor;
      ctx.shadowColor = barColor; ctx.shadowBlur = 3;
      ctx.fillRect(x+2, barY, (slotW-4)*pct, barH);
      ctx.shadowBlur = 0;

      // Borda
      ctx.strokeStyle = def.color+'55'; ctx.lineWidth = 1;
      ctx.strokeRect(x+0.5, 0.5, slotW-1, cv.height-1);
    });
  }

  notify(text,color='#ffcc00') {
    clearTimeout(this._notTO);
    if (this._notify) this._notify.innerHTML=`<div class="notify-msg" style="color:${color};">${text}</div>`;
    this._notTO=setTimeout(()=>{if(this._notify)this._notify.innerHTML='';},2200);
  }

  killFeed(text) {
    if (!this._kfeed) return;
    const el=document.createElement('div');
    el.className='kf-entry'; el.textContent=text;
    this._kfeed.appendChild(el);
    setTimeout(()=>el.remove(),3100);
    while (this._kfeed.children.length>5) this._kfeed.firstChild.remove();
  }

  drawWaveAlert(ctx,wave,countdown,W,H) {
    if (countdown<=0) return;
    ctx.save();
    ctx.globalAlpha=Math.min(1,countdown*0.6);
    ctx.fillStyle='#ffcc00'; ctx.font='bold 20px monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.shadowColor='#ffcc00'; ctx.shadowBlur=16;
    ctx.fillText(`ONDA ${wave} EM ${countdown}s`,W/2,H/2+90);
    ctx.restore();
  }

  // ── HUD direito: recarga + itens coletados ────────────────
  drawRightHUD(ctx, player, W, H, mode) {
    const x=W-14, y0=H/2-80;
    const shootMaxCd = player.hasRapid ? 0.07 : 0.28;
    const shootProg  = Math.max(0,1-(player.shootCd/shootMaxCd));
    const manaProg   = player.mana/player.maxMana;

    ctx.save();

    // ── Recarga do tiro (arco circular) ──────────────────────
    const R=18, cx2=x-R-4, cy2=y0+R;
    // Fundo
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(cx2,cy2,R+2,0,Math.PI*2); ctx.fill();
    // Track
    ctx.strokeStyle='#0a1a28'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(cx2,cy2,R,0,Math.PI*2); ctx.stroke();
    // Arco de recarga
    const rcColor=shootProg>=1?'#00ff88':'#ffcc00';
    ctx.strokeStyle=rcColor; ctx.lineWidth=4; ctx.lineCap='round';
    ctx.shadowColor=rcColor; ctx.shadowBlur=shootProg>=1?12:6;
    ctx.beginPath(); ctx.arc(cx2,cy2,R,-Math.PI/2,-Math.PI/2+shootProg*Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
    // Texto
    ctx.fillStyle=shootProg>=1?'#00ff88':'#aaaaaa';
    ctx.font=`bold 7px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(shootProg>=1?'PRONTO':'CARGA',cx2,cy2-1);
    if (shootProg<1) {
      ctx.font='6px monospace'; ctx.fillStyle='#cccccc';
      ctx.fillText(Math.round(player.shootCd*10)/10+'s',cx2,cy2+7);
    }

    // ── Mana (arco menor abaixo) ──────────────────────────────
    const cy3=cy2+R*2+12;
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(cx2,cy3,R+2,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#0a1a28'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(cx2,cy3,R,0,Math.PI*2); ctx.stroke();
    ctx.strokeStyle='#4488ff'; ctx.lineWidth=4; ctx.lineCap='round';
    ctx.shadowColor='#4488ff'; ctx.shadowBlur=manaProg>0.3?6:0;
    ctx.beginPath(); ctx.arc(cx2,cy3,R,-Math.PI/2,-Math.PI/2+manaProg*Math.PI*2); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.fillStyle='#4488ff'; ctx.font='bold 7px monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('MANA',cx2,cy3-1);
    ctx.font='6px monospace'; ctx.fillStyle='#88aaff';
    ctx.fillText(Math.round(player.mana),cx2,cy3+7);

    // ── Itens coletados ───────────────────────────────────────
    const cy4=cy3+R*2+14;
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.fillRect(cx2-R-2,cy4,R*2+4,28);
    ctx.strokeStyle='#1a3a5a'; ctx.lineWidth=1;
    ctx.strokeRect(cx2-R-2,cy4,R*2+4,28);
    ctx.fillStyle='#5a7a9a'; ctx.font='6px monospace';
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('ITENS',cx2,cy4+2);
    ctx.fillStyle='#ffcc00'; ctx.font='bold 13px monospace';
    ctx.textBaseline='top';
    ctx.fillText(player.itemsCollected,cx2,cy4+11);

    ctx.restore();
  }

  // ── Overlay de reconstrução ───────────────────────────────
  drawRebuildOverlay(ctx, W, H, rebuildTimer, maxRebuild) {
    const progress=1-(rebuildTimer/maxRebuild);

    // Tela acinzentada
    ctx.save();
    ctx.fillStyle=`rgba(8,12,20,${0.55+0.1*Math.sin(Date.now()/300)})`;
    ctx.fillRect(0,0,W,H);

    // Vigente: linhas de interferência
    for (let i=0;i<6;i++) {
      const yy=(Math.sin(Date.now()/200+i)*H/2+H/2)%H;
      ctx.fillStyle=`rgba(0,180,255,0.04)`;
      ctx.fillRect(0,yy,W,2);
    }

    // Painel central
    const pw=360, ph=130, px=(W-pw)/2, py=(H-ph)/2-20;
    ctx.fillStyle='rgba(4,10,20,0.92)';
    ctx.strokeStyle='#1a3a5a'; ctx.lineWidth=1;
    ctx.fillRect(px,py,pw,ph); ctx.strokeRect(px,py,pw,ph);
    // Borda superior colorida
    ctx.strokeStyle='#00d4ff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+pw,py); ctx.stroke();

    // Título
    ctx.fillStyle='#ff4466'; ctx.font='bold 11px monospace';
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.shadowColor='#ff4466'; ctx.shadowBlur=8;
    ctx.fillText('NAVE DESTRUÍDA — RECONSTRUINDO',W/2,py+12);
    ctx.shadowBlur=0;

    // Contador grande
    const secs=Math.ceil(rebuildTimer);
    ctx.fillStyle=secs<=10?'#ff4466':'#00d4ff';
    ctx.font=`bold 44px monospace`;
    ctx.textBaseline='top';
    ctx.shadowColor=secs<=10?'#ff4466':'#00d4ff'; ctx.shadowBlur=18;
    ctx.fillText(secs,W/2,py+28);
    ctx.shadowBlur=0;

    // Barra de progresso
    const bx=px+20, bw=pw-40, bh=8, by=py+ph-22;
    ctx.fillStyle='#0a1a28'; ctx.fillRect(bx,by,bw,bh);
    const fillColor=progress<0.5?'#ff8800':'#00d4ff';
    ctx.fillStyle=fillColor; ctx.shadowColor=fillColor; ctx.shadowBlur=8;
    ctx.fillRect(bx,by,bw*progress,bh);
    ctx.shadowBlur=0;
    // Label barra
    ctx.fillStyle='#5a7a9a'; ctx.font='7px monospace'; ctx.textBaseline='bottom';
    ctx.fillText('RECONSTRUÇÃO',W/2,by-2);

    // Invulnerável
    ctx.fillStyle='#00ff88'; ctx.font='bold 8px monospace'; ctx.textBaseline='top';
    ctx.shadowColor='#00ff88'; ctx.shadowBlur=6;
    ctx.fillText('▲ INVULNERÁVEL ▲',W/2,by+bh+6);
    ctx.shadowBlur=0;

    ctx.restore();
  }

  drawMinimap(ctx,player,enemies,items,MW,MH) {
    const AW=8000,AH=5500,sx=MW/AW,sy=MH/AH;
    ctx.clearRect(0,0,MW,MH);
    ctx.fillStyle='#04080fcc'; ctx.fillRect(0,0,MW,MH);
    ctx.strokeStyle='#1a3a5a'; ctx.lineWidth=1; ctx.strokeRect(0,0,MW,MH);
    for (const it of items){ctx.fillStyle=it.def.color;ctx.fillRect(it.x*sx-1,it.y*sy-1,2.5,2.5);}
    for (const e of enemies){if(e.dead)continue;ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(e.x*sx,e.y*sy,2.5,0,Math.PI*2);ctx.fill();}
    if (!player.rebuilding){
      ctx.fillStyle='#00d4ff'; ctx.shadowColor='#00d4ff'; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.arc(player.x*sx,player.y*sy,3.5,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }
  }
}
