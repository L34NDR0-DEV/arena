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
  setShakeCallback(fn) { this._shake=fn; }
  setHitStopCallback(fn) { this._hitStop=fn; }

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
      if (!bot.dead && bot.team && bot.team!==team) list.push(bot);
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
    // Atualiza o placar local imediatamente — o servidor faz broadcast para os
    // outros, mas não devolve o evento para quem enviou, então registramos aqui.
    this._pvp?.onKill?.(shooterTeam);
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

  // Lança um único míssil teleguiado na direção do tiro (dx,dy) — usado pelo
  // buff temporário do item MISSILE (hasMissileMode). Mira o inimigo vivo mais
  // alinhado com a direção do cursor; se nada estiver no cone de ~60°, cai para
  // o inimigo mais próximo. Reusa 100% do array missiles[] (update/draw/colisão
  // já funcionam sem nenhuma mudança — o campo _player mantém o kill credit).
  launchPlayerMissile(px, py, dx, dy, player) {
    const enemies = this._enemyMgr?.enemies || [];
    const pvpTargets = this._pvpTargets ? this._pvpTargets(player.team) : [];
    const alive = [...enemies.filter(e=>!e.dead&&!e.isRespawning), ...pvpTargets.filter(t=>!t.dead)];
    const d = Math.hypot(dx,dy)||1;
    const ndx=dx/d, ndy=dy/d;

    let target=null, bestScore=-Infinity;
    for (const e of alive) {
      const ex=e.x-px, ey=e.y-py;
      const dist=Math.hypot(ex,ey)||1;
      const align=(ex*ndx+ey*ndy)/dist; // cosseno do ângulo (1 = na mira exata)
      if (align<0.5) continue;          // fora de um cone de ~60°
      const score=align*2-dist/1000;
      if (score>bestScore) { bestScore=score; target=e; }
    }
    if (!target && alive.length) {
      alive.sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py));
      target=alive[0];
    }

    const baseAngle=target ? Math.atan2(target.y-py,target.x-px) : Math.atan2(dy,dx);
    const baseDmg = Math.round((38+(player.level-1)*5)*1.4);
    this.missiles.push({
      x:px, y:py,
      vx:Math.cos(baseAngle)*180, vy:Math.sin(baseAngle)*180,
      angle:baseAngle, target,
      damage:baseDmg,
      life:4.5, trail:[],
      _player:player, _age:0,
    });
  }

  spawnExplosion(x,y,r,color) {
    this.explosions.push({x,y,r,maxR:r,color,life:1});
    const effects = this.arena.effects;
    if (effects) {
      effects.ring(x, y, { color, maxRadius:r, duration:0.36, width:3 });
      effects.burst(x, y, { color, count:10, speed:150 });
    } else {
      this.arena.spawnParticles(x,y,color,10,150);
    }
  }

  _flash(entity, color='#ffffff') {
    this.arena.effects?.flash(entity, { color, duration:0.08 });
  }

  _impactSpark(b, x=b.x, y=b.y, color=b.owner_color||'#ffffff') {
    const dirX = b.dirX ?? (b.vx || 0);
    const dirY = b.dirY ?? (b.vy || 0);
    const d = Math.hypot(dirX, dirY) || 1;
    const angle = Math.atan2(-dirY/d, -dirX/d);
    this.arena.effects?.spark(x, y, angle, { color, count:6, speed:210 });
  }

  _enemyKilled() {
    this._hitStop?.(0.04);
  }

  update(dt, player, enemies) {
    const isContra1=this._enemyMgr?.mode==='contra1';
    if (this._collisionCd>0) this._collisionCd-=dt;

    // Balas a spawnar por efeitos especiais (quantum split, chain) — processado fora do filter
    const _newBullets = [];

    this.bullets=this.bullets.filter(b=>{
      b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;

      // ── Homing: curva em direção ao inimigo mais próximo ──────
      if (b.homing) {
        const alive = enemies.filter(e=>!e.dead&&!e.isRespawning);
        let closest=null, bestD=Infinity;
        for (const e of alive) { const d=Math.hypot(b.x-e.x,b.y-e.y); if(d<bestD){bestD=d;closest=e;} }
        if (closest) {
          const ex=closest.x-b.x, ey=closest.y-b.y;
          const d=Math.hypot(ex,ey)||1;
          const turn=3.8*dt;
          b.vx+=(ex/d)*600*turn; b.vy+=(ey/d)*600*turn;
          const spd=Math.hypot(b.vx,b.vy)||1;
          b.vx=b.vx/spd*380; b.vy=b.vy/spd*380;
        }
      }

      // ── Bounce: quica nas paredes da arena ───────────────────
      if (b.bounces != null && b.bounces > 0) {
        if (b.x <= 0 || b.x >= ARENA_W) { b.vx *= -1; b.bounces--; b.x = Math.max(0, Math.min(ARENA_W, b.x)); }
        if (b.y <= 0 || b.y >= ARENA_H) { b.vy *= -1; b.bounces--; b.y = Math.max(0, Math.min(ARENA_H, b.y)); }
      }

      if (!b.trail) b.trail=[];
      b.trail.push({x:b.x,y:b.y});
      if (b.trail.length>6) b.trail.shift();
      if (b.life<=0||b.x<-80||b.x>ARENA_W+80||b.y<-80||b.y>ARENA_H+80) return false;

      const r = b.size ?? b.r ?? 5;

      if (b.owner==='player') {
        let hitAny = false;
        for (const e of enemies) {
          if (e.dead||e.isRespawning) continue;
          if (b._hitEnemies?.has(e)) continue; // piercing: não acerta o mesmo inimigo duas vezes
          if (Math.hypot(b.x-e.x,b.y-e.y)<e.r+r) {
            e.hp-=b.damage;
            this._flash(e);
            this._impactSpark(b, b.x, b.y, b.owner_color||e.color||'#ffffff');
            spawnDamageNumber(e.x + (Math.random()-0.5)*e.r, e.y - e.r, b.damage);
            if (b.vampire && b._player) b._player.heal(Math.round(b.damage*0.3));

            // ── Efeitos especiais ao acertar ──────────────────────
            if (b.toxicDot) e._poisonTimer = (e._poisonTimer||0) + 4; // veneno 4s
            if (b.drainMana && b._player) { b._player.addMana(b.drainMana*0.5); e.mana=Math.max(0,(e.mana||0)-b.drainMana); }
            if (b.gravityPull) {
              // Atrai inimigos próximos para o ponto de impacto
              for (const e2 of enemies) {
                if (e2.dead||e2.isRespawning) continue;
                const gd=Math.hypot(e2.x-b.x,e2.y-b.y);
                if (gd<b.gravityPull) {
                  const gf=(1-gd/b.gravityPull)*500;
                  e2.vx+=(b.x-e2.x)/gd*gf*dt; e2.vy+=(b.y-e2.y)/gd*gf*dt;
                }
              }
            }
            if (b.chainTarget && (b.chainTarget>0) && !b._chaining) {
              // Raio de corrente: pula para próximo inimigo ainda não atingido
              const hit = new Set(b._chainHit||[e]);
              let nearest=null, bestDC=Infinity;
              for (const e2 of enemies) {
                if (e2.dead||e2.isRespawning||hit.has(e2)) continue;
                const dc=Math.hypot(e2.x-b.x,e2.y-b.y);
                if (dc<320 && dc<bestDC) { bestDC=dc; nearest=e2; }
              }
              if (nearest) {
                hit.add(nearest);
                const dx=nearest.x-b.x, dy=nearest.y-b.y, d2=Math.hypot(dx,dy)||1;
                _newBullets.push({ x:b.x, y:b.y, vx:dx/d2*700, vy:dy/d2*700, damage:b.damage*0.7, owner:'player', life:0.8, owner_color:b.owner_color||'#55aaff', chainTarget:b.chainTarget-1, _chainHit:hit, _chaining:true, _player:b._player, dirX:dx/d2, dirY:dy/d2, size:r, trail:[] });
              }
            }
            if (b.explosive) {
              this.spawnExplosion(b.x,b.y,(b.size||5)*8,b.owner_color||'#ff6600');
              for (const e2 of enemies) {
                if (e2.dead||e2.isRespawning) continue;
                const ed=Math.hypot(e2.x-b.x,e2.y-b.y);
                const blastR=(b.size||5)*8;
                if (ed<blastR) { e2.hp-=b.damage*(1-ed/blastR); if(e2.hp<=0&&!e2.dead){e2.dead=true;player.kills++;player.score+=e2.score;player.addXP(e2.score);this._enemyKilled();} }
              }
              return false;
            }
            if (b.quantumSplit && !b._split) {
              const angles=[-0.7,0,0.7];
              for (const off of angles) {
                const ca=Math.cos(off),sa=Math.sin(off);
                const ndx=b.vx/Math.hypot(b.vx,b.vy||1), ndy=b.vy/Math.hypot(b.vx||1,b.vy);
                _newBullets.push({ x:b.x,y:b.y, vx:(ndx*ca-ndy*sa)*550, vy:(ndx*sa+ndy*ca)*550, damage:b.damage*0.5, owner:'player', life:0.8, owner_color:b.owner_color||'#ff00ff', _split:true, _player:b._player, dirX:ndx*ca-ndy*sa, dirY:ndx*sa+ndy*ca, size:r*0.7, trail:[] });
              }
              return false;
            }

            if (e.hp<=0) {
              if (isContra1) {
                this._enemyMgr.enemyLostLife(e,this.arena,{spawnAt:()=>{}});
                player.score+=10; player.addXP(20);
                if (e.dead) this._enemyKilled();
              } else {
                e.dead=true; player.kills++; player.score+=e.score; player.addXP(e.score);
                this._enemyKilled();
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
          this._flash(player);
          this._impactSpark(b, b.x, b.y, b.owner_color||'#ff4466');
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
            this._flash(player);
            this._impactSpark(b, b.x, b.y, b.owner_color||'#ff4466');
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
              this._flash(target);
              this._impactSpark(b, b.x, b.y, b.owner_color||'#ffffff');
              spawnDamageNumber(target.x+(Math.random()-0.5)*30, target.y-30, b.damage);
              if (target.hp<=0 && !target.dead) {
                target.dead=true;
                target.startDeath?.();
                this._enemyKilled();
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
        this._flash(player);
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
          if (a) { this._impactSpark(b,b.x,b.y,'#cc8822'); this.spawnExplosion(b.x,b.y,8,'#cc8822'); return false; }
        }
        return true;
      });
    }

    // Colisão player → asteroide (empurrão sempre; dano só fora do dash)
    if (this.arena?.asteroids && !player.dead && !player.rebuilding) {
      const a=this.arena.checkAsteroidCollision(player.x,player.y,player.r,0);
      if (a) {
        const d=Math.hypot(a.x-player.x,a.y-player.y)||1;
        const nx=(player.x-a.x)/d, ny=(player.y-a.y)/d;
        // Empurrão físico: cancela velocidade em direção ao asteroide e afasta
        const overlap=(a.r+player.r-d);
        if (overlap>0) { player.x+=nx*overlap*0.5; player.y+=ny*overlap*0.5; }
        const dot=player.vx*nx+player.vy*ny;
        if (dot<0) { player.vx-=dot*nx*1.6; player.vy-=dot*ny*1.6; }
        this._playCollisionSfx(1.6);
        // Dano só quando não está invencível (dash, godmode, rebuild)
        if (player.invincible<=0) {
          const died=player.takeDamage(18*dt, true);
          this._flash(player);
          if (died) this._triggerPlayerRebuild(player,isContra1);
        }
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

    // ── Colisões com obstáculos fixos (pilares/rochas/ruínas) ────────────────
    // Mesmo padrão dos asteroides, mas obstáculos são indestrutíveis (sem HP).
    if (this.arena?.obstacles) {
      // Projéteis → obstáculos (destruído ao colidir)
      this.bullets=this.bullets.filter(b=>{
        const o=this.arena.checkObstacleCollision(b.x,b.y,4);
        if (o) { this._impactSpark(b,b.x,b.y,'#4488aa'); this.spawnExplosion(b.x,b.y,8,'#4488aa'); return false; }
        return true;
      });

      // Player → obstáculos (empurrão elástico, sem dano — já é difícil o suficiente)
      if (!player.dead&&!player.rebuilding) {
        const o=this.arena.checkObstacleCollision(player.x,player.y,player.r);
        if (o) {
          const d=Math.hypot(o.x-player.x,o.y-player.y)||1;
          const nx=(player.x-o.x)/d, ny=(player.y-o.y)/d;
          // Empurra para fora do obstáculo
          const overlap=o.r+player.r-d;
          player.x+=nx*overlap; player.y+=ny*overlap;
          // Cancela a componente de velocidade em direção ao obstáculo
          const dot=player.vx*nx+player.vy*ny;
          if (dot<0) { player.vx-=dot*nx*1.4; player.vy-=dot*ny*1.4; }
          this._playCollisionSfx(0.9);
        }
      }

      // Inimigos → obstáculos (empurrão, assim como asteroides)
      for (const e of enemies) {
        if (e.dead||e._dying) continue;
        const o=this.arena.checkObstacleCollision(e.x,e.y,e.r);
        if (o) {
          const d=Math.hypot(o.x-e.x,o.y-e.y)||1;
          const nx=(e.x-o.x)/d, ny=(e.y-o.y)/d;
          const overlap=o.r+e.r-d;
          e.x+=nx*overlap; e.y+=ny*overlap;
          const dot=e.vx*nx+e.vy*ny;
          if (dot<0) { e.vx-=dot*nx*1.3; e.vy-=dot*ny*1.3; }
        }
      }
    }

    // Adiciona balas geradas por efeitos especiais (chain, quantum)
    if (_newBullets.length) this.bullets.push(..._newBullets);

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
          this._flash(e);
          this._impactSpark({ dirX:Math.cos(m.angle), dirY:Math.sin(m.angle), owner_color:'#ff8800' }, m.x, m.y, '#ff8800');
          spawnDamageNumber(e.x, e.y - e.r, m.damage);
          this.spawnExplosion(m.x, m.y, 36, '#ff6600');
          this.arena.spawnParticles(m.x, m.y, '#ff8800', 14, 100);
          if (e.hp <= 0) {
            e.dead = true;
            m._player.kills++;
            m._player.score += e.score;
            m._player.addXP(e.score);
            this._enemyKilled();
          }
          return false;
        }
      }
      return true;
    });
  }

  _triggerPlayerRebuild(player, isContra1) {
    const deathColor = player.skin?.deathColor || player.skin?.color || '#ff4466';
    this.arena.spawnParticles(player.x,player.y,deathColor,20,200);
    this.spawnExplosion(player.x,player.y,60,deathColor);
    this._shake?.(10);
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
    this._shake?.(R > 300 ? 14 : 8);
    for (const e of enemies) {
      if (e.dead||e.isRespawning) continue;
      const d=Math.hypot(e.x-x,e.y-y);
      if (d<R){
        const dmg=Math.round(90*(1-d/R));
        e.hp-=dmg;
        this._flash(e);
        spawnDamageNumber(e.x,e.y-e.r,dmg);
        if(e.hp<=0){e.dead=true;player.kills++;player.score+=e.score;player.addXP(e.score);this._enemyKilled();}
      }
    }
  }
}
