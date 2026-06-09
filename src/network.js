// Cliente WebSocket para modo multiplayer.
// Uso: new NetworkClient(url, handlers)
import { tickStatus, isFrozen, drawStatusIcons } from './statusEffects.js';

export class NetworkClient {
  constructor(url, handlers = {}) {
    this.handlers   = handlers;
    this.myId       = null;
    this.connected  = false;
    this.ping       = null; // RTT (ms) do jogador local — null até a 1ª medição
    this._ws        = null;
    this._url       = url;
    this._queue     = [];
    this._pingT     = 0;
    this._connect();
    this._pingTimer = setInterval(() => this._sendPing(), 4000);
  }

  _connect() {
    try {
      this._ws = new WebSocket(this._url);
    } catch {
      console.warn('[Net] WebSocket não disponível — modo offline.');
      return;
    }

    this._ws.addEventListener('open', () => {
      this.connected = true;
      // Envia mensagens enfileiradas
      for (const m of this._queue) this._ws.send(m);
      this._queue = [];
      this._sendPing();
    });

    this._ws.addEventListener('close', () => {
      this.connected = false;
      console.log('[Net] Desconectado.');
    });

    this._ws.addEventListener('error', () => {
      console.warn('[Net] Erro de conexão — continuando offline.');
    });

    this._ws.addEventListener('message', ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this._handle(msg);
    });
  }

  _handle(msg) {
    const h = this.handlers;
    switch (msg.type) {
      case 'welcome':     this.myId = msg.id; h.onWelcome?.(msg);     break;
      case 'join':        h.onJoin?.(msg);                           break;
      case 'leave':       h.onLeave?.(msg);                          break;
      case 'state':       h.onState?.(msg);                          break;
      case 'event':       h.onEvent?.(msg);                          break;
      case 'chat':        h.onChat?.(msg);                           break;
      case 'match_start': this.myId = msg.you?.id ?? this.myId; h.onMatchStart?.(msg); break;
      case 'td_queue_state':  h.onTdQueueState?.(msg);          break;
      case 'td_unavailable':  h.onTdUnavailable?.(msg);         break;
      case 'td_match_start':  this.myId = msg.you?.id ?? this.myId; h.onTdMatchStart?.(msg); break;
      case 'td_reward_granted':        h.onTdRewardGranted?.(msg);        break;
      case 'player_replaced_by_bot':   h.onPlayerReplacedByBot?.(msg);    break;
      case 'pong':        this._onPong(msg);                    break;
      case 'maintenance_locked':
        if (typeof window._handleMaintenanceLocked === 'function')
          window._handleMaintenanceLocked(msg.status || {});
        break;
      case 'admin_update':
        if (typeof window._handleAdminUpdate === 'function')
          window._handleAdminUpdate(msg);
        break;
      case 'promo_update':
        if (typeof window._handlePromoUpdate === 'function')
          window._handlePromoUpdate(msg.promo);
        break;
      case 'prices_update':
        if (typeof window._handlePricesUpdate === 'function')
          window._handlePricesUpdate(msg.prices);
        break;
    }
  }

  // Mede o RTT (latência) só do jogador local — eco simples ping/pong,
  // sem broadcast: cada cliente conhece apenas o próprio ping.
  _sendPing() {
    this._pingT = performance.now();
    this.send({ type: 'ping', t: this._pingT });
  }
  _onPong(msg) {
    if (msg.t !== this._pingT) return;
    this.ping = Math.round(performance.now() - this._pingT);
  }

  send(obj) {
    const str = JSON.stringify(obj);
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(str);
    } else {
      this._queue.push(str);
    }
  }

  join(name, skinIndex, roomId, profileIcon=0) {
    this.send({ type: 'join', name, skinIndex, roomId, profileIcon });
  }

  // Entra na fila de matchmaking de um modo de equipes (ex: 'equipe_online').
  // O servidor forma a sala/times e responde com 'match_start'.
  queueJoin(mode, name, skinIndex, profileIcon=0) {
    this.send({ type: 'queue_join', mode, name, skinIndex, profileIcon });
  }
  queueLeave() { this.send({ type: 'queue_leave' }); }

  // Fila do Torneio "Tower Defense" — fila global única, até 8 jogadores,
  // partidas 2x2 sequenciais ("turnos revezados"). Servidor responde com
  // 'td_queue_state' (posição/tamanho da fila) e, quando formar a partida,
  // 'td_match_start' (equivalente ao match_start do Equipe Online).
  tdQueueJoin(name, skinIndex, profileIcon=0) {
    this.send({ type: 'td_queue_join', name, skinIndex, profileIcon });
  }
  tdQueueLeave() { this.send({ type: 'td_queue_leave' }); }
  // Reporta o fim da partida ao destruir/conquistar a torre central —
  // qualquer jogador da disputa pode reportar (servidor ignora duplicatas).
  tdReportMatchEnd(winnerTeam) { this.send({ type: 'td_match_end', winnerTeam }); }

  sendState(data)  { this.send({ type: 'state', data }); }
  sendEvent(data)  { this.send({ type: 'event', data }); }
  sendChat(text)   { this.send({ type: 'chat', text }); }

  // Anfitrião do modo "Equipe Online" replica estado/eventos de bots
  // simulados localmente — o servidor valida e repassa com o ID do bot.
  sendBotState(botId, data) { this.send({ type: 'bot_state', botId, data }); }
  sendBotEvent(botId, data) { this.send({ type: 'bot_event', botId, data }); }

  disconnect() {
    clearInterval(this._pingTimer);
    this._ws?.close();
  }
}

// Representa outro jogador online (controlado remotamente)
const TEAM_COLORS = { red: '#ff4d6a', blue: '#4da6ff' };

export class RemotePlayer {
  constructor({ id, name, skinIndex, skins, team=null, isBot=false, profileIcon=0 }) {
    const { SKINS } = skins;
    this.id   = id;
    this.name = name;
    this.skin = SKINS[skinIndex] || SKINS[0];
    this.profileIcon = profileIcon;
    this.team = team;
    this.isBot = isBot;
    this.kills = 0;
    this.x    = 800;
    this.y    = 450;
    this.angle = 0;
    this.hp    = 200;
    this.maxHp = 200;
    this.score = 0;
    this.dead  = false;
    // Interpolação
    this._tx = 800; this._ty = 450;
  }

  applyState(s) {
    this._tx  = s.x ?? this._tx;
    this._ty  = s.y ?? this._ty;
    this.angle = s.angle ?? this.angle;
    this.hp    = s.hp ?? this.hp;
    this.score = s.score ?? this.score;
    this.dead  = s.dead ?? this.dead;
    if (s.kills !== undefined) this.kills = s.kills;
  }

  update(dt) {
    tickStatus(this, dt);
    if (isFrozen(this)) return; // imóvel: não interpola para nova posição
    this.x += (this._tx - this.x) * Math.min(1, 12 * dt);
    this.y += (this._ty - this.y) * Math.min(1, 12 * dt);
  }

  draw(ctx) {
    if (this.dead) return;
    // Sem time = modo cooperativo = aliado (verde); com time = PvP (cor do time)
    const teamColor = this.team ? (TEAM_COLORS[this.team] || '#aaccff') : '#44dd88';
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    this.skin.draw(ctx, 1.35);
    ctx.restore();
    // Anel de identificação: verde pulsante para aliados sem time, cor do time para PvP
    ctx.save();
    ctx.strokeStyle = teamColor;
    ctx.globalAlpha = this.team ? 0.55 : 0.40;
    ctx.lineWidth = this.team ? 2 : 1.5;
    ctx.setLineDash(this.team ? [] : [4, 4]); // tracejado = aliado cooperativo
    ctx.beginPath();
    ctx.arc(this.x, this.y, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Nome e label de aliado
    ctx.fillStyle = teamColor;
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    const label = this.isBot ? `[BOT] ${this.name}` : this.name;
    ctx.fillText(label, this.x, this.y - 28);
    if (!this.team) {
      ctx.font = '9px system-ui';
      ctx.globalAlpha = 0.75;
      ctx.fillText('aliado', this.x, this.y - 18);
      ctx.globalAlpha = 1;
    }
    // HP bar
    const bw = 30;
    ctx.fillStyle = '#0d1e32';
    ctx.fillRect(this.x - bw/2, this.y - 28, bw, 4);
    ctx.fillStyle = teamColor;
    ctx.fillRect(this.x - bw/2, this.y - 28, bw * (this.hp / this.maxHp), 4);

    drawStatusIcons(ctx, this.x, this.y - 44, this);
  }
}
