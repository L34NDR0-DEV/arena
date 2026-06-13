// HUD + minimap + overlay de reconstrução + recarga no canto direito.
import { ITEM_DEFS } from './items.js';
import { drawProfileIcon } from './profileIcons.js';

const WEAPON_TOOLTIP = {
  LASER:       {name:'LASER',        desc:'Cadência extrema.\nBala fina que atravessa tudo.'},
  SHOTGUN:     {name:'SHOTGUN',      desc:'7 projéteis em cone.\nDestruição a curta distância.'},
  SNIPER:      {name:'SNIPER',       desc:'1 tiro massivo.\nPerfura inimigos. Recarga lenta.'},
  BOUNCER:     {name:'BOUNCER',      desc:'Balas que ricocheteiam\n8x nas paredes.'},
  FLAMETHROWER:{name:'FLAMETHROWER', desc:'Cone de fogo contínuo.\nArea de negação próxima.'},
  PLASMA:      {name:'PLASMA',       desc:'Orbe lento explosivo.\nDano em área ao impacto.'},
  RAILGUN:     {name:'RAILGUN',      desc:'3 raios em rajada rápida.\nPerfura tudo no caminho.'},
  HOMING:      {name:'HOMING',       desc:'2 mísseis teleguiados.\nSempre encontram o alvo.'},
  BURST:       {name:'BURST',        desc:'Rajada de 5 balas rápidas.\nSpray controlado.'},
  BOOMERANG:   {name:'BOOMERANG',    desc:'Bala que volta para você.\nAtinge 2x no mesmo tiro.'},
  GRAVITY:     {name:'GRAVITY',      desc:'Puxa inimigos em área grande\npara o ponto de impacto.'},
  EXPLOSIVE:   {name:'EXPLOSIVE',    desc:'Explosão + fragmentos laterais.\nDano em área.'},
  CHAIN:       {name:'CHAIN',        desc:'Raio que salta entre\n4 inimigos próximos.'},
  STORM:       {name:'STORM',        desc:'Dispara em 8 direções\nao mesmo tempo.'},
  VOID_SHOT:   {name:'VOID SHOT',    desc:'Drena mana inimiga.\nCura ao acertar. Perfura.'},
  PHOTON:      {name:'PHOTON',       desc:'Tiro central + 3 laterais.\nCobre 360° ao redor.'},
  DUAL:        {name:'DUAL',         desc:'Dois canos paralelos.\nCadência alta, DPS duplo.'},
  SPREAD:      {name:'SPREAD',       desc:'9 projéteis em leque.\nControle de multidão.'},
  TOXIC:       {name:'TOXIC',        desc:'Nuvem tóxica persistente.\nVeneno por contato.'},
  QUANTUM:     {name:'QUANTUM',      desc:'Ao acertar, divide em 3\nprojéteis em X.'},
};

const ITEM_TOOLTIP = {
  HEALTH:  {name:'Kit de Cura',     desc:'Restaura HP instantaneamente.'},
  SHIELD:  {name:'Escudo',          desc:'Absorve dano antes do HP.'},
  MANA:    {name:'Mana',            desc:'Restaura mana para habilidades.'},
  RAPID:   {name:'Recarga Rapida',  desc:'Reduz cooldown de tiro por 8s.'},
  MAGNET:  {name:'Ima',             desc:'Atrai itens e XP proximos.'},
  BOOST:   {name:'Impulso',         desc:'Aumenta velocidade por 6s.'},
  MINE:    {name:'Mina',            desc:'Explode ao contato inimigo.'},
  FREEZE:  {name:'Congelamento',    desc:'Congela inimigos em area.'},
  SLOW:    {name:'Desacelerador',   desc:'Reduz velocidade inimiga.'},
  DRAIN:   {name:'Dreno',           desc:'Drena HP dos inimigos proximos.'},
  BLIND:   {name:'Cegueira',        desc:'Cega inimigos temporariamente.'},
  NOVA:    {name:'Nova',            desc:'Explosao de energia em toda area.'},
  REGEN:   {name:'Regeneracao',     desc:'Regenera HP ao longo do tempo.'},
  SHIELD_BIG:{name:'Mega Escudo',   desc:'Escudo massivo temporario.'},
  RAPID_CHARGE:{name:'Sobrecarga',  desc:'Tiro muito rapido por 6s.'},
};

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
    case 'MINE': {
      ctx.beginPath(); ctx.arc(0,s*.1,s*.5,0,Math.PI*2); ctx.fill();
      ctx.lineWidth=s*.12;
      for(let i=0;i<6;i++){const a=i*Math.PI/3; ctx.beginPath(); ctx.moveTo(Math.cos(a)*s*.5,s*.1+Math.sin(a)*s*.5); ctx.lineTo(Math.cos(a)*s*.9,s*.1+Math.sin(a)*s*.9); ctx.stroke();}
      break;
    }
    case 'FREEZE': { for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3);ctx.lineWidth=s*.15;ctx.strokeStyle=def.color;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-s);ctx.stroke();ctx.restore();} break; }
    case 'SLOW': { ctx.beginPath(); ctx.arc(0,0,s*.65,0,Math.PI*2); ctx.lineWidth=s*.18; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,-s*.45); ctx.lineTo(0,0); ctx.lineTo(s*.3,s*.3); ctx.stroke(); break; }
    case 'DRAIN': { ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*.3,-s*.2); ctx.lineTo(s*.15,-s*.2); ctx.lineTo(s*.15,s); ctx.lineTo(-s*.15,s); ctx.lineTo(-s*.15,-s*.2); ctx.lineTo(-s*.3,-s*.2); ctx.closePath(); ctx.fill(); break; }
    case 'BLIND': { ctx.beginPath(); ctx.ellipse(0,0,s*.85,s*.45,0,0,Math.PI*2); ctx.lineWidth=s*.16; ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,s*.2,0,Math.PI*2); ctx.fill(); break; }
    default: { ctx.beginPath(); ctx.arc(0,0,s*.55,0,Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

// Desenha ícone de arma num canvas pequeno (slots de arma)
function _drawWeaponIconSmall(ctx, type, W, H) {
  const COLORS = {
    LASER:'#ff0088',RAILGUN:'#00ff88',PHOTON:'#ffffff',
    SHOTGUN:'#ff5500',BURST:'#ffbb00',SPREAD:'#ffcc44',DUAL:'#ff8844',
    SNIPER:'#00ffcc',BOUNCER:'#ffee00',BOOMERANG:'#00eeff',
    PLASMA:'#aa00ff',VOID_SHOT:'#cc44ff',GRAVITY:'#8844ff',QUANTUM:'#ff00ff',
    CHAIN:'#55aaff',STORM:'#ccaaff',EXPLOSIVE:'#ff6600',FLAMETHROWER:'#ff3300',
    HOMING:'#ff44aa',TOXIC:'#66ff00',
  };
  const color = COLORS[type] || '#ffffff';
  const s = Math.min(W,H) * 0.3;
  ctx.save();
  ctx.translate(W/2, H/2);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.lineWidth = s * 0.18;
  ctx.lineCap = 'round';
  switch(type) {
    case 'LASER': case 'RAILGUN': case 'PHOTON':
      for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(-s,i*s*.35);ctx.lineTo(s,i*s*.35*.3);ctx.stroke();}
      break;
    case 'SHOTGUN': case 'SPREAD':
      ctx.beginPath();ctx.moveTo(-s*.2,-s*.8);ctx.lineTo(s*.2,-s*.8);ctx.lineTo(s*.6,s*.8);ctx.lineTo(-s*.6,s*.8);ctx.closePath();ctx.fill();
      for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(i*s*.5,s*.8);ctx.lineTo(i*s,s+s*.6);ctx.stroke();}
      break;
    case 'SNIPER':
      ctx.beginPath();ctx.moveTo(-s*1.1,0);ctx.lineTo(s*1.1,0);ctx.lineWidth=s*.1;ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,s*.18,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-s*.3,-s*.3);ctx.lineTo(s*.3,s*.3);ctx.moveTo(-s*.3,s*.3);ctx.lineTo(s*.3,-s*.3);ctx.lineWidth=s*.08;ctx.stroke();
      break;
    case 'PLASMA': case 'GRAVITY': case 'QUANTUM': case 'VOID_SHOT':
      ctx.beginPath();ctx.arc(0,0,s*.75,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=color+'88';ctx.lineWidth=s*.1;ctx.beginPath();ctx.arc(0,0,s*1.1,0,Math.PI*2);ctx.stroke();
      break;
    case 'CHAIN': case 'STORM':
      for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-s+i*s*.4,-s+Math.random()*s);ctx.lineTo(-s+i*s*.4+s*.3,Math.random()*s*.5);ctx.lineTo(-s+i*s*.4+s*.15,s);ctx.stroke();}
      break;
    case 'EXPLOSIVE': case 'BURST':
      for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*s,Math.sin(a)*s);ctx.stroke();}
      ctx.beginPath();ctx.arc(0,0,s*.35,0,Math.PI*2);ctx.fill();
      break;
    case 'HOMING':
      ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.5,s*.5);ctx.lineTo(0,s*.1);ctx.lineTo(-s*.5,s*.5);ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.arc(s*.8,-s*.5,s*.3,0,Math.PI*2);ctx.lineWidth=s*.1;ctx.stroke();
      break;
    case 'FLAMETHROWER':
      for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(s*.3*i-s*.4,(Math.random()-.5)*s*.6,s*(0.2+i*.1),0,Math.PI*2);ctx.fill();}
      break;
    default:
      ctx.beginPath();ctx.moveTo(0,-s*.9);ctx.lineTo(s*.7,s*.6);ctx.lineTo(-s*.7,s*.6);ctx.closePath();ctx.fill();
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
    this._teamKillCounter = document.getElementById('team-kill-counter');
    this._teamKillRed = document.getElementById('tkc-red');
    this._teamKillBlue = document.getElementById('tkc-blue');
    this._wave   = null;
    this._notify = document.getElementById('notify');
    this._kfeed  = document.getElementById('kill-feed');
    this._touchHpFill   = document.getElementById('touch-hp-fill');
    this._touchManaFill = document.getElementById('touch-mana-fill');
    this._touchHpLabel  = document.getElementById('touch-hp-label');
    this._touchManaLabel= document.getElementById('touch-mana-label');
    this._puSlots      = [0,1,2,3,4].map(i=>document.getElementById('pu'+i));
    this._extraSlot    = document.getElementById('pu-extra');
    this._effectsCanvas= document.getElementById('active-effects-canvas');
    this._wsSlots      = [0,1,2,3,4].map(i=>document.getElementById('ws'+i));
    this._wsExtra      = document.getElementById('ws-extra');
    this._touchSlots   = [...document.querySelectorAll('#touch-controls .touch-slot')];
    this._notTO  = null;
    this._lastMode = null;
    this._tooltip  = document.getElementById('hud-tooltip');
    this._ttName   = document.getElementById('tt-name');
    this._ttDesc   = document.getElementById('tt-desc');
    this._tooltipTO = null;
    this._setupTooltips();
    this._teamLobby   = document.getElementById('team-lobby');
    this._teamLobbyCt = document.getElementById('team-lobby-count');
    this._matchLoading     = document.getElementById('match-loading');
    this._matchLoadingRoster = document.getElementById('match-loading-roster');
    this._matchLoadingPing   = document.getElementById('match-loading-ping');
  }

  _setupTooltips() {
    if (!this._tooltip) return;
    const tip = this._tooltip;
    const show = (el, data, e) => {
      if (!data) return;
      this._ttName.textContent = data.name;
      this._ttDesc.textContent = data.desc.replace(/\\n/g, '\n');
      tip.style.display = 'block';
      requestAnimationFrame(() => tip.classList.add('visible'));
      this._moveTooltip(e);
    };
    const hide = () => {
      tip.classList.remove('visible');
      clearTimeout(this._tooltipTO);
      this._tooltipTO = setTimeout(() => { tip.style.display='none'; }, 160);
    };
    const onMove = (e) => this._moveTooltip(e);

    // Weapon slots
    const allWs = [...(this._wsSlots||[]), this._wsExtra].filter(Boolean);
    allWs.forEach(slot => {
      slot.addEventListener('mouseenter', e => {
        const wt = slot.dataset.weaponType;
        if (!wt) return;
        show(slot, WEAPON_TOOLTIP[wt], e);
      });
      slot.addEventListener('mousemove', onMove);
      slot.addEventListener('mouseleave', hide);
    });

    // Powerup slots (incluindo extra)
    const allPu = [...([0,1,2,3,4].map(i=>document.getElementById('pu'+i))), document.getElementById('pu-extra'), document.getElementById('pu-x')].filter(Boolean);
    allPu.forEach(slot => {
      slot.addEventListener('mouseenter', e => {
        const it = slot.dataset.itemType;
        if (!it) return;
        const info = ITEM_TOOLTIP[it] || {name: it, desc: ITEM_DEFS[it]?.label || ''};
        show(slot, info, e);
      });
      slot.addEventListener('mousemove', onMove);
      slot.addEventListener('mouseleave', hide);
    });
  }

  _moveTooltip(e) {
    if (!this._tooltip) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = e.clientX + 14, y = e.clientY - 8;
    const tw = this._tooltip.offsetWidth || 150;
    const th = this._tooltip.offsetHeight || 60;
    if (x + tw > vw - 8) x = e.clientX - tw - 14;
    if (y + th > vh - 8) y = e.clientY - th - 8;
    this._tooltip.style.left = x + 'px';
    this._tooltip.style.top  = y + 'px';
  }

  // Lobby/fila do modo "Equipe Online" — mostrado enquanto aguarda match_start
  showTeamLobby(text, modeTitle) {
    if (this._teamLobby) this._teamLobby.classList.add('show');
    if (this._teamLobbyCt && text) this._teamLobbyCt.textContent = text;
    const titleEl = document.getElementById('tl-mode-title');
    if (titleEl && modeTitle) titleEl.textContent = modeTitle;
  }
  hideTeamLobby() {
    if (this._teamLobby) this._teamLobby.classList.remove('show');
  }

  // Tela de carregamento de partida online — mostra os jogadores da sala
  // (nome, prévia da nave/skin equipada, ícone de perfil) e o ping (ms) do
  // jogador local.
  // `roster`: [{ name, skin, profileIcon, team, isMe, isBot }]
  showMatchLoading(roster) {
    if (!this._matchLoading) return;
    if (this._matchLoadingRoster) {
      this._matchLoadingRoster.innerHTML = '';
      for (const p of roster) {
        const card = document.createElement('div');
        card.className = 'ml-card'
          + (p.isMe ? ' me' : '')
          + (p.team === 'red' ? ' team-red' : p.team === 'blue' ? ' team-blue' : '');
        card.innerHTML =
          `<div class="ml-icon"></div>`
          + `<div class="ml-name">${p.isBot ? '[BOT] ' : ''}${p.name}</div>`
          + `<div class="ml-skin">${p.skin ? p.skin.name : ''}</div>`;
        const iconEl = card.querySelector('.ml-icon');
        const iconCv = document.createElement('canvas');
        iconCv.width = iconCv.height = 36;
        iconCv.style.width = iconCv.style.height = '100%';
        drawProfileIcon(iconCv.getContext('2d'), p.profileIcon || 0, 36, 36);
        iconEl.appendChild(iconCv);
        if (p.skin) {
          const cv = document.createElement('canvas');
          cv.width = cv.height = 36;
          cv.className = 'ml-skin-preview';
          const cctx = cv.getContext('2d');
          const draw = ()=>{ cctx.clearRect(0,0,36,36); cctx.save(); cctx.translate(18,18); p.skin.drawPreview(cctx, 36/p.skin._size); cctx.restore(); };
          if (p.skin.img) { p.skin.img.onload = draw; setTimeout(draw,300); }
          draw();
          card.insertBefore(cv, card.querySelector('.ml-name'));
        }
        this._matchLoadingRoster.appendChild(card);
      }
    }
    this._matchLoading.classList.add('show');
  }
  updateMatchLoadingPing(ms) {
    if (!this._matchLoadingPing) return;
    const span = this._matchLoadingPing.querySelector('span');
    if (span) span.textContent = (ms == null) ? '--' : String(ms);
    this._matchLoadingPing.classList.remove('high','mid');
    if (ms != null) {
      if (ms >= 150) this._matchLoadingPing.classList.add('high');
      else if (ms >= 80) this._matchLoadingPing.classList.add('mid');
    }
  }
  hideMatchLoading() {
    if (this._matchLoading) this._matchLoading.classList.remove('show');
  }

  update(player, timeLeft, enemyScore, pLives, eLives, maxLives, mode, teamScores=null) {
    if (this._hp)     this._hp.style.width     = Math.max(0,player.hp/player.maxHp*100)+'%';
    if (this._shield) this._shield.style.width = Math.max(0,player.shield/player.maxShield*100)+'%';
    if (this._xp)     this._xp.style.width     = Math.max(0,player.xp/player.xpToNext*100)+'%';
    if (this._mana)   this._mana.style.width   = Math.max(0,player.mana/player.maxMana*100)+'%';
    if (this._lvl)    this._lvl.textContent     = `NV.${player.level}`;

    // Barras mobile no topbar
    const hpPct   = Math.max(0, player.hp / player.maxHp);
    const manaPct = Math.max(0, player.mana / player.maxMana);
    if (this._touchHpFill) {
      this._touchHpFill.style.width = (hpPct * 100) + '%';
      const hc = hpPct > 0.5 ? '#00e060' : hpPct > 0.25 ? '#ffcc00' : '#ff2244';
      this._touchHpFill.style.background = hc;
      this._touchHpFill.style.boxShadow  = `0 0 6px ${hc}88`;
    }
    if (this._touchManaFill)  this._touchManaFill.style.width  = (manaPct * 100) + '%';
    if (this._touchHpLabel)   this._touchHpLabel.textContent   = `${Math.round(player.hp)}`;
    if (this._touchManaLabel) this._touchManaLabel.textContent = `${Math.round(player.mana)}`;

    // Placar: visível apenas nos modos que usam pontuação direta
    if (this._center) {
      if (mode === 'contra1' || mode === 'tower_defense' || mode === 'cards' || mode === 'equipe_online') {
        this._center.classList.add('hidden');
      } else {
        this._center.classList.remove('hidden');
        const redLabel  = this._center.querySelector('.score-box:first-child .score-label');
        const blueLabel = this._center.querySelector('.score-box:last-child .score-label');
        if (redLabel)  redLabel.textContent  = 'VOCÊ';
        if (blueLabel) blueLabel.textContent = 'INIMIGO';
        if (this._score)  { this._score.textContent  = player.score; this._score.style.color  = ''; }
        if (this._scoreE) { this._scoreE.textContent = enemyScore;   this._scoreE.style.color = ''; }
      }
    }

    if (this._teamKillCounter) {
      const showTeamKills = (mode === 'equipe_online' || mode === 'tower_defense') && teamScores;
      this._teamKillCounter.style.display = showTeamKills ? 'flex' : 'none';
      if (showTeamKills) {
        if (this._teamKillRed) this._teamKillRed.textContent = teamScores.red ?? 0;
        if (this._teamKillBlue) this._teamKillBlue.textContent = teamScores.blue ?? 0;
      }
    }

    // Timer: oculta nos modos por vidas/fases/objetivo
    if (this._timer) {
      if (mode==='contra1' || mode==='tower_defense' || mode==='cards') {
        this._timer.textContent='';
      } else {
        const min=Math.floor(timeLeft/60), sec=Math.floor(timeLeft%60);
        this._timer.textContent=`${min}:${sec.toString().padStart(2,'0')}`;
        this._timer.style.color=timeLeft<30?'#ff2255':'#00d4ff';
      }
    }

    // Slots de arma (R T Y U I + L)
    if (this._wsSlots && player.weaponSlots) {
      this._wsSlots.forEach((slot, i) => {
        if (!slot) return;
        const wt = player.weaponSlots[i];
        const cv = slot.querySelector('.ws-icon');
        const isActive = player.activeWeaponSlot === i;
        slot.classList.toggle('ws-has-weapon', !!wt);
        slot.classList.toggle('ws-active', isActive);
        slot.dataset.weaponType = wt || '';
        if (cv) {
          const ctx = cv.getContext('2d');
          ctx.clearRect(0,0,cv.width,cv.height);
          if (wt) _drawWeaponIconSmall(ctx, wt, cv.width, cv.height);
        }
        // label do nome
        let lbl = slot.querySelector('.ws-weapon-label');
        if (wt && !lbl) { lbl = document.createElement('span'); lbl.className='ws-weapon-label'; slot.appendChild(lbl); }
        if (lbl) lbl.textContent = wt ? wt : '';
        if (!wt && lbl) lbl.textContent = '';
      });
      // Slot extra L
      if (this._wsExtra) {
        const wt = player.extraWeaponSlot;
        const cv = this._wsExtra.querySelector('.ws-icon');
        const isActive = player.activeWeaponSlot === 5;
        this._wsExtra.classList.toggle('ws-has-weapon', !!wt);
        this._wsExtra.classList.toggle('ws-active', isActive);
        this._wsExtra.dataset.weaponType = wt || '';
        if (cv) {
          const ctx = cv.getContext('2d');
          ctx.clearRect(0,0,cv.width,cv.height);
          if (wt) _drawWeaponIconSmall(ctx, wt, cv.width, cv.height);
        }
        let lbl = this._wsExtra.querySelector('.ws-weapon-label');
        if (wt && !lbl) { lbl = document.createElement('span'); lbl.className='ws-weapon-label'; this._wsExtra.appendChild(lbl); }
        if (lbl) lbl.textContent = wt ? wt : '';
        if (!wt && lbl) lbl.textContent = '';
      }
    }

    // Slots de inventário (5 slots + extra X)
    if (this._touchSlots?.length) {
      this._touchSlots.forEach((slot, i) => {
        const isExtra = slot.dataset.slot === 'x';
        const item = isExtra ? player.inventory?.extraSlot : player.inventory?.slots?.[i];
        const cv = slot.querySelector('.touch-slot-icon');
        const label = slot.querySelector('span');
        slot.classList.remove('touch-slot-weapon','touch-slot-active');
        slot.classList.toggle('touch-slot-item', !!item);
        slot.dataset.weaponType = '';
        slot.dataset.itemType = item ? item.type : '';
        if (label) label.textContent = isExtra ? 'X' : String(i+1);
        if (cv) {
          const cctx = cv.getContext('2d');
          cctx.clearRect(0,0,cv.width,cv.height);
          if (item) _drawItemIconSmall(cctx, item.type, cv.width, cv.height);
        }
      });
    }

    if (this._puSlots && player.inventory) {
      // Slots 0-4
      this._puSlots.forEach((slot, i) => {
        if (!slot) return;
        const item = player.inventory.slots[i];
        const cv = slot.querySelector('.pu-icon');
        if (item) {
          slot.classList.add('has-item');
          slot.classList.remove('harmful-item');
          slot.dataset.itemType = item.type;
          if (cv) _drawItemIconSmall(cv.getContext('2d'), item.type, cv.width, cv.height);
        } else {
          slot.classList.remove('has-item','harmful-item');
          slot.dataset.itemType = '';
          if (cv) cv.getContext('2d').clearRect(0,0,cv.width,cv.height);
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
          extraSlot.dataset.itemType = ex.type;
          if (cv) _drawItemIconSmall(cv.getContext('2d'), ex.type, cv.width, cv.height);
        } else {
          extraSlot.classList.remove('has-item','extra-slot-active');
          extraSlot.classList.add('hidden-slot');
          extraSlot.dataset.itemType = '';
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
    const pulse = 0.65 + 0.35 * Math.sin(Date.now() * 0.01);
    for (const e of enemies){
      if(e.dead)continue;
      const ex=e.x*sx, ey=e.y*sy;
      ctx.fillStyle=e.color||'#ff3355';
      ctx.shadowColor=e.color||'#ff3355';
      ctx.shadowBlur=5;
      ctx.beginPath();ctx.arc(ex,ey,2.8,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(255,80,100,'+(0.45+0.35*pulse)+')';
      ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(ex,ey,5.2,0,Math.PI*2);ctx.stroke();
    }
    if (!player.rebuilding){
      ctx.fillStyle='#00d4ff'; ctx.shadowColor='#00d4ff'; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.arc(player.x*sx,player.y*sy,3.5,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    }
  }
}
