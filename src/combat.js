// Projéteis tracer, colisões, reconstrução ao perder vida.
import { ARENA_W, ARENA_H } from './arena.js';
import { spawnDamageNumber } from './enemies.js';

export class CombatSystem {
  constructor(arena) {
    this.arena=arena;
    this.bullets=[];
    this.missiles=[];
    this.mines=[];
    this.explosions=[];
    this._enemyMgr=null;
    this._audio=null;
    this._collisionCd=0;
    this._pvp=null;
  }

  setEnemyManager(mgr) { this._enemyMgr=mgr; }
  setAudio(audio) { this._audio=audio; }

  // Contexto do modo "Equipe Online" (PvP): jogadores remotos, bots locais,
  // time do jogador local e referência de rede para reportar abates.
  setPvpContext(ctx) { this._pvp=ctx; }

  // Retorna a lista de "alvos PvP" vivos do time adversário ao `team`
  // (jogadores remotos reais + bots simulados localmente).
  _pvpTargets(team) {
    if (!this._pvp) return [];
    const list=[];
    for (const rp of Object.values(this._pvp.peers||{})) {
      if (!rp.dead && rp.team && rp.team!==team) list.push(rp);
    }
    for (const bot of (this._pvp.bots||[])) {
      if (!bot.dead && bot.team!==team) list.push(bot);
    }
    return list;
  }

  // Reporta um abate uma única vez — quem atirou é quem relata. `victim`
  // pode ser um RemotePlayer (jogador real) ou um TeamBot (simulado pelo
  // anfitrião). `shooterIsLocalPlayer` indica se foi a nave do jogador local
  // (vs. um bot do anfitrião) que disparou o tiro fatal.
  _reportPvpKill(shooterName, shooterTeam, victim, shooterIsBot=false, shooterId=null) {
    const payload = {
      type:'kill',
      killerName: shooterName, killerTeam: shooterTeam,
      victimName: victim.name, victimTeam: victim.team,
      isBot: !!victim.isBot,
    };
    if (shooterIsBot && shooterId!=null) this._pvp?.net?.sendBotEvent(shooterId, payload);
    else this._pvp?.net?.sendEvent(payload);
  }

  // Evita spam de som quando várias colisões ocorrem no mesmo frame/sequência
  _playCollisionSfx(strength=1) {
    if (!this._audio||this._collisionCd>0) return;
    this._collisionCd=0.09;
    this._audio.playCollision(strength);
  }

  launchMissiles(px, py, enemies, player, count=3) {
    // Encontra os N inimigos vivos mais próximos
    const alive = enemies.filter(e => !e.dead && !e.isRespawning);
    // Ordena por distância
    alive.sort((a,b) => Math.hypot(a.x-px,a.y-py) - Math.hypot(b.x-px,b.y-py));
    const targets = alive.slice(0, count);

    // Ângulos de leque para os mísseis saírem (distribuídos uniformemente)
    for (let i = 0; i < count; i++) {
      const target = targets[i] ?? targets[targets.length-1] ?? null;
      const baseAngle = target
        ? Math.atan2(target.y - py, target.x - px)
        : -Math.PI/2;
      // spread total de ~1.2rad dividido pelo count
      const spread = count > 1 ? (i - (count-1)/2) * (1.1 / (count-1)) : 0;
      const a = baseAngle + spread;
      this.missiles.push({
        x: px, y: py,
        vx: Math.cos(a) * 180,
        vy: Math.sin(a) * 180,
        angle: a,
        target,
        damage: 90,
        life: 4.5,
        trail: [],
        _player: player,
        _age: 0,
      });
    }
  }

  spawnExplosion(x,y,r,color) {
    this.explosions.push({x,y,r,maxR:r,color,life:1});
    this.arena.spawnParticles(x,y,color,10,150);
  }

  update(dt, player, enemies) {
    const isContra1=this._enemyMgr?.mode==='contra1';
    if (this._collisionCd>0) this._collisionCd-=dt;

    this.bullets=this.bullets.filter(b=>{
      b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
      if (!b.trail) b.trail=[];
      b.trail.push({x:b.x,y:b.y});
      if (b.trail.length>6) b.trail.shift();
      if (b.life<=0||b.x<-80||b.x>ARENA_W+80||b.y<-80||b.y>ARENA_H+80) return false;

      const r=b.r??5;

      if (b.owner==='player') {
        let hitAny = false;
        for (const e of enemies) {
          if (e.dead||e.isRespawning) continue;
          if (b._hitEnemies?.has(e)) continue; // piercing: não acerta o mesmo inimigo duas vezes
          if (Math.hypot(b.x-e.x,b.y-e.y)<e.r+r) {
            e.hp-=b.damage;
            spawnDamageNumber(e.x + (Math.random()-0.5)*e.r, e.y - e.r, b.damage);
            if (b.vampire && b._player) b._player.heal(Math.round(b.damage*0.3));
            if (e.hp<=0) {
              if (isContra1) {
                this._enemyMgr.enemyLostLife(e,this.arena,{spawnAt:()=>{}});
                player.score+=10; player.addXP(20);
              } else {
                e.dead=true; player.kills++; player.score+=e.score; player.addXP(e.score);
              }
            }
            this.spawnExplosion(b.x,b.y,r*3,b.owner_color||'#ffffff');
            if (b.piercing) {
              if (!b._hitEnemies) b._hitEnemies = new Set();
              b._hitEnemies.add(e);
              hitAny = true; // continua voando
            } else {
              return false;
            }
          }
        }
        if (hitAny && b.piercing) return true; // mantém a bala
      } else if (b.owner==='enemy') {
        if (!player.dead&&!player.rebuilding&&player.invincible<=0&&Math.hypot(b.x-player.x,b.y-player.y)<player.r+r) {
          const died=player.takeDamage(b.damage);
          if (died) this._triggerPlayerRebuild(player,isContra1);
          this.spawnExplosion(b.x,b.y,12,b.owner_color||'#ff4466');
          return false;
        }
      }

      // ── PvP (modos "Equipe Online" e "Tower Defense"): projétil vs. jogadores adversários ──
      if (this._pvp?.mode==='equipe_online' || this._pvp?.mode==='tower_defense') {
        const shooterTeam = b.team ?? (b.owner==='player' ? this._pvp.localTeam : null);
        if (shooterTeam) {
          // Vs. jogador local (se o tiro veio de um bot/jogador adversário)
          if (b.owner!=='player' && shooterTeam!==player.team
              && !player.dead && !player.rebuilding && player.invincible<=0
              && Math.hypot(b.x-player.x,b.y-player.y)<player.r+r) {
            const died=player.takeDamage(b.damage);
            if (died) {
              this._triggerPlayerRebuild(player,isContra1);
              const killerName = b.owner==='tower' ? 'Torre Central' : (b.shooter?.name||'Adversário');
              this._reportPvpKill(killerName, shooterTeam,
                { name:player.name, team:player.team, isBot:false },
                !!b.shooterIsBot, b.shooter?.id);
            }
            this.spawnExplosion(b.x,b.y,12,b.owner_color||'#ff4466');
            return false;
          }
          // Vs. jogadores remotos / bots adversários
          for (const target of this._pvpTargets(shooterTeam)) {
            if (Math.hypot(b.x-target.x,b.y-target.y)<(target.r||30)+r) {
              target.hp-=b.damage;
              spawnDamageNumber(target.x+(Math.random()-0.5)*30, target.y-30, b.damage);
              if (target.hp<=0 && !target.dead) {
                target.dead=true;
                target.startDeath?.();
                if (b.owner==='player') { player.kills++; player.score+=15; player.addXP(15); }
                else if (b.shooter) { b.shooter.kills++; b.shooter.score+=15; }
                const killerName = b.owner==='player' ? player.name
                  : b.owner==='tower' ? 'Torre Central'
                  : (b.shooter?.name||'Bot');
                this._reportPvpKill(killerName, shooterTeam, target, !!b.shooterIsBot, b.shooter?.id);
              }
              this.spawnExplosion(b.x,b.y,r*3,b.owner_color||'#ffffff');
              return false;
            }
          }
        }
      }
      return true;
    });

    // Colisão corpo a corpo inimigo → player
    for (const e of enemies) {
      if (e.dead||e.isRespawning||player.dead||player.rebuilding||player.invincible>0) continue;
      const d=Math.hypot(e.x-player.x,e.y-player.y);
      if (d<e.r+player.r) {
        // Empurra as naves
        const nx=(player.x-e.x)/d, ny=(player.y-e.y)/d;
        player.vx+=nx*120; player.vy+=ny*120;
        e.vx-=nx*80;       e.vy-=ny*80;
        this._playCollisionSfx(1.3);
        const died=player.takeDamage(e.damage*dt*2.5, true); // colisão física: escudo 50% efetivo
        if (died) this._triggerPlayerRebuild(player,isContra1);
      }
    }

    // Colisão inimigo → inimigo (separação física)
    for (let i=0;i<enemies.length;i++) {
      const a=enemies[i]; if (a.dead||a._dying) continue;
      for (let j=i+1;j<enemies.length;j++) {
        const b=enemies[j]; if (b.dead||b._dying) continue;
        const d=Math.hypot(a.x-b.x,a.y-b.y);
        const minD=a.r+b.r;
        if (d<minD&&d>0.01) {
          const nx=(b.x-a.x)/d, ny=(b.y-a.y)/d;
          const push=(minD-d)*0.5;
          a.x-=nx*push; a.y-=ny*push;
          b.x+=nx*push; b.y+=ny*push;
          const rv=((b.vx-a.vx)*nx+(b.vy-a.vy)*ny)*0.3;
          a.vx+=rv*nx; a.vy+=rv*ny;
          b.vx-=rv*nx; b.vy-=rv*ny;
          this._playCollisionSfx(0.8);
        }
      }
    }

    // Colisão projéteis → asteroides
    if (this.arena?.asteroids) {
      this.bullets=this.bullets.filter(b=>{
        if (!b._hitAst) {
          const a=this.arena.checkAsteroidCollision(b.x,b.y,4,b.damage*0.5);
          if (a) { this.spawnExplosion(b.x,b.y,8,'#cc8822'); return false; }
        }
        return true;
      });
    }

    // Colisão player → asteroide (dano e empurrão)
    if (this.arena?.asteroids && !player.dead && !player.rebuilding && player.invincible<=0) {
      const a=this.arena.checkAsteroidCollision(player.x,player.y,player.r,0);
      if (a) {
        const d=Math.hypot(a.x-player.x,a.y-player.y)||1;
        const nx=(player.x-a.x)/d, ny=(player.y-a.y)/d;
        player.vx+=nx*180; player.vy+=ny*180;
        this._playCollisionSfx(1.6);
        const died=player.takeDamage(18*dt, true); // colisão asteroide: escudo 50% efetivo
        if (died) this._triggerPlayerRebuild(player,isContra1);
      }
    }

    // Colisão inimigos → asteroides (empurrão)
    if (this.arena?.asteroids) {
      for (const e of enemies) {
        if (e.dead||e._dying) continue;
        const a=this.arena.checkAsteroidCollision(e.x,e.y,e.r,0);
        if (a) {
          const d=Math.hypot(a.x-e.x,a.y-e.y)||1;
          const nx=(e.x-a.x)/d, ny=(e.y-a.y)/d;
          e.vx+=nx*100; e.vy+=ny*100;
        }
      }
    }

    this.explosions=this.explosions.filter(ex=>{ex.life-=dt*2.8;return ex.life>0;});

    // ── Minas de proximidade ─────────────────────────────────
    this._updateMines(dt, enemies, player);

    // ── Mísseis teleguiados ──────────────────────────────────
    this.missiles = this.missiles.filter(m => {
      m._age += dt;
      m.life -= dt;
      if (m.life <= 0) return false;

      // Recalcula alvo (pode ter morrido)
      if (m.target?.dead || m.target?.isRespawning) {
        const alive2 = enemies.filter(e => !e.dead && !e.isRespawning);
        alive2.sort((a,b)=>Math.hypot(a.x-m.x,a.y-m.y)-Math.hypot(b.x-m.x,b.y-m.y));
        m.target = alive2[0] ?? null;
      }

      if (m.target) {
        const tdx = m.target.x - m.x, tdy = m.target.y - m.y;
        const td = Math.hypot(tdx, tdy) || 1;
        const wantAngle = Math.atan2(tdy, tdx);
        // Suaviza a virada do míssil (turn rate cresce com idade até ficar bem ágil)
        const turnRate = Math.min(3.5 + m._age * 2, 7);
        let da = wantAngle - m.angle;
        // Normaliza delta ângulo para [-π, π]
        while (da > Math.PI) da -= Math.PI*2;
        while (da < -Math.PI) da += Math.PI*2;
        m.angle += Math.sign(da) * Math.min(Math.abs(da), turnRate * dt);
      }

      // Acelera ao longo do tempo (até 380 px/s)
      const spd = Math.min(180 + m._age * 120, 380);
      m.vx = Math.cos(m.angle) * spd;
      m.vy = Math.sin(m.angle) * spd;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // Rastro
      m.trail.push({x: m.x, y: m.y});
      if (m.trail.length > 12) m.trail.shift();

      // Fora da arena
      if (m.x < -200 || m.x > ARENA_W+200 || m.y < -200 || m.y > ARENA_H+200) return false;

      // Colisão com inimigos
      for (const e of enemies) {
        if (e.dead || e.isRespawning) continue;
        if (Math.hypot(m.x-e.x, m.y-e.y) < e.r + 8) {
          e.hp -= m.damage;
          spawnDamageNumber(e.x, e.y - e.r, m.damage);
          this.spawnExplosion(m.x, m.y, 36, '#ff6600');
          this.arena.spawnParticles(m.x, m.y, '#ff8800', 14, 100);
          if (e.hp <= 0) {
            e.dead = true;
            m._player.kills++;
            m._player.score += e.score;
            m._player.addXP(e.score);
          }
          return false;
        }
      }
      return true;
    });
  }

  _triggerPlayerRebuild(player, isContra1) {
    this.arena.spawnParticles(player.x,player.y,'#ff4466',20,200);
    this.spawnExplosion(player.x,player.y,60,'#ff4466');
    if (isContra1) {
      this._enemyMgr?.playerLostLife();
      // Iniciar fase de reconstrução (30s)
      player.startRebuild(player.x,player.y);
    } else {
      player.startRebuild(player.x,player.y);
    }
  }

  draw(ctx) {
    for (const b of this.bullets) this._drawTracer(ctx,b);
    for (const m of this.missiles) this._drawMissile(ctx, m);
    for (const mine of this.mines) this._drawMine(ctx, mine);
    for (const ex of this.explosions) {
      ctx.save();
      ctx.globalAlpha=ex.life*0.55;
      const g=ctx.createRadialGradient(ex.x,ex.y,0,ex.x,ex.y,ex.maxR*(2-ex.life));
      g.addColorStop(0,ex.color+'ff'); g.addColorStop(.5,ex.color+'88'); g.addColorStop(1,'transparent');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ex.x,ex.y,ex.maxR*(2-ex.life),0,Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  _drawTracer(ctx,b) {
    const color=b.owner_color||'#ffffff';
    const isEnemy=b.owner==='enemy';
    const spd=Math.hypot(b.vx,b.vy);
    const len=Math.min(spd*0.065,42);
    const tail={x:b.x-(b.vx/spd)*len, y:b.y-(b.vy/spd)*len};
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle=color+'22'; ctx.lineWidth=isEnemy?7:9; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(tail.x,tail.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    ctx.strokeStyle=color+'aa'; ctx.lineWidth=isEnemy?2.5:3;
    ctx.beginPath(); ctx.moveTo(tail.x,tail.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=isEnemy?1.2:1.5;
    ctx.beginPath(); ctx.moveTo(tail.x,tail.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    ctx.shadowColor=color; ctx.shadowBlur=14;
    const headR=isEnemy?2.5:3;
    const gHead=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,headR*2);
    gHead.addColorStop(0,'#ffffff'); gHead.addColorStop(0.4,color); gHead.addColorStop(1,color+'00');
    ctx.fillStyle=gHead; ctx.beginPath(); ctx.arc(b.x,b.y,headR*2,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0; ctx.restore();
  }

  _drawMissile(ctx, m) {
    // Rastro laranja
    if (m.trail.length > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < m.trail.length; i++) {
        const t = i / m.trail.length;
        ctx.strokeStyle = `rgba(255,${Math.round(80+t*80)},0,${t*0.7})`;
        ctx.lineWidth = t * 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.trail[i-1].x, m.trail[i-1].y);
        ctx.lineTo(m.trail[i].x, m.trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Corpo do míssil
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle + Math.PI/2);
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 10;
    // Fuselagem
    ctx.fillStyle = '#cc4400';
    ctx.beginPath();
    ctx.moveTo(0, -11); ctx.lineTo(4, -2); ctx.lineTo(3, 6);
    ctx.lineTo(-3, 6); ctx.lineTo(-4, -2);
    ctx.closePath(); ctx.fill();
    // Cone
    ctx.fillStyle = '#ff9933';
    ctx.beginPath(); ctx.moveTo(0,-11); ctx.lineTo(3,-5); ctx.lineTo(-3,-5); ctx.closePath(); ctx.fill();
    // Aletas
    ctx.fillStyle = '#882200';
    ctx.beginPath(); ctx.moveTo(3,2); ctx.lineTo(8,7); ctx.lineTo(3,6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-3,2); ctx.lineTo(-8,7); ctx.lineTo(-3,6); ctx.closePath(); ctx.fill();
    // Chama do propulsor
    const flameLen = 8 + Math.random() * 6;
    ctx.fillStyle = '#ffcc44';
    ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(2,6); ctx.lineTo(-2,6); ctx.lineTo(0,6+flameLen); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Mina de proximidade: fica armada no local onde foi solta e detona quando
  // um inimigo chega perto (ou expira sozinha) — diferente do NUKE (explosão
  // instantânea), recompensa posicionamento/atrair inimigos para a área.
  deployMine(x,y,player) {
    this.mines.push({
      x, y, player,
      armTimer: 0.6,   // tempo até a mina ficar ativa (evita auto-detonação imediata)
      life: 14,        // some sozinha se nada se aproximar
      triggerR: 70,    // raio de detecção que detona a mina
      blastR: 200,     // raio de dano da explosão
      pulse: 0,
    });
  }

  _updateMines(dt, enemies, player) {
    this.mines = this.mines.filter(mine => {
      mine.life -= dt;
      mine.pulse += dt;
      if (mine.armTimer > 0) { mine.armTimer -= dt; if (mine.life<=0) return false; return true; }
      if (mine.life <= 0) return false;

      for (const e of enemies) {
        if (e.dead||e.isRespawning) continue;
        if (Math.hypot(e.x-mine.x, e.y-mine.y) < mine.triggerR + e.r) {
          this.triggerBomb(mine.x, mine.y, enemies, mine.player||player, mine.blastR);
          this._audio?.playBomb?.();
          return false;
        }
      }
      return true;
    });
  }

  _drawMine(ctx, mine) {
    const armed = mine.armTimer <= 0;
    const pulse = 0.5 + Math.sin(mine.pulse*5)*0.5;
    ctx.save();
    ctx.translate(mine.x, mine.y);
    // Anel de detecção (só quando armada)
    if (armed) {
      ctx.globalAlpha = 0.18 + pulse*0.12;
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0,0,mine.triggerR,0,Math.PI*2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Corpo da mina
    ctx.fillStyle = '#552200';
    ctx.beginPath(); ctx.arc(0,0,11,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ff8800'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0,11,0,Math.PI*2); ctx.stroke();
    // Luz central piscante (vermelha = armada, amarela = armando)
    ctx.shadowColor = armed ? '#ff2200' : '#ffaa00';
    ctx.shadowBlur = 10 + pulse*8;
    ctx.fillStyle = armed ? `rgba(255,${Math.round(40+pulse*60)},0,1)` : '#ffaa00';
    ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  triggerBomb(x,y,enemies,player,R=230) {
    const color=R>300?'#ff2200':'#ff4400';
    this.spawnExplosion(x,y,R,color);
    this.arena.spawnParticles(x,y,'#ff8800',R>300?32:22,R*0.9);
    for (const e of enemies) {
      if (e.dead||e.isRespawning) continue;
      const d=Math.hypot(e.x-x,e.y-y);
      if (d<R){const dmg=Math.round(90*(1-d/R));e.hp-=dmg;spawnDamageNumber(e.x,e.y-e.r,dmg);if(e.hp<=0){e.dead=true;player.kills++;player.score+=e.score;player.addXP(e.score);}}
    }
  }
}
