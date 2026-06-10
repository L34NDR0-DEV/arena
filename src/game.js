import { Arena, ARENA_W, ARENA_H, ARENA_TYPES, ARENA_W_DEFAULT, ARENA_H_DEFAULT, setArenaSize } from './arena.js';
import { Player, drawCrosshair } from './player.js';
import { EnemyManager, TeamBot, BOT_PROFILES }   from './enemies.js';
import { ItemManager, BorderEffect }              from './items.js';
import { CombatSystem }                          from './combat.js';
import { TowerManager, TowerDefenseManager }     from './towers.js';
import { UI }                                    from './ui.js';
import { AudioEngine }                           from './audio.js';
import { NetworkClient, RemotePlayer }           from './network.js';
import { applyStun, applyFreeze, applyConfuse } from './statusEffects.js';
import { PortalManager, setPortalCooldown }       from './portals.js';
import { RechargeManager }                       from './recharge.js';
import { CardDefenseManager }                    from './enemies.js';
import * as SkinsModule                          from './skins.js';

const MATCH_DURATION = 300;
const CONTRA1_LIVES  = 5;
const TEAM_KILL_TARGET = 200;
const TEAM_SIZE        = 3;

export class Game {
  constructor(canvas, { skinIndex=0, playerName='Jogador', profileIcon=0, equippedTrail=0, mode='contra1', difficulty='moderado', roomId='default' } = {}) {
    const opts = { skinIndex, playerName, profileIcon, equippedTrail, mode, difficulty, roomId };
    this.canvas=canvas; this.ctx=canvas.getContext('2d');
    this.W=canvas.width; this.H=canvas.height;
    this.mode=mode; this.diff=difficulty;
    this.camX=0; this.camY=0;

    // Modo Teste: arena bem menor para visualizar os 4 cantos/torres com facilidade
    if (mode==='teste') setArenaSize(Math.round(ARENA_W_DEFAULT*0.35), Math.round(ARENA_H_DEFAULT*0.35));
    // Modos online (Equipe Online / Tower Defense): arenas reduzidas — partidas
    // mais dinâmicas, menos espaço pra "fugir" e mais encontros entre jogadores.
    else if (mode==='tower_defense' || mode==='equipe_online') setArenaSize(Math.round(ARENA_W_DEFAULT*0.6), Math.round(ARENA_H_DEFAULT*0.6));
    else setArenaSize(ARENA_W_DEFAULT, ARENA_H_DEFAULT);

    const arenaEl=document.getElementById('arena-select');
    // Modo Cards: sempre usa a arena exclusiva Fragmento Cristalino
    const arenaType = mode === 'cards' ? 'cristal_cards'
                    : (arenaEl ? (arenaEl.value||'nebulosa') : 'nebulosa');

    this.arena    = new Arena(this.W, this.H, arenaType);
    this.itemMgr  = new ItemManager();
    this.enemyMgr = new EnemyManager(mode, difficulty);
    this.combat   = new CombatSystem(this.arena);
    this.combat.setEnemyManager(this.enemyMgr);
    this.combat.setShakeCallback((i) => this.addShake(i));
    this.ui       = new UI();
    this.player   = new Player({ x:ARENA_W/2, y:ARENA_H/2, skinIndex, name:playerName });
    this.player.equippedTrailId = opts.equippedTrail || 0;
    this.profileIcon = profileIcon;
    // Contra1: 1 único inimigo, partida curta — level-up não faz sentido
    if (mode==='contra1') this.player.levelUpEnabled = false;

    // Portais + Buracos Negros — em todos os modos exceto Teste.
    // Passa zonas proibidas: torre central (tower_defense) e centro da arena
    // (spawn do jogador) para que buracos negros não surjam perto delas.
    if (mode !== 'teste') {
      const forbidden = [
        { x: ARENA_W/2, y: ARENA_H/2, r: 260 }, // centro/spawn do player
      ];
      if (mode === 'tower_defense') {
        // Torre central nasce no centro — raio de influência proibido maior
        forbidden[0].r = 400;
      }
      this.portalMgr = new PortalManager(this.arena, forbidden);
    } else {
      this.portalMgr = null;
    }

    // Torres Astrais — disponíveis no modo Teste
    this.towerMgr = mode==='teste' ? new TowerManager() : null;
    // Torre central do Torneio "Tower Defense" — nasce neutra no meio da
    // arena; o time que a destruir a conquista e vence a partida na hora.
    this.towerDefenseMgr = mode==='tower_defense' ? new TowerDefenseManager(ARENA_W, ARENA_H) : null;

    // ── Modo Cards of Defense ─────────────────────────────────
    this._isCardsMode = mode === 'cards';
    this._cardsMgr    = null;
    this._cardsLives  = 9;
    this._cardsPaused = false;   // true quando overlay de carta está aberto
    this._cardEvent   = null;    // { level, options } esperando escolha do player
    this._cardsKills  = 0;
    this._cardsLevel  = 1;
    this._cardsTowers = [];      // AllyTower[] colocadas pelo player
    this._cardsTraps  = [];      // AllyTrap[] colocadas pelo player
    this._cardsFortifyCount = 0;
    if (this._isCardsMode) {
      this._cardsMgr = new CardDefenseManager(difficulty);
      setPortalCooldown(8);
      // Lê skins compradas para calcular bônus
      const purchasedSkins = window._playerPurchasedSkins || [];
      this.player.enableCardsMode(purchasedSkins.length > 0);
      this.player.levelUpEnabled = false; // progressão é por cards, não XP
    }

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

    // Estações de recarga — somente nos modos online
    this.rechargeMgr = (mode === 'equipe_online' || mode === 'tower_defense')
      ? new RechargeManager(mode) : null;

    // Camera shake — { intensity, decay }
    this._shake = { intensity: 0, decay: 0 };

    // Sistema de kick por inatividade — 60s avisa, 120s expulsa
    this._idleTime   = 0;   // segundos sem ação do jogador
    this._idleWarned = false;

    // ── Modo "Equipe Online" — PvP em times (até 6, 2 times de 3) ──
    this.team=null;          // 'red' | 'blue' — atribuído pelo servidor
    this.isHost=false;       // anfitrião simula bots locais
    this.bots=[];            // TeamBot[] (apenas no anfitrião)
    this._teamScores={red:0, blue:0};
    this._lobby = (mode==='equipe_online' || mode==='tower_defense'); // true até chegar match_start
    this._lobbyCount=1;
    this._tdQueuePos=-1;
    this._tdMatchEndReported=false;
    if (this._lobby) {
      this.ui.showTeamLobby(mode==='tower_defense'
        ? 'Entrando na fila do Torneio Tower Defense…'
        : 'Procurando jogadores...');
    }

    // Tela de carregamento — exibida desde já (com o que já sabemos: o
    // próprio jogador) para cobrir a arena antes que a conexão complete e
    // o roster real chegue. _refreshMatchLoading() é chamado de novo assim
    // que os dados dos demais jogadores estiverem disponíveis.
    // Nos modos com lobby (Equipe Online / Tower Defense) o cronômetro de
    // 3s NÃO é armado aqui — ele só é definido (em 7s) quando a partida
    // de fato começa (_onMatchStart/_onTdMatchStart). Armar 3s já de cara
    // faria a tela de carregamento sumir cedo demais enquanto o jogador
    // ainda está na fila esperando outros jogadores entrarem.
    this._loadingPeers = [];
    this._refreshMatchLoading();
    if (!this._lobby) this._loadingHideAt = performance.now() + 3000;

    this._pendingDeploy = null; // 'tower' | 'trap' | null
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
            if (result.type==='mine') {
              this.combat.deployMine(px,py,this.player);
              this.ui.notify('MINA ARMADA!'+bonus,'#ff4400');
            } else if (result.type==='nuke') {
              this.combat.triggerBomb(px,py,en,this.player,420);
              this.arena.spawnParticles(px,py,'#ff4400',30,280);
              this.addShake(14);
              this.ui.notify('NUKE!'+bonus,'#ff2200'); this._audio.playBomb?.();
            } else if (result.type==='freeze') {
              for(const e of en){if(!e.dead&&Math.hypot(e.x-px,e.y-py)<320)e._state='dodge';}
              this.ui.notify('FREEZE!'+bonus,'#88ddff');
            } else if (result.type==='nova') {
              // Pulso que destrói todos os inimigos na tela
              for(const e of en){if(!e.dead){e.hp=0;e.dead=true;this.player.kills++;this.player.score+=e.score;this.player.addXP(e.score);}}
              this.arena.spawnParticles(px,py,'#ff00ff',35,300);
              this.combat.spawnExplosion(px,py,200,'#ff00ff');
              this.addShake(18);
              this.ui.notify('NOVA!'+bonus,'#ff00ff'); this._audio.playBomb?.();
            } else if (result.type==='warp') {
              // Teleporta para o cursor do mouse
              this.player.x=this._mouse.wx; this.player.y=this._mouse.wy;
              this.player.vx=0; this.player.vy=0;
              this.arena.spawnParticles(px,py,'#aa44ff',20,180);
              this.arena.spawnParticles(this.player.x,this.player.y,'#aa44ff',20,180);
              this.ui.notify('WARP!'+bonus,'#aa44ff');
            } else if (result.type==='stun') {
              const n=this._applyOffensiveDebuff(applyStun, result.duration, px, py);
              this.ui.notify(n?`ATORDOOU ${n}!`+bonus:'Ninguém perto...'+bonus,'#ffe066');
            } else if (result.type==='deepfreeze') {
              const n=this._applyOffensiveDebuff(applyFreeze, result.duration, px, py);
              this.ui.notify(n?`CONGELOU ${n}!`+bonus:'Ninguém perto...'+bonus,'#66ccff');
            } else if (result.type==='confuse') {
              const n=this._applyOffensiveDebuff(applyConfuse, result.duration, px, py);
              this.ui.notify(n?`CONFUNDIU ${n}!`+bonus:'Ninguém perto...'+bonus,'#cc66ff');
            } else {
              if (result.itemType === 'TOWER_DEPLOY') {
                this._pendingDeploy = 'tower';
                this.ui.notify('Clique na arena para colocar a torre!', '#00ddff');
              } else if (result.itemType === 'TRAP_DEPLOY') {
                this._pendingDeploy = 'trap';
                this.ui.notify('Clique na arena para armar a armadilha!', '#aa44ff');
              } else {
                const nl={
                  HEALTH:'+Vida',HEALTH_BIG:'+Vida Grande!',
                  SHIELD:'+Escudo',SHIELD_BIG:'+Escudo Grande!',
                  MANA:'+Mana',MANA_FULL:'Mana Cheia!',
                  RAPID:'Turbo Tiro!',MULTISHOT:'Tiro Triplo!',PIERCING:'Perfurante!',
                  MAGNET:'Ímã!',BOOST:'Velocidade!',DASH_BOOST:'Super Dash!',
                  FREEZE:'Freeze!',REGEN:'Regeneração!',SHIELD_AURA:'Aura de Escudo!',
                  OVERCLOCK:'Sobrecarga de Dano!',INVISIBLE:'Invisível!',
                  GODMODE:'MODO DEUS!',VAMPIRO:'Vampiro!',MISSILE:'Tiro Míssil 8s!',
                };
                this.ui.notify((nl[result.itemType]||'Item usado')+bonus, result.color||'#00ff88');
              }
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
      if (e.button===0) {
        this._mouse.left=true;
        // Deploy de torre/armadilha com clique esquerdo
        if (this._pendingDeploy) {
          const {wx,wy}=this._screenToWorld(e.clientX,e.clientY);
          if (this._pendingDeploy === 'tower') this.placeTower(wx, wy);
          else if (this._pendingDeploy === 'trap') this.placeTrap(wx, wy);
          this._pendingDeploy = null;
        }
      } else if (e.button===2) {
        // Cancelar deploy pendente com clique direito
        if (this._pendingDeploy) { this._pendingDeploy = null; return; }
        this._mouse.right=true;
        const {wx,wy}=this._screenToWorld(e.clientX,e.clientY);
        this._mouse.wx=wx; this._mouse.wy=wy;
        if (!this.paused&&!this.over&&!this.player.dead) this.player.moveTo(wx,wy);
      }
    };
    this._onMouseUp=e=>{ if(e.button===0)this._mouse.left=false; if(e.button===2)this._mouse.right=false; };
    this._onCtx=e=>e.preventDefault();
    // Desbloqueio do AudioContext por gesto do usuário: no Android, os
    // controles touch chamam preventDefault() no touchstart, o que suprime
    // os eventos sintéticos de mousedown — sem este listener dedicado, o
    // áudio nunca sai do estado "suspended" nesses aparelhos (no iOS Safari
    // o mousedown sintético ainda dispara, por isso só o Android é afetado).
    this._onTouchUnlockAudio=()=>{ this._audio.resume(); };
    window.addEventListener('keydown',this._onKey);
    window.addEventListener('keyup',this._onKey);
    this.canvas.addEventListener('mousemove',this._onMouseMove);
    this.canvas.addEventListener('mousedown',this._onMouseDown);
    window.addEventListener('mouseup',this._onMouseUp);
    this.canvas.addEventListener('contextmenu',this._onCtx);
    window.addEventListener('touchstart',this._onTouchUnlockAudio,{ passive:true });
  }

  _unbindInput() {
    window.removeEventListener('keydown',this._onKey);
    window.removeEventListener('keyup',this._onKey);
    this.canvas.removeEventListener('mousemove',this._onMouseMove);
    this.canvas.removeEventListener('mousedown',this._onMouseDown);
    window.removeEventListener('mouseup',this._onMouseUp);
    this.canvas.removeEventListener('contextmenu',this._onCtx);
    window.removeEventListener('touchstart',this._onTouchUnlockAudio);
  }

  _connectNet(name,skinIndex,roomId) {
    try {
      const proto=location.protocol==='https:'?'wss':'ws';
      const isTeamMode = this.mode==='equipe_online';
      const isTdMode   = this.mode==='tower_defense';
      this.net=new NetworkClient(`${proto}://${location.host}`,{
        // 'welcome' só chega como RESPOSTA a join/queue_join/td_queue_join —
        // por isso o pedido de entrada precisa ser enviado assim que a conexão
        // abre (NetworkClient enfileira até o WebSocket ficar pronto), não ao
        // receber 'welcome' (senão nenhum dos dois lados nunca acontece).
        onWelcome:msg=>{
          if (!isTeamMode && !isTdMode) {
            this._refreshMatchLoading(msg.peers||[]);
            this._loadingHideAt = performance.now() + 3000;
          }
        },
        onJoin:msg=>{ const rp=new RemotePlayer({id:msg.id,name:msg.name,skinIndex:msg.skinIndex,profileIcon:msg.profileIcon,skins:SkinsModule}); this.peers[msg.id]=rp; this.ui.killFeed(`${msg.name} entrou`); },
        onLeave:msg=>{ this.ui.killFeed(`${this.peers[msg.id]?.name ?? 'Jogador'} saiu`); delete this.peers[msg.id]; },
        onState:msg=>this.peers[msg.id]?.applyState(msg.data),
        onEvent:msg=>{
          if(msg.data?.type==='kill') {
            this.ui.killFeed(`${msg.data.killerName} eliminou ${msg.data.victimName}`);
            if (isTeamMode && msg.data.killerTeam) this._registerTeamKill(msg.data.killerTeam);
          }
        },
        onPlayerReplacedByBot: msg=>this._onPlayerReplacedByBot(msg),
        onMatchStart: msg=>this._onMatchStart(msg),
        onTdQueueState: msg=>this._onTdQueueState(msg),
        onTdUnavailable: msg=>this._onTdUnavailable(msg),
        onTdMatchStart: msg=>this._onTdMatchStart(msg),
        onTdRewardGranted: msg=>{
          const skin = SkinsModule.SKINS.find(s=>s.id===msg.skinId);
          const skinName = skin ? skin.name : 'Hex Champion';
          this.ui.notify(`Recompensa do torneio: skin "${skinName}" desbloqueada!`, '#ffcf4d');
          window._showSkinReveal?.(skinName);
        },
      });

      // Pedido de entrada — enviado de imediato (NetworkClient enfileira até
      // o WebSocket abrir); a resposta 'welcome'/'match_start'/etc. chega em
      // seguida pelos handlers acima.
      if (isTeamMode)      this.net.queueJoin('equipe_online', name, skinIndex, this.profileIcon);
      else if (isTdMode)   this.net.tdQueueJoin(name, skinIndex, this.profileIcon);
      else                 this.net.join(name, skinIndex, roomId, this.profileIcon);
    } catch {}
  }

  // Tela de carregamento — (re)desenha a escalação da sala (nome, skin
  // equipada e ícone de perfil de cada jogador, incluindo você) e o ping
  // local. Chamada já na construção (cobrindo a arena de imediato, com só
  // os dados do próprio jogador) e de novo assim que os peers chegam.
  _refreshMatchLoading(peers = this._loadingPeers) {
    this._loadingPeers = peers;
    const roster = [
      { name:this.player.name, skin:this.player.skin, profileIcon:this.profileIcon, team:this.team, isMe:true, isBot:false },
      ...peers.map(p=>({ name:p.name, skin:(SkinsModule.SKINS[p.skinIndex]||SkinsModule.SKINS[0]), profileIcon:p.profileIcon||0, team:p.team||null, isMe:false, isBot:!!p.isBot })),
    ];
    this.ui.showMatchLoading(roster);
  }

  // Recebido quando o servidor forma a partida do modo "Equipe Online":
  // popula peers reais, marca o time/host local e instancia bots (se host).
  _onMatchStart(msg) {
    this._lobby=false;
    this.ui.hideTeamLobby();
    this.team   = msg.you?.team ?? null;
    this.isHost = !!msg.you?.isHost;
    this.player.team = this.team;

    // Limpa peers da fila (não deveria haver, mas por segurança)
    this.peers={};
    this.bots=[];

    const matchPeers = [];

    for (const p of (msg.players||[])) {
      if (p.id===this.net.myId) continue;
      matchPeers.push(p);
      if (p.isBot) {
        if (this.isHost) {
          const {x,y}=this._spawnPosFor(p.team);
          // O servidor manda nome/skin determinísticos por slot (botProfileForSlot);
          // aqui casamos pelo nome para recuperar os "traits" de personalidade —
          // só o anfitrião roda a IA, então só ele precisa do estilo de combate.
          const profile = BOT_PROFILES.find(pr => pr.name === p.name);
          this.bots.push(new TeamBot({ id:p.id, name:p.name, team:p.team, x, y, difficulty:this.diff, skinIndex:p.skinIndex, traits:profile?.traits ?? null }));
        } else {
          // Clientes não-anfitriões representam bots como RemotePlayers comuns
          // — o anfitrião replica o estado deles via state/event.
          this.peers[p.id]=new RemotePlayer({id:p.id,name:p.name,skinIndex:p.skinIndex,skins:SkinsModule,team:p.team,isBot:true});
        }
      } else {
        this.peers[p.id]=new RemotePlayer({id:p.id,name:p.name,skinIndex:p.skinIndex,profileIcon:p.profileIcon,skins:SkinsModule,team:p.team,isBot:false});
      }
    }

    const {x,y}=this._spawnPosFor(this.team);
    this.player.x=x; this.player.y=y;
    this.ui.notify(`Partida formada! Você está no Time ${this.team==='red'?'Vermelho':'Azul'}`, this.team==='red'?'#ff4d6a':'#4da6ff');

    this._refreshMatchLoading(matchPeers);
    this._loadingHideAt = performance.now() + 7000;
  }

  // Aliado desistiu durante uma partida do Equipe Online (ou Tower Defense):
  // o servidor já elegeu um bot substituto e, se necessário, migrou o host.
  // Aqui o cliente:
  //  1. Remove o peer que saiu (já veio um 'leave' padrão antes, mas por segurança).
  //  2. Adiciona o bot substituto — como TeamBot local se agora somos o novo host,
  //     ou como RemotePlayer se o host continua sendo outro jogador.
  //  3. Se viramos o novo host, assume a simulação dos bots já existentes também.
  _onPlayerReplacedByBot(msg) {
    const { leaverId, leaverName, bot, newHostId } = msg;
    delete this.peers[leaverId]; // garante remoção mesmo que 'leave' chegue depois

    const becameHost = !this.isHost && newHostId === this.net?.myId;
    if (becameHost) {
      this.isHost = true;
      // Converte todos os peers marcados como isBot em TeamBots locais
      for (const [pid, rp] of Object.entries(this.peers)) {
        if (!rp.isBot) continue;
        const {x, y} = this._spawnPosFor(rp.team);
        const profile = BOT_PROFILES.find(pr => pr.name === rp.name);
        const tb = new TeamBot({ id: pid, name: rp.name, team: rp.team, x, y,
          difficulty: this.diff, skinIndex: rp.skinIndex, traits: profile?.traits ?? null });
        if (this.mode === 'tower_defense') tb.setObjective(this.towerDefenseMgr?.tower);
        this.bots.push(tb);
        delete this.peers[pid];
      }
    }

    // Instancia o bot novo
    if (this.isHost) {
      const {x, y} = this._spawnPosFor(bot.team);
      const profile = BOT_PROFILES.find(pr => pr.name === bot.name);
      const tb = new TeamBot({ id: bot.id, name: bot.name, team: bot.team, x, y,
        difficulty: this.diff, skinIndex: bot.skinIndex, traits: profile?.traits ?? null });
      if (this.mode === 'tower_defense') tb.setObjective(this.towerDefenseMgr?.tower);
      this.bots.push(tb);
    } else {
      this.peers[bot.id] = new RemotePlayer({ id: bot.id, name: bot.name,
        skinIndex: bot.skinIndex, skins: SkinsModule, team: bot.team, isBot: true });
    }

    const teamLabel = bot.team === 'red' ? 'Vermelho' : 'Azul';
    this.ui.killFeed(`${leaverName} saiu — ${bot.name} entrou (Time ${teamLabel})`);
    if (becameHost) this.ui.notify('Você assumiu o controle dos bots aliados.', '#ffcc44');
  }

  // ── Torneio "Tower Defense" — fila global única, partidas 2x2 sequenciais ──
  _onTdQueueState(msg) {
    if (this.mode!=='tower_defense' || !this._lobby) return;
    const waiting = msg.matchActive ? ' — aguardando o turno atual terminar' : '';
    this.ui.showTeamLobby(`Na fila do Torneio Tower Defense (${msg.queueLength}/8)${waiting}…`);
  }

  _onTdUnavailable(msg) {
    if (this.mode!=='tower_defense') return;
    const reason = msg.reason==='tournament_ended'
      ? 'O Torneio Tower Defense já encerrou — o modo "Teste" voltou ao normal.'
      : 'Fila do Torneio Tower Defense está cheia (8/8). Tente novamente em instantes.';
    this.ui.notify(reason, '#ff5566');
    this.ui.hideTeamLobby();
    setTimeout(()=>window.exitToMenu?.(), 1200);
  }

  // Recebido quando o servidor forma o próximo confronto 2x2 do torneio:
  // popula peers reais, marca time/host e posiciona times em lados opostos
  // ao redor da torre central neutra.
  _onTdMatchStart(msg) {
    this._lobby=false;
    this.ui.hideTeamLobby();
    this.team   = msg.you?.team ?? null;
    this.isHost = !!msg.you?.isHost;
    this.player.team = this.team;
    this._tdMatchEndReported=false;

    this.peers={};
    this.bots=[];

    const matchPeers = [];
    for (const p of (msg.players||[])) {
      if (p.id===this.net.myId) continue;
      matchPeers.push(p);
      if (p.isBot) {
        if (this.isHost) {
          const {x,y}=this._spawnPosFor(p.team);
          // Bots do Torneio Tower Defense são sempre "difíceis" — independente
          // da dificuldade escolhida pelo jogador — para a disputa pela torre
          // central exigir mais estratégia e trabalho em equipe real.
          // Mesmo casamento nome→perfil do Equipe Online — identidade consistente
          // entre os dois modos (servidor usa o mesmo botProfileForSlot).
          const profile = BOT_PROFILES.find(pr => pr.name === p.name);
          const bot = new TeamBot({ id:p.id, name:p.name, team:p.team, x, y, difficulty:'dificil', skinIndex:p.skinIndex, traits:profile?.traits ?? null });
          bot.setObjective(this.towerDefenseMgr?.tower);
          this.bots.push(bot);
        } else {
          // Clientes não-anfitriões representam bots como RemotePlayers comuns
          // — o anfitrião replica o estado deles via state/event.
          this.peers[p.id]=new RemotePlayer({id:p.id,name:p.name,skinIndex:p.skinIndex,skins:SkinsModule,team:p.team,isBot:true});
        }
      } else {
        this.peers[p.id]=new RemotePlayer({id:p.id,name:p.name,skinIndex:p.skinIndex,profileIcon:p.profileIcon,skins:SkinsModule,team:p.team,isBot:false});
      }
    }

    const {x,y}=this._spawnPosFor(this.team);
    this.player.x=x; this.player.y=y;
    this.ui.notify(`Confronto formado! Você está no Time ${this.team==='red'?'Vermelho':'Azul'} — destrua a torre central (agora ela revida)!`, this.team==='red'?'#ff4d6a':'#4da6ff');

    this._refreshMatchLoading(matchPeers);
    this._loadingHideAt = performance.now() + 7000;
  }

  _spawnPosFor(team) {
    // Times nascem em lados opostos da arena
    const cx=ARENA_W/2, cy=ARENA_H/2;
    const off=Math.min(ARENA_W,ARENA_H)*0.32;
    const jitter=()=> (Math.random()-0.5)*140;
    if (team==='red')  return { x: cx-off+jitter(), y: cy+jitter() };
    return                   { x: cx+off+jitter(), y: cy+jitter() };
  }

  _registerTeamKill(team) {
    if (!this._teamScores[team]) this._teamScores[team]=0;
    this._teamScores[team]++;
    if (this._teamScores[team]>=TEAM_KILL_TARGET && !this.over) {
      const won = team===this.team;
      this._endGame(won);
    }
  }

  _input() {
    // WASD: move um cursor virtual na direção da tecla e aciona holdRight
    let wasdActive = false, wasdX = this._mouse.wx, wasdY = this._mouse.wy;
    if (window._useWASD && !this._touchActive) {
      const dx = (this._keys['KeyD']?1:0) - (this._keys['KeyA']?1:0);
      const dy = (this._keys['KeyS']?1:0) - (this._keys['KeyW']?1:0);
      if (dx || dy) {
        const len = Math.hypot(dx, dy) || 1;
        const WASD_DIST = 300;
        wasdX = this.player.x + (dx/len)*WASD_DIST;
        wasdY = this.player.y + (dy/len)*WASD_DIST;
        if (!this.paused && !this.over && !this.player.dead) this.player.moveTo(wasdX, wasdY);
        wasdActive = true;
      }
    }
    const inp = {
      shooting:   this._mouse.left,
      space:      this._keys['Space'],
      holdRight:  this._mouse.right || wasdActive,
      dash:       this._keys['ShiftLeft']||this._keys['ShiftRight'],
      worldMouseX: wasdActive ? wasdX : this._mouse.wx,
      worldMouseY: wasdActive ? wasdY : this._mouse.wy,
    };
    // Qualquer ação do jogador reseta o timer de inatividade
    if (inp.shooting || inp.holdRight || inp.dash || inp.space || wasdActive || this._touchActive) {
      this._idleTime = 0;
      this._idleWarned = false;
    }
    return inp;
  }

  _updateIdleKick(dt) {
    // Não aplica em modos sem oponente ou enquanto está no lobby/morto/pausado
    if (this.paused || this.over || this.player.dead || this.player.rebuilding) return;
    if (this._lobby) return;

    this._idleTime += dt;

    // 60s: aviso
    if (!this._idleWarned && this._idleTime >= 60) {
      this._idleWarned = true;
      this.ui.notify('Você está inativo! Mova-se ou será expulso em 1 minuto.', '#ffaa00');
    }

    // 120s: expulsão
    if (this._idleTime >= 120) {
      this._idleKick();
    }
  }

  _idleKick() {
    if (this.over) return;
    this._idleTime = 0;
    this.net?.disconnect?.();
    this.over = true;
    cancelAnimationFrame(this._rafId);
    this._audio.stopEngine?.();
    this._idleKicked = true;
    this._idleKickAt = performance.now();
    setTimeout(() => window.exitToMenu?.(), 4000);
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
    // Tela de carregamento de partida online — atualiza o ping local exibido
    // e some sozinha após alguns segundos (ou quando o ping chega).
    if (this._loadingHideAt) {
      this.ui.updateMatchLoadingPing(this.net?.ping ?? null);
      if (performance.now() >= this._loadingHideAt) {
        this.ui.hideMatchLoading();
        this._loadingHideAt = null;
      }
    }

    // Cooldown de vida do player
    if (this.player._lifeTimer>0) this.player._lifeTimer-=dt;

    // Modos online em fila: aguardam formação da partida (lobby/fila)
    if ((this.mode==='equipe_online' || this.mode==='tower_defense') && this._lobby) {
      this.ui.update(this.player,this.timeLeft,0,null,null,0,this.mode);
      return;
    }

    // ── Modo Cards of Defense ─────────────────────────────────
    if (this._isCardsMode) {
      // Se overlay de carta está aberto, congela tudo exceto câmera/UI
      if (this._cardsPaused) return;

      // Morte do player no modo cards: perde 1 vida e respawna
      if (this.player.dead && !this.player.rebuilding) {
        this._cardsLives--;
        this.ui.notify(`Vida perdida! Restam ${this._cardsLives}`, '#ff4466');
        if (this._cardsLives <= 0) {
          this._endCardsGame();
          return;
        }
        // Respawna sem rebuild no modo cards
        this.player.hp = this.player.maxHp;
        this.player.mana = this.player.maxMana;
        this.player.dead = false;
        this.player.invincible = 3;
        this.player.x = ARENA_W / 2 + (Math.random() - 0.5) * 200;
        this.player.y = ARENA_H / 2 + (Math.random() - 0.5) * 200;
        this.player.vx = 0; this.player.vy = 0;
        this.arena.spawnParticles(this.player.x, this.player.y, '#00ff88', 20, 200);
      }

      // Atualiza CardDefenseManager
      if (this._cardsMgr) {
        const ev = this._cardsMgr.update(dt, this.player, this.combat.bullets, this.arena, this.itemMgr);
        if (ev) {
          this._cardsLevel = this._cardsMgr.currentLevel;
          if (ev.cardLevel) {
            // Evento de carta — gera opções, pausa o jogo e mostra overlay
            const ownedIds = this.player._cardsOwned.map(c => c.id);
            const options  = this._cardsMgr.generateCardOptions(ev.cardLevel, ownedIds);
            const cardEv   = { ...ev, options };
            this._cardsPaused = true;
            this._cardEvent   = cardEv;
            window.showCardsOverlay?.(cardEv);
          }
          if (ev.waveComplete) {
            this._cardsKills = this.player.kills;
          }
        }
      }

      // Torres aliadas
      this._updateCardsTowers(dt);
      // Armadilhas aliadas
      this._updateCardsTraps(dt);

      // Sincroniza inimigos do CardDefenseManager com o EnemyManager
      // para que o combat, portais, itens e UI usem a lista correta
      if (this._cardsMgr) this.enemyMgr.enemies = this._cardsMgr.enemies;
    }

    // Contra1: verificar fim por vidas
    if (this.mode==='contra1') {
      const res=this.enemyMgr.livesResult;
      if (res==='player_win') { this._endGame(true); return; }
      if (res==='enemy_win'||this.enemyMgr.playerLives<=0) { this._endGame(false); return; }
    } else if (this.mode!=='equipe_online' && this.mode!=='tower_defense' && this.mode!=='cards') {
      this.timeLeft-=dt;
      if (this.timeLeft<=0) { this._endGame(true); return; }
    }
    if (this.player.dead&&this.player.deathTimer<=0&&this.mode!=='contra1'&&this.mode!=='equipe_online'&&this.mode!=='tower_defense'&&this.mode!=='cards') { this._endGame(false); return; }

    // Torneio Tower Defense: vitória imediata para o time que destruir/conquistar a torre central
    if (this.towerDefenseMgr?.winnerTeam && !this.over) {
      const winnerTeam = this.towerDefenseMgr.winnerTeam;
      const won = winnerTeam===this.team;
      this.arena.spawnParticles(this.towerDefenseMgr.tower.x, this.towerDefenseMgr.tower.y, this.towerDefenseMgr.tower.color, 40, 320);
      this.ui.notify(won ? 'TORRE CONQUISTADA! VITÓRIA!' : 'A torre central caiu para o adversário…', won?'#ffcc00':'#ff5566');
      if (!this._tdMatchEndReported) { this._tdMatchEndReported=true; this.net?.tdReportMatchEnd(winnerTeam); }
      this._endGame(won);
      return;
    }

    // Torres Astrais: vitória ao capturar as 2 torres do lado adversário
    if (this.towerMgr?.winner) {
      const won = this.towerMgr.winner==='player';
      if (won) { this.player.score+=200; this.ui.notify('TORRES CONQUISTADAS! VITÓRIA!','#ffcc00'); }
      this._endGame(won);
      return;
    }

    const tcx=this.player.x-this.W/2, tcy=this.player.y-this.H/2;
    this.camX+=(tcx-this.camX)*Math.min(1,7*dt);
    this.camY+=(tcy-this.camY)*Math.min(1,7*dt);
    this.camX=Math.max(0,Math.min(ARENA_W-this.W,this.camX));
    this.camY=Math.max(0,Math.min(ARENA_H-this.H,this.camY));

    this._updateIdleKick(dt);
    // Camera shake decay
    if (this._shake.intensity > 0) {
      this._shake.intensity -= this._shake.decay * dt;
      if (this._shake.intensity < 0) this._shake.intensity = 0;
    }

    this.arena.update(dt);
    this.player.update(dt,this._input(),this.combat.bullets,this.combat);

    // ── Portais e Buracos Negros ──────────────────────────────
    if (this.portalMgr) {
      const allEntities = [this.player, ...this.enemyMgr.enemies.filter(e=>!e.dead), ...Object.values(this.peers), ...this.bots];
      const teleported = this.portalMgr.update(dt, allEntities);
      // Bônus de teleporte ao player: +20 mana e +15 hp
      for (const { entity } of teleported) {
        if (entity === this.player) {
          this.player.addMana(20);
          this.player.heal(15);
          this.arena.spawnParticles(this.player.x, this.player.y, '#00cfff', 10, 120);
        }
      }
      // Dano dos buracos negros ao player
      if (!this.player.dead && !this.player.rebuilding) {
        const bh = this.portalMgr.applyBlackHoles(this.player, dt);
        if (bh.destroyed) {
          // Destruição pelo núcleo — morte instantânea
          this.arena.spawnParticles(this.player.x,this.player.y,'#8844ff',35,320);
          this.ui.notify('Sugado pelo buraco negro!','#8844ff');
          this._audio.playDeath?.();
          this.combat._triggerPlayerRebuild(this.player, this.mode==='contra1');
        } else if (bh.dmg > 0) {
          const died = this.player.takeDamage(bh.dmg);
          if (died) this.combat._triggerPlayerRebuild(this.player, this.mode==='contra1');
        }
      }
      // Dano dos buracos negros aos inimigos
      for (const e of this.enemyMgr.enemies) {
        if (e.dead) continue;
        const bhe = this.portalMgr.applyBlackHoles(e, dt);
        if (bhe.destroyed) {
          e.hp = 0;
          this.arena.spawnParticles(e.x,e.y,'#8844ff',20,220);
          this.player.kills++; this.player.score+=e.score; this.player.addXP(e.score);
        } else if (bhe.dmg > 0) {
          e.hp -= bhe.dmg;
          if (e.hp < 0) e.hp = 0;
        }
      }
    }

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

    if (!this._isCardsMode) {
      this.enemyMgr.update(dt,this.player,this.combat.bullets,this.arena,this.itemMgr,this.towerMgr?.towers);
    }

    if (this.towerMgr) {
      this.towerMgr.update(dt,this.player,this.enemyMgr.enemies,this.combat.bullets);
      this._resolveTowerCombat(dt);
    }
    if (this.towerDefenseMgr) {
      this.towerDefenseMgr.update(dt, this.combat.bullets, this._tdAttackers());
      this._resolveCentralTowerCombat(dt);
    }

    // Estações de recarga
    if (this.rechargeMgr) {
      this.rechargeMgr.update(dt, this.player, this.peers, this.bots);
    }

    const hasExtra = this.player.inventory.isExtraFull();
    this.itemMgr.update(dt,this.player.x,this.player.y,this.player.hasMagnet,hasExtra,this.arena);
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

    if (this.mode==='equipe_online' || this.mode==='tower_defense') {
      // Anfitrião simula os bots localmente e replica via state/event
      const allUnits=[this.player, ...Object.values(this.peers), ...this.bots];
      if (this.isHost) {
        for (const bot of this.bots) {
          if (bot.dead) continue;
          const before=this.combat.bullets.length;
          bot.update(dt, allUnits, this.combat.bullets);
          // Marca os projéteis recém-disparados pelo bot com seu time/origem,
          // para a colisão PvP creditar o abate corretamente (sem amigo-fogo).
          for (let i=before;i<this.combat.bullets.length;i++) {
            const b=this.combat.bullets[i];
            b.team=bot.team; b.shooter=bot; b.shooterIsBot=true;
          }
        }
      }
      this.combat.setPvpContext({ peers:this.peers, bots:this.bots, localTeam:this.team, mode:this.mode, isHost:this.isHost, net:this.net, onKill:(team)=>this._registerTeamKill(team) });
    }

    this.combat.update(dt,this.player,this.enemyMgr.enemies);
    for (const id in this.peers) this.peers[id].update(dt);

    if ((this.mode==='equipe_online' || this.mode==='tower_defense') && this.isHost) {
      this._netT-=dt;
      if (this._netT<=0&&this.net?.connected) {
        this._netT=0.05;
        this.net.sendState({x:this.player.x,y:this.player.y,angle:this.player.angle,hp:this.player.hp,score:this.player.score,dead:this.player.dead,kills:this.player.kills});
        for (const bot of this.bots) {
          this.net.sendBotState(bot.id, {x:bot.x,y:bot.y,angle:bot.angle,hp:bot.hp,score:bot.score,dead:bot.dead,kills:bot.kills});
        }
      }
    } else {
      this._netT-=dt;
      if (this._netT<=0&&this.net?.connected) { this._netT=0.05; this.net.sendState({x:this.player.x,y:this.player.y,angle:this.player.angle,hp:this.player.hp,score:this.player.score,dead:this.player.dead,kills:this.player.kills}); }
    }

    // Atualiza HUD
    const pLives=this.mode==='contra1'?this.enemyMgr.playerLives:null;
    const eLives=this.mode==='contra1'?this.enemyMgr.enemyLives:null;
    this.ui.update(this.player,this.timeLeft,this.enemyMgr.enemyScore,pLives,eLives,this.enemyMgr.maxLives,this.mode,this.mode==='equipe_online'?this._teamScores:null);
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
        this._audio.playTowerHit?.();
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

  // Lista de naves vivas (jogador local + remotos + bots locais) que servem
  // de alvo para a defesa automática da torre central — ela ataca qualquer
  // time, então não filtramos por `team`.
  // Lista combatentes adversários vivos candidatos a receber debuffs ofensivos
  // (STUN/CONGELA/CONFUNDE): unifica inimigos PvE e alvos PvP (remotos + bots
  // do time rival) — ponto único para os 3 itens novos.
  _offensiveTargets() {
    const list=[];
    for (const e of (this.enemyMgr?.enemies||[])) {
      if (!e.dead&&!e.isRespawning) list.push(e);
    }
    if (this.mode==='equipe_online'||this.mode==='tower_defense') {
      for (const rp of Object.values(this.peers||{})) {
        if (!rp.dead&&rp.team&&rp.team!==this.team) list.push(rp);
      }
      if (this.isHost) for (const bot of (this.bots||[])) {
        if (!bot.dead&&bot.team&&bot.team!==this.team) list.push(bot);
      }
    }
    return list;
  }

  // Aplica um debuff ofensivo nos adversários mais próximos dentro do raio.
  // Retorna o número de alvos afetados (para a notificação de feedback).
  _applyOffensiveDebuff(applyFn, duration, px, py, radius=360, maxTargets=2) {
    const targets=this._offensiveTargets()
      .filter(t=>Math.hypot(t.x-px,t.y-py)<radius)
      .sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py))
      .slice(0,maxTargets);
    for (const t of targets) applyFn(t,duration);
    return targets.length;
  }

  _tdAttackers() {
    const list=[this.player];
    for (const id in this.peers) list.push(this.peers[id]);
    if (this.isHost) for (const bot of this.bots) list.push(bot);
    return list;
  }

  // Resolve combate contra a torre central do Torneio Tower Defense:
  // qualquer projétil/colisão de um jogador do time A aplica dano e, ao
  // zerar o HP, o time A "conquista" a torre — vitória imediata da partida.
  _resolveCentralTowerCombat(dt) {
    const mgr=this.towerDefenseMgr;
    if (!mgr || mgr.winnerTeam) return;
    const player=this.player;
    const tower=mgr.tower;

    const handleHit=(hit)=>{
      if (!hit) return;
      this.arena.spawnParticles(tower.x,tower.y,tower.color,20,200);
      this._audio.playExplosion(2);
      if (hit.destroyed) {
        this._audio.playExplosion(3);
        this.arena.spawnParticles(tower.x,tower.y,tower.color,50,360);
        this.addShake(20);
      }
    };

    // Projéteis de jogadores (locais e remotos) vs torre central
    this.combat.bullets=this.combat.bullets.filter(b=>{
      if (b.owner!=='player') return true;
      const attackerTeam = b.team ?? this.team;
      if (!attackerTeam) return true;
      const hit=mgr.damageCentral(b.x,b.y,b.r??5,b.damage,attackerTeam);
      if (hit) {
        this.combat.spawnExplosion(b.x,b.y,14,b.owner_color||'#ffffff');
        this._audio.playTowerHit?.();
        handleHit(hit);
        return false;
      }
      return true;
    });

    // Colisão física: nave do jogador local atravessando a torre central
    if (this.team) {
      const hit=mgr.damageCentral(player.x,player.y,player.r,90*dt,this.team);
      if (hit) handleHit(hit);
    }
  }

  _triggerTowerKillPlayer() {
    const isContra1=this.mode==='contra1';
    this.combat._triggerPlayerRebuild(this.player,isContra1);
  }

  addShake(intensity) {
    if (intensity > this._shake.intensity) {
      this._shake.intensity = intensity;
      this._shake.decay = intensity * 2.5;
    }
  }

  _draw() {
    const ctx=this.ctx; const {W,H}=this;
    const ZOOM=0.65; // zoom out: ver mais arena
    const camX=this.camX, camY=this.camY;

    // Camera shake offset
    const sk = this._shake.intensity;
    const skX = sk > 0 ? (Math.random()*2-1)*sk : 0;
    const skY = sk > 0 ? (Math.random()*2-1)*sk : 0;

    this.arena.drawBackground(ctx,camX,camY);
    ctx.save();
    ctx.translate(W/2 + skX, H/2 + skY);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-W/2 - camX, -H/2 - camY);

    this.arena.drawBorder(ctx);
    this.arena.drawAsteroids(ctx);
    this.arena.drawObstacles(ctx);
    this.portalMgr?.draw(ctx);
    this.rechargeMgr?.draw(ctx);
    this.towerMgr?.draw(ctx);
    this.towerDefenseMgr?.draw(ctx);
    if (this._isCardsMode) this._drawCardsTowersAndTraps(ctx);
    this.itemMgr.draw(ctx);
    if (this._isCardsMode && this._cardsMgr) this._cardsMgr.draw(ctx);
    else this.enemyMgr.draw(ctx);
    for (const id in this.peers) this.peers[id].draw(ctx);
    if (this.isHost) for (const bot of this.bots) bot.draw(ctx);
    this.combat.draw(ctx);
    this.player.draw(ctx);
    this.arena.drawParticles(ctx);

    // Mira espiral (em coords mundo) — oculta no modo touch, já que a mira
    // segue a direção do movimento (sem ponteiro de mouse para indicar)
    if (!this.player.dead&&!this.paused&&!this._touchActive) {
      drawCrosshair(ctx,this._mouse.wx,this._mouse.wy,this.player._age);
    }
    ctx.restore();

    // Efeito de borda ao usar item (em coords tela)
    this.borderEffect.draw(ctx, W, H);

    const mm=document.getElementById('minimap');
    if (mm) { const mc=mm.getContext('2d'); this.ui.drawMinimap(mc,this.player,this.enemyMgr.enemies,this.itemMgr.items,mm.width,mm.height); }


    // Contra1: HUD de vidas em tela
    if (this.mode==='contra1') this._drawLivesHUD(ctx,W,H);
    // Cards: HUD de vidas do modo cards
    if (this._isCardsMode) this._drawCardsLivesHUD(ctx,W,H);

    if (this._audio._muted) {
      ctx.save(); ctx.fillStyle='rgba(255,255,255,0.18)'; ctx.font='10px system-ui'; ctx.textAlign='right';
      ctx.fillText('SOM MUDO — M',W-10,H-10); ctx.restore();
    }

    // ── Overlay de inatividade ────────────────────────────────
    if (this._idleKicked) {
      const t = (performance.now() - (this._idleKickAt||0)) / 1000;
      const blink = Math.floor(t * 2) % 2 === 0;
      ctx.save();
      ctx.fillStyle = 'rgba(2,4,10,0.97)';
      ctx.fillRect(0, 0, W, H);

      // Linha decorativa topo (igual ao go-topbar)
      const barW = Math.min(340, W - 40);
      const grad = ctx.createLinearGradient(W/2 - barW/2, 0, W/2 + barW/2, 0);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.5, '#ff2255');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(W/2 - barW/2, H/2 - 118, barW, 2);

      ctx.textAlign = 'center';

      // Label pequeno topo (igual go-result-label)
      ctx.font = `8px 'Press Start 2P', monospace`;
      ctx.fillStyle = '#ff2255';
      ctx.shadowColor = '#ff2255'; ctx.shadowBlur = 8;
      ctx.letterSpacing = '4px';
      ctx.fillText('INATIVIDADE', W/2, H/2 - 88);
      ctx.shadowBlur = 0;

      // Titulo principal piscante (igual go-title)
      if (blink) {
        ctx.font = `${Math.min(Math.round(W * 0.034), 26)}px 'Press Start 2P', monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ff225555'; ctx.shadowBlur = 30;
        ctx.fillText('JOGADOR EXPULSO', W/2, H/2 - 52);
        ctx.shadowBlur = 0;
      } else {
        ctx.font = `${Math.min(Math.round(W * 0.034), 26)}px 'Press Start 2P', monospace`;
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('JOGADOR EXPULSO', W/2, H/2 - 52);
      }

      // Subtítulo (go-sub)
      ctx.font = `10px 'Press Start 2P', monospace`;
      ctx.fillStyle = '#6a8a9a';
      ctx.fillText('2 minutos sem jogar', W/2, H/2 - 18);

      // Linha divisória (go-divider)
      const divW = Math.min(300, W - 60);
      const divG = ctx.createLinearGradient(W/2 - divW/2, 0, W/2 + divW/2, 0);
      divG.addColorStop(0, 'transparent');
      divG.addColorStop(0.5, '#1a3a5a');
      divG.addColorStop(1, 'transparent');
      ctx.fillStyle = divG;
      ctx.fillRect(W/2 - divW/2, H/2 + 2, divW, 1);

      // Rodapé piscante (go-result-label estilo)
      ctx.font = `9px 'Press Start 2P', monospace`;
      if (blink) {
        ctx.fillStyle = '#00d4ff';
        ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 12;
        ctx.fillText('VOLTANDO AO MENU...', W/2, H/2 + 34);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(0,212,255,0.35)';
        ctx.fillText('VOLTANDO AO MENU...', W/2, H/2 + 34);
      }

      // Barra de progresso (4s) — estilo fino/elegante
      const prog = Math.min(t / 4, 1);
      const bw = Math.min(300, W - 60);
      const bx = W/2 - bw/2, by = H/2 + 56;
      ctx.fillStyle = '#0e1a28';
      ctx.fillRect(bx, by, bw, 4);
      const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      pg.addColorStop(0, '#ff2255');
      pg.addColorStop(1, '#00d4ff');
      ctx.fillStyle = pg;
      ctx.shadowColor = '#ff2255'; ctx.shadowBlur = 6;
      ctx.fillRect(bx, by, bw * prog, 4);
      ctx.shadowBlur = 0;

      ctx.restore();
    } else if (this._idleWarned && this._idleTime >= 60) {
      const remaining = Math.ceil(120 - this._idleTime);
      const urgent = remaining <= 20;
      const blink = urgent && Math.floor(Date.now() / 400) % 2 === 0;
      const col = urgent ? '#ff2255' : '#ffcc00';
      ctx.save();

      // Painel no topo — mesmo fundo do gameover
      const pw = Math.min(360, W - 40), ph = 64;
      const px = W/2 - pw/2, py = 10;
      ctx.globalAlpha = blink ? 0.7 : 1;
      ctx.fillStyle = 'rgba(2,4,10,0.94)';
      ctx.fillRect(px, py, pw, ph);

      // Linha colorida no topo do painel
      const tg = ctx.createLinearGradient(px, 0, px+pw, 0);
      tg.addColorStop(0, 'transparent'); tg.addColorStop(0.5, col); tg.addColorStop(1, 'transparent');
      ctx.globalAlpha = 1;
      ctx.fillStyle = tg;
      ctx.fillRect(px, py, pw, 2);

      ctx.textAlign = 'center';
      // Label pequeno (go-result-label)
      ctx.font = `7px 'Press Start 2P', monospace`;
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.fillText('ATENCAO — INATIVIDADE', W/2, py + 20);
      ctx.shadowBlur = 0;

      // Contador (go-stat .val style)
      ctx.font = `${urgent ? 13 : 11}px 'Press Start 2P', monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`EXPULSAO EM  ${remaining}s`, W/2, py + 46);

      ctx.restore();
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

  // ── Cards: draw de torres e armadilhas aliadas ─────────────────
  _drawCardsTowersAndTraps(ctx) {
    // Torres
    for (const t of this._cardsTowers) {
      if (t.hp <= 0) continue;
      ctx.save();
      ctx.translate(t.x, t.y);

      // Base da torre — cilindro estilo LoL
      ctx.strokeStyle = '#00ddff';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#00ddff';
      ctx.shadowBlur  = 10;
      // Octágono base
      ctx.beginPath();
      for (let i=0;i<8;i++) {
        const a = (i/8)*Math.PI*2 - Math.PI/8;
        const r = 22;
        i===0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r)
              : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,30,50,0.85)';
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Canhão giratório
      ctx.rotate(t.angle);
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth   = 5;
      ctx.lineCap     = 'round';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(26, 0); ctx.stroke();

      // Barra de HP da torre
      ctx.rotate(-t.angle);
      const hpRatio = t.hp / t.maxHp;
      const bw = 36, bh = 4;
      ctx.fillStyle = '#0d2233';
      ctx.fillRect(-bw/2, -32, bw, bh);
      ctx.fillStyle = hpRatio > 0.5 ? '#00dd88' : hpRatio > 0.25 ? '#ffcc00' : '#ff3333';
      ctx.fillRect(-bw/2, -32, bw * hpRatio, bh);

      ctx.restore();
    }

    // Armadilhas (visíveis ao jogador, invisíveis aos inimigos via cor)
    for (const trap of this._cardsTraps) {
      if (trap.triggered) continue;
      ctx.save();
      ctx.translate(trap.x, trap.y);
      ctx.globalAlpha = 0.6 + Math.sin(Date.now()*0.004)*0.2;
      ctx.strokeStyle = '#aa44ff';
      ctx.lineWidth   = 1.5;
      ctx.shadowColor = '#aa44ff';
      ctx.shadowBlur  = 8;
      // Hexágono
      ctx.beginPath();
      for (let i=0;i<6;i++) {
        const a = (i/6)*Math.PI*2;
        const r = trap.r;
        i===0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r)
              : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(80,0,130,0.35)';
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // HUD de vidas no modo cards (canto superior direito)
  _drawCardsLivesHUD(ctx, W, H) {
    const lv = this._cardsLives;
    ctx.save();
    ctx.font         = 'bold 11px monospace';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    // Level
    ctx.fillStyle  = '#00ff88';
    ctx.shadowColor= '#00ff88'; ctx.shadowBlur=6;
    ctx.fillText(`Lv ${this._cardsLevel}`, W - 12, 40);
    ctx.shadowBlur = 0;
    // Vidas
    ctx.fillStyle  = lv <= 3 ? '#ff4466' : '#ffffff';
    ctx.fillText(`Vidas: ${lv}`, W - 12, 56);
    ctx.restore();
  }

  // ── Cards of Defense: escolha de carta ────────────────────────
  cardChoose(cardId) {
    if (!this._cardsPaused || !this._cardEvent) return;
    const ev = this._cardEvent;
    const chosen = ev.options?.find(o => o.id === cardId);
    if (!chosen) return;

    // Aplica carta ao player
    const lv = chosen.level || 1;
    this.player.applyCard(cardId, lv);

    // Registra rejeições das cartas não escolhidas
    if (this._cardsMgr) {
      for (const opt of ev.options) {
        if (opt.id !== cardId) {
          this._cardsMgr.recordRejection(opt.id);
        }
      }
    }

    // Notificação e retoma o jogo
    const label = chosen.name || cardId;
    this.ui.notify(`Carta escolhida: ${label} Lv${lv}!`, '#00ff88');
    this._cardsPaused = false;
    this._cardEvent   = null;

    // Fortify: reforça torres e armadilhas já colocadas
    if (cardId === 'fortify') {
      this._cardsFortifyCount++;
      for (const t of this._cardsTowers) t.fortified = this._cardsFortifyCount;
      for (const t of this._cardsTraps)  t.fortified = this._cardsFortifyCount;
    }
    window.hideCardsOverlay?.();
  }

  // Coloca uma torre aliada na arena
  placeTower(wx, wy) {
    const fortify = this._cardsFortifyCount;
    this._cardsTowers.push({
      x: wx, y: wy, r: 28,
      hp: fortify > 0 ? 300 : 200,
      maxHp: fortify > 0 ? 300 : 200,
      dmg: fortify > 0 ? 45 : 30,
      range: 400, shootCd: 0, shootRate: 0.8,
      angle: 0, age: 0, fortified: fortify,
    });
    this.arena.spawnParticles(wx, wy, '#00ddff', 18, 180);
    this.ui.notify('Torre colocada!', '#00ddff');
  }

  // Coloca uma armadilha na arena
  placeTrap(wx, wy) {
    const fortify = this._cardsFortifyCount;
    this._cardsTraps.push({
      x: wx, y: wy, r: 20,
      dmg:    fortify > 0 ? 400 : 200,
      radius: fortify > 0 ? 280 : 160,
      triggered: false, age: 0,
    });
    this.ui.notify('Armadilha armada!', '#aa44ff');
  }

  _updateCardsTowers(dt) {
    const enemies = this.enemyMgr.enemies.filter(e => !e.dead);
    for (const tower of this._cardsTowers) {
      if (tower.hp <= 0) continue;
      tower.age += dt;
      tower.shootCd -= dt;

      // Girar canhão para o inimigo mais próximo no range
      let nearest = null, nearDist = Infinity;
      for (const e of enemies) {
        const d = Math.hypot(e.x - tower.x, e.y - tower.y);
        if (d < tower.range && d < nearDist) { nearest = e; nearDist = d; }
      }
      if (nearest) {
        tower.angle = Math.atan2(nearest.y - tower.y, nearest.x - tower.x);
        if (tower.shootCd <= 0) {
          tower.shootCd = tower.shootRate;
          const sp = 580;
          const dx = nearest.x - tower.x, dy = nearest.y - tower.y, d = Math.hypot(dx,dy)||1;
          this.combat.bullets.push({
            x: tower.x, y: tower.y,
            vx:(dx/d)*sp, vy:(dy/d)*sp,
            damage: tower.dmg, owner:'player', life:1.2,
            owner_color:'#00ddff', piercing:false, vampire:false,
            dirX:dx/d, dirY:dy/d,
          });
        }
      }

      // Recebe dano de colisão de inimigos
      for (const e of enemies) {
        if (Math.hypot(e.x - tower.x, e.y - tower.y) < tower.r + (e.r||20)) {
          tower.hp -= 15 * dt;
        }
      }
    }
    this._cardsTowers = this._cardsTowers.filter(t => t.hp > 0);
  }

  _updateCardsTraps(dt) {
    const enemies = this.enemyMgr.enemies.filter(e => !e.dead);
    for (const trap of this._cardsTraps) {
      if (trap.triggered) continue;
      for (const e of enemies) {
        if (Math.hypot(e.x - trap.x, e.y - trap.y) < trap.r + (e.r||20)) {
          trap.triggered = true;
          // Explosão em área
          this.combat.spawnExplosion(trap.x, trap.y, trap.radius, '#ff4400');
          for (const target of enemies) {
            if (Math.hypot(target.x - trap.x, target.y - trap.y) < trap.radius) {
              target.hp -= trap.dmg;
            }
          }
          this.arena.spawnParticles(trap.x, trap.y, '#ff8800', 28, 260);
          this.addShake(8);
          this.ui.notify('ARMADILHA!', '#ff8800');
          break;
        }
      }
    }
    this._cardsTraps = this._cardsTraps.filter(t => !t.triggered);
  }

  _endCardsGame() {
    if (this.over) return;
    this.over = true;
    cancelAnimationFrame(this._rafId);
    this._audio.stopEngine();
    this._audio.playDeath?.();

    const level     = this._cardsLevel;
    const kills     = this.player.kills;
    const livesLeft = this._cardsLives;
    const score     = Math.round(kills * level * (1 + livesLeft * 0.5));
    const cardsUsed = this.player._cardsOwned.map(c => c.id).join(',');

    // Salva no ranking via cookie (sem Bearer token — usa cookie de sessão)
    fetch('/api/cards/ranking', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      credentials:'include',
      body:JSON.stringify({ score, level, kills, lives_left:livesLeft, cards_used:cardsUsed }),
    }).catch(()=>{});

    setTimeout(()=>{
      window.showGameOver?.({
        win:false, kills, score,
        items:this.player.itemsCollected,
        itemTypeCounts:this.player.itemTypeCounts,
        skinIndex:this.player.skinIndex,
        skinName:this.player.skin.name,
        playerName:this.player.name,
        level, livesLeft, cardsUsed,
        mode:'cards',
      });
    }, 700);
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
      skinIndex:this.player.skinIndex,
      skinName:this.player.skin.name,
      playerName:this.player.name,
      level:this.player.level,
      playerLives:this.enemyMgr.playerLives,
      enemyLives:this.enemyMgr.enemyLives,
    };
    if (this.mode==='equipe_online') {
      data.team=this.team;
      data.teamScores={...this._teamScores};
      data.teamWinner = this._teamScores.red>=TEAM_KILL_TARGET ? 'red'
                      : this._teamScores.blue>=TEAM_KILL_TARGET ? 'blue' : null;
    }
    if (this.mode==='tower_defense') {
      data.team=this.team;
      data.teamWinner=this.towerDefenseMgr?.winnerTeam ?? null;
    }
    setTimeout(()=>window.showGameOver?.(data),700);
  }

  destroy() {
    this.over=true;
    cancelAnimationFrame(this._rafId);
    this._unbindInput();
    this._audio.stopEngine();
    this.net?.disconnect();
    this.ui.hideTeamLobby();
    this.ui.hideMatchLoading();
  }
}
