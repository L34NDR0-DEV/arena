import { Arena, ARENA_W, ARENA_H, ARENA_TYPES, ARENA_W_DEFAULT, ARENA_H_DEFAULT, setArenaSize } from './arena.js';
import { Player, drawCrosshair }                from './player.js';
import { EnemyManager }                          from './enemies.js';
import { ItemManager, BorderEffect }              from './items.js';
import { CombatSystem }                          from './combat.js';
import { TowerManager }                          from './towers.js';
import { UI }                                    from './ui.js';
import { AudioEngine }                           from './audio.js';
import { NetworkClient, RemotePlayer }           from './network.js';
import * as SkinsModule                          from './skins.js';

const MATCH_DURATION = 300;
const CONTRA1_LIVES  = 5;

export class Game {
  constructor(canvas, { skinIndex=0, playerName='Jogador', mode='contra1', difficulty='moderado', roomId='default' } = {}) {
    this.canvas=canvas; this.ctx=canvas.getContext('2d');
    this.W=canvas.width; this.H=canvas.height;
    this.mode=mode; this.diff=difficulty;
    this.camX=0; this.camY=0;

    // Modo Teste: arena bem menor para visualizar os 4 cantos/torres com facilidade
    if (mode==='teste') setArenaSize(Math.round(ARENA_W_DEFAULT*0.35), Math.round(ARENA_H_DEFAULT*0.35));
    else setArenaSize(ARENA_W_DEFAULT, ARENA_H_DEFAULT);

    const arenaEl=document.getElementById('arena-select');
    const arenaType=arenaEl?(arenaEl.value||'nebulosa'):'nebulosa';

    this.arena    = new Arena(this.W, this.H, arenaType);
    this.itemMgr  = new ItemManager();
    this.enemyMgr = new EnemyManager(mode, difficulty);
    this.combat   = new CombatSystem(this.arena);
    this.combat.setEnemyManager(this.enemyMgr);
    this.ui       = new UI();
    this.player   = new Player({ x:ARENA_W/2, y:ARENA_H/2, skinIndex, name:playerName });

    // Torres Astrais — disponíveis no modo Teste
    this.towerMgr = mode==='teste' ? new TowerManager() : null;

    // Sistema de vidas Contra1
    this._playerLives = mode==='contra1' ? CONTRA1_LIVES : Infinity;
    this.player._lifeTimer = 0;

    this._audio = new AudioEngine();
    this.player.setAudio(this._audio);
    this.enemyMgr.setAudio(this._audio);
    this.combat.setAudio(this._audio);

    this.peers={}; this.net=null; this._netT=0;
    this.borderEffect=new BorderEffect();

    this.timeLeft=MATCH_DURATION;
    this.over=false; this.paused=false;
    this._rafId=null; this._last=0;

    this._keys={}; this._mouse={wx:ARENA_W/2,wy:ARENA_H/2,left:false,right:false};
    this._bindInput();
    this._connectNet(playerName,skinIndex,roomId);
  }

  onResize(w,h) { this.W=w; this.H=h; this.arena.resize(w,h); }

  _screenToWorld(ex,ey) {
    const r=this.canvas.getBoundingClientRect();
    const ZOOM=0.65;
    const sx=(ex-r.left)*(this.W/r.width);
    const sy=(ey-r.top)*(this.H/r.height);
    return {
      wx: (sx - this.W/2) / ZOOM + this.W/2 + this.camX,
      wy: (sy - this.H/2) / ZOOM + this.H/2 + this.camY,
    };
  }

  _bindInput() {
    this._onKey=e=>{
      this._keys[e.code]=e.type==='keydown';
      if (e.code==='Space') e.preventDefault();
      if (e.type==='keydown'&&e.code==='Escape') window.togglePause?.();
      if (e.type==='keydown'&&e.code==='KeyM')   this._audio.toggleMute();
      if (e.type==='keydown') {
        const slotMap={'Digit1':0,'Digit2':1,'Digit3':2,'Digit4':3,'Digit5':4,'KeyX':5};
        const slot = slotMap[e.code];
        if (slot!==undefined && !this.paused && !this.over && !this.player.dead) {
          const result=this.player.useItem(slot);
          if (result) {
            this.player.notifyItemUsed(); // reseta timer de inatividade
            this.borderEffect.trigger(result.color||'#ffffff', result.itemType==='GODMODE'?2.5:1.2);
            const bonus = slot===5 ? ' (BÔNUS!)' : '';
            const px=this.player.x, py=this.player.y;
            const en=this.enemyMgr.enemies;
            if (result.type==='bomb') {
              this.combat.triggerBomb(px,py,en,this.player);
              this.ui.notify('BOMBA!'+bonus,'#ff4400'); this._audio.playBomb?.();
            } else if (result.type==='nuke') {
              this.combat.triggerBomb(px,py,en,this.player,420);
              this.arena.spawnParticles(px,py,'#ff4400',30,280);
              this.ui.notify('☢ NUKE!'+bonus,'#ff2200'); this._audio.playBomb?.();
            } else if (result.type==='freeze') {
              for(const e of en){if(!e.dead&&Math.hypot(e.x-px,e.y-py)<320)e._state='dodge';}
              this.ui.notify('❄ FREEZE!'+bonus,'#88ddff');
            } else if (result.type==='nova') {
              // Pulso que destrói todos os inimigos na tela
              for(const e of en){if(!e.dead){e.hp=0;e.dead=true;this.player.kills++;this.player.score+=e.score;this.player.addXP(e.score);}}
              this.arena.spawnParticles(px,py,'#ff00ff',35,300);
              this.combat.spawnExplosion(px,py,200,'#ff00ff');
              this.ui.notify('★ NOVA!'+bonus,'#ff00ff'); this._audio.playBomb?.();
            } else if (result.type==='warp') {
              // Teleporta para o cursor do mouse
              this.player.x=this._mouse.wx; this.player.y=this._mouse.wy;
              this.player.vx=0; this.player.vy=0;
              this.arena.spawnParticles(px,py,'#aa44ff',20,180);
              this.arena.spawnParticles(this.player.x,this.player.y,'#aa44ff',20,180);
              this.ui.notify('⚡ WARP!'+bonus,'#aa44ff');
            } else if (result.type==='missile') {
              const count = bonus ? 5 : 3;
              this.combat.launchMissiles(px, py, this.enemyMgr.enemies, this.player, count);
              this.ui.notify('🚀 MÍSSEIS!'+bonus,'#ff6600'); this._audio.playBomb?.();
            } else {
              const nl={
                HEALTH:'+Vida',HEALTH_BIG:'+Vida Grande!',
                SHIELD:'+Escudo',SHIELD_BIG:'+Escudo Grande!',
                MANA:'+Mana',MANA_FULL:'Mana Cheia!',
                RAPID:'Turbo Tiro!',MULTISHOT:'Tiro Triplo!',PIERCING:'Perfurante!',
                MAGNET:'Ímã!',BOOST:'Velocidade!',DASH_BOOST:'Super Dash!',
                FREEZE:'Freeze!',REGEN:'Regeneração!',SHIELD_AURA:'Aura de Escudo!',
                OVERCLOCK:'Sobrecarga de Dano!',INVISIBLE:'Invisível!',
                GODMODE:'★ MODO DEUS!',VAMPIRO:'Vampiro!',MISSILE:'Mísseis!',
              };
              this.ui.notify((nl[result.itemType]||'Item usado')+bonus, result.color||'#00ff88');
            }
          }
        }
      }
    };
    this._onMouseMove=e=>{
      const {wx,wy}=this._screenToWorld(e.clientX,e.clientY);
      this._mouse.wx=wx; this._mouse.wy=wy;
      if (this._mouse.right&&!this.paused&&!this.over&&!this.player.dead)
        this.player.moveTo(wx,wy);
    };
    this._onMouseDown=e=>{
      this._audio.resume();
      if (e.button===0) { this._mouse.left=true; }
      else if (e.button===2) {
        this._mouse.right=true;
        const {wx,wy}=this._screenToWorld(e.clientX,e.clientY);
        this._mouse.wx=wx; this._mouse.wy=wy;
        if (!this.paused&&!this.over&&!this.player.dead) this.player.moveTo(wx,wy);
      }
    };
    this._onMouseUp=e=>{ if(e.button===0)this._mouse.left=false; if(e.button===2)this._mouse.right=false; };
    this._onCtx=e=>e.preventDefault();
    window.addEventListener('keydown',this._onKey);
    window.addEventListener('keyup',this._onKey);
    this.canvas.addEventListener('mousemove',this._onMouseMove);
    this.canvas.addEventListener('mousedown',this._onMouseDown);
    window.addEventListener('mouseup',this._onMouseUp);
    this.canvas.addEventListener('contextmenu',this._onCtx);
  }

  _unbindInput() {
    window.removeEventListener('keydown',this._onKey);
    window.removeEventListener('keyup',this._onKey);
    this.canvas.removeEventListener('mousemove',this._onMouseMove);
    this.canvas.removeEventListener('mousedown',this._onMouseDown);
    window.removeEventListener('mouseup',this._onMouseUp);
    this.canvas.removeEventListener('contextmenu',this._onCtx);
  }

  _connectNet(name,skinIndex,roomId) {
    try {
      const proto=location.protocol==='https:'?'wss':'ws';
      this.net=new NetworkClient(`${proto}://${location.host}`,{
        onWelcome:()=>this.net.join(name,skinIndex,roomId),
        onJoin:msg=>{ const rp=new RemotePlayer({id:msg.id,name:msg.name,skinIndex:msg.skinIndex,skins:SkinsModule}); this.peers[msg.id]=rp; this.ui.killFeed(`${msg.name} entrou`); },
        onLeave:msg=>delete this.peers[msg.id],
        onState:msg=>this.peers[msg.id]?.applyState(msg.data),
        onEvent:msg=>{ if(msg.data?.type==='kill') this.ui.killFeed(`${msg.data.killerName} eliminou ${msg.data.victimName}`); },
      });
    } catch {}
  }

  _input() {
    return {
      shooting:   this._mouse.left,
      space:      this._keys['Space'],
      holdRight:  this._mouse.right,
      dash:       this._keys['ShiftLeft']||this._keys['ShiftRight'],
      worldMouseX:this._mouse.wx,
      worldMouseY:this._mouse.wy,
    };
  }

  start() { this._last=performance.now(); this._audio.startEngine(0.4); this._loop(this._last); }
  pause()  { this.paused=true; this._audio.setEngineIntensity(0); }
  resume() { this.paused=false; this._last=performance.now(); this._audio.resume(); this._loop(performance.now()); }
  surrender() { this._endGame(false); }

  _loop(now) {
    if (this.over) return;
    this._rafId=requestAnimationFrame(t=>this._loop(t));
    if (this.paused) return;
    const dt=Math.min((now-this._last)/1000,0.05);
    this._last=now;
    this._update(dt);
    this._draw();
  }

  _update(dt) {
    // Cooldown de vida do player
    if (this.player._lifeTimer>0) this.player._lifeTimer-=dt;

    // Contra1: verificar fim por vidas
    if (this.mode==='contra1') {
      const res=this.enemyMgr.livesResult;
      if (res==='player_win') { this._endGame(true); return; }
      if (res==='enemy_win'||this.enemyMgr.playerLives<=0) { this._endGame(false); return; }
    } else {
      this.timeLeft-=dt;
      if (this.timeLeft<=0) { this._endGame(true); return; }
    }
    if (this.player.dead&&this.player.deathTimer<=0&&this.mode!=='contra1') { this._endGame(false); return; }

    // Torres Astrais: vitória ao capturar as 2 torres do lado adversário
    if (this.towerMgr?.winner) {
      const won = this.towerMgr.winner==='player';
      if (won) { this.player.score+=200; this.ui.notify('★ TORRES CONQUISTADAS! VITÓRIA!','#ffcc00'); }
      this._endGame(won);
      return;
    }

    const tcx=this.player.x-this.W/2, tcy=this.player.y-this.H/2;
    this.camX+=(tcx-this.camX)*Math.min(1,7*dt);
    this.camY+=(tcy-this.camY)*Math.min(1,7*dt);
    this.camX=Math.max(0,Math.min(ARENA_W-this.W,this.camX));
    this.camY=Math.max(0,Math.min(ARENA_H-this.H,this.camY));

    this.arena.update(dt);
    this.player.update(dt,this._input(),this.combat.bullets);

    // ── Item descartado por inatividade ──────────────────────
    const ejected = this.player.consumeEjectedItem();
    if (ejected) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 120 + Math.random() * 80;
      const ex    = this.player.x + Math.cos(angle) * 40;
      const ey    = this.player.y + Math.sin(angle) * 40;
      this.itemMgr.spawnEjected(ex, ey, ejected.type, Math.cos(angle)*spd, Math.sin(angle)*spd);
      this.arena.spawnParticles(this.player.x, this.player.y, ejected.def?.color||'#ffffff', 16, 140);
      this.ui.notify('Descartou: '+ejected.def?.label, ejected.def?.color||'#aaaaaa');
    }

    this.enemyMgr.update(dt,this.player,this.combat.bullets,this.arena,this.itemMgr,this.towerMgr?.towers);

    if (this.towerMgr) {
      this.towerMgr.update(dt,this.player,this.enemyMgr.enemies,this.combat.bullets);
      this._resolveTowerCombat(dt);
    }

    const hasExtra = this.player.inventory.isExtraFull();
    this.itemMgr.update(dt,this.player.x,this.player.y,this.player.hasMagnet,hasExtra);
    this.borderEffect.update(dt);
    for (const it of this.itemMgr.collect(this.player.x,this.player.y)) {
      const sp=this.player.collectItem(it);
      this.arena.spawnParticles(it.x,it.y,it.def.color,7,90);
      if (!sp) continue;
      if (sp.type==='stored') {
        const label = sp.extra ? '[X] '+it.def.label+' (bônus!)' : '['+it.def.label+'] slot '+(sp.slot+1);
        this.ui.notify(label, it.def.color);
      } else if (sp.type==='harmful') {
        this.borderEffect.trigger(it.def.color,0.8);
        this.ui.notify(it.def.desc,'#ff2255');
      }
    }

    // Inimigos coletam itens (apenas malefícios — afetam o player)
    for (const en of this.enemyMgr.enemies) {
      if (en.dead || en.isRespawning) continue;
      for (const it of this.itemMgr.collect(en.x, en.y, 18)) {
        if (it.def.harmful) {
          // Inimigo "usa" o malefício no player
          this.player.applyHarmful(it.type);
          this.arena.spawnParticles(it.x,it.y,it.def.color,6,70);
          this.borderEffect.trigger(it.def.color,0.8);
          this.ui.notify('Inimigo usou '+it.def.label+'!','#ff2255');
        }
      }
    }

    this.combat.update(dt,this.player,this.enemyMgr.enemies);
    for (const id in this.peers) this.peers[id].update(dt);

    this._netT-=dt;
    if (this._netT<=0&&this.net?.connected) { this._netT=0.05; this.net.sendState({x:this.player.x,y:this.player.y,angle:this.player.angle,hp:this.player.hp,score:this.player.score,dead:this.player.dead}); }

    // Atualiza HUD
    const pLives=this.mode==='contra1'?this.enemyMgr.playerLives:null;
    const eLives=this.mode==='contra1'?this.enemyMgr.enemyLives:null;
    this.ui.update(this.player,this.timeLeft,this.enemyMgr.enemyScore,pLives,eLives,this.enemyMgr.maxLives,this.mode);
  }

  // Resolve combate envolvendo Torres Astrais: projéteis e colisões físicas
  // contra torres, de qualquer time (jogador, inimigos e as próprias torres).
  _resolveTowerCombat(dt) {
    const towers=this.towerMgr;
    const player=this.player;
    const enemies=this.enemyMgr.enemies;

    const handleCapture=(hit, attackerIsPlayer)=>{
      if (!hit) return;
      this.arena.spawnParticles(hit.tower.x,hit.tower.y,hit.tower.color,24,220);
      this._audio.playExplosion(2);
      if (hit.destroyed) {
        const label = hit.newOwner==='player' ? 'TORRE CONQUISTADA!' : 'Torre perdida para o inimigo!';
        const color = hit.newOwner==='player' ? '#00d4ff' : '#ff3355';
        this.ui.notify(label,color);
        if (attackerIsPlayer) { player.score+=60; player.addXP(40); }
      }
    };

    // Projéteis vs torres (jogador e inimigos podem destruir/capturar)
    this.combat.bullets=this.combat.bullets.filter(b=>{
      if (b.owner==='tower') return true; // tratado abaixo (tower vs ships)
      const team = b.owner==='player' ? 'player' : 'enemy';
      const hit=towers.damageNearest(b.x,b.y,b.r??5,b.damage,team);
      if (hit) {
        this.combat.spawnExplosion(b.x,b.y,14,b.owner_color||'#ffffff');
        handleCapture(hit, team==='player');
        return false;
      }
      return true;
    });

    // Projéteis das torres vs naves (jogador / inimigos)
    this.combat.bullets=this.combat.bullets.filter(b=>{
      if (b.owner!=='tower') return true;
      const r=b.r??4;
      if (b.team==='enemy') {
        if (!player.dead&&!player.rebuilding&&player.invincible<=0&&Math.hypot(b.x-player.x,b.y-player.y)<player.r+r) {
          const died=player.takeDamage(b.damage);
          if (died) this._triggerTowerKillPlayer();
          this.combat.spawnExplosion(b.x,b.y,12,b.owner_color);
          return false;
        }
      } else {
        for (const e of enemies) {
          if (e.dead||e.isRespawning) continue;
          if (Math.hypot(b.x-e.x,b.y-e.y)<e.r+r) {
            e.hp-=b.damage;
            this.combat.spawnExplosion(b.x,b.y,12,b.owner_color);
            return false;
          }
        }
      }
      return true;
    });

    // Colisão física: nave do jogador atravessando uma torre
    {
      const hit=towers.damageNearest(player.x,player.y,player.r,90*dt,'player');
      if (hit) handleCapture(hit, true);
    }
    // Colisão física: inimigos atravessando uma torre
    for (const e of enemies) {
      if (e.dead||e._dying) continue;
      const hit=towers.damageNearest(e.x,e.y,e.r,70*dt,'enemy');
      if (hit) handleCapture(hit, false);
    }
  }

  _triggerTowerKillPlayer() {
    const isContra1=this.mode==='contra1';
    this.combat._triggerPlayerRebuild(this.player,isContra1);
  }

  _draw() {
    const ctx=this.ctx; const {W,H}=this;
    const ZOOM=0.65; // zoom out: ver mais arena
    const camX=this.camX, camY=this.camY;

    this.arena.drawBackground(ctx,camX,camY);
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-W/2 - camX, -H/2 - camY);

    this.arena.drawBorder(ctx);
    this.arena.drawAsteroids(ctx);
    this.towerMgr?.draw(ctx);
    this.itemMgr.draw(ctx);
    this.enemyMgr.draw(ctx);
    for (const id in this.peers) this.peers[id].draw(ctx);
    this.combat.draw(ctx);
    this.player.draw(ctx);
    this.arena.drawParticles(ctx);

    // Mira espiral (em coords mundo)
    if (!this.player.dead&&!this.paused) drawCrosshair(ctx,this._mouse.wx,this._mouse.wy,this.player._age);
    ctx.restore();

    // Efeito de borda ao usar item (em coords tela)
    this.borderEffect.draw(ctx, W, H);

    const mm=document.getElementById('minimap');
    if (mm) { const mc=mm.getContext('2d'); this.ui.drawMinimap(mc,this.player,this.enemyMgr.enemies,this.itemMgr.items,mm.width,mm.height); }


    // Contra1: HUD de vidas em tela
    if (this.mode==='contra1') this._drawLivesHUD(ctx,W,H);

    if (this._audio._muted) {
      ctx.save(); ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.font='10px system-ui'; ctx.textAlign='right';
      ctx.fillText('SOM MUDO — M',W-10,H-10); ctx.restore();
    }
  }

  _drawLivesHUD(ctx, W, H) {
    const pLives=this.enemyMgr.playerLives;
    const eLives=this.enemyMgr.enemyLives;
    const max=this.enemyMgr.maxLives;
    const sz=14, gap=18, y=H-38;

    // Vidas do player (esquerda)
    ctx.save();
    ctx.font='bold 9px monospace'; ctx.fillStyle='#00c8f0'; ctx.textAlign='left';
    ctx.fillText('VOCÊ',18,y-4);
    for (let i=0;i<max;i++) {
      const filled=i<pLives;
      ctx.fillStyle=filled?'#00c8f0':'#0d2a3a';
      ctx.shadowColor=filled?'#00c8f0':'transparent'; ctx.shadowBlur=filled?8:0;
      ctx.beginPath(); ctx.moveTo(18+i*gap+sz/2,y); ctx.lineTo(18+i*gap+sz,y+sz/2); ctx.lineTo(18+i*gap+sz/2,y+sz); ctx.lineTo(18+i*gap,y+sz/2); ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur=0;

    // Vidas do inimigo (direita)
    ctx.font='bold 9px monospace'; ctx.fillStyle='#ff3355'; ctx.textAlign='right';
    ctx.fillText('INIMIGO',W-18,y-4);
    for (let i=0;i<max;i++) {
      const filled=i<eLives;
      ctx.fillStyle=filled?'#ff3355':'#2a0d14';
      ctx.shadowColor=filled?'#ff3355':'transparent'; ctx.shadowBlur=filled?8:0;
      const px=W-18-(max-1-i)*gap;
      ctx.beginPath(); ctx.moveTo(px+sz/2,y); ctx.lineTo(px+sz,y+sz/2); ctx.lineTo(px+sz/2,y+sz); ctx.lineTo(px,y+sz/2); ctx.closePath(); ctx.fill();
    }
    ctx.shadowBlur=0; ctx.restore();
  }

  _endGame(survived) {
    if (this.over) return;
    this.over=true;
    cancelAnimationFrame(this._rafId);
    this._audio.stopEngine();
    if (!survived) this._audio.playDeath();
    const data={
      win:survived,
      kills:this.player.kills,
      score:this.player.score,
      items:this.player.itemsCollected,
      itemTypeCounts:this.player.itemTypeCounts,
      skinIndex:this.player.skin.id,
      skinName:this.player.skin.name,
      playerName:this.player.name,
      level:this.player.level,
      playerLives:this.enemyMgr.playerLives,
      enemyLives:this.enemyMgr.enemyLives,
    };
    setTimeout(()=>window.showGameOver?.(data),700);
  }

  destroy() {
    this.over=true;
    cancelAnimationFrame(this._rafId);
    this._unbindInput();
    this._audio.stopEngine();
    this.net?.disconnect();
  }
}
