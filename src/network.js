// Cliente WebSocket para modo multiplayer.
// Uso: new NetworkClient(url, handlers)

export class NetworkClient {
  constructor(url, handlers = {}) {
    this.handlers   = handlers;
    this.myId       = null;
    this.connected  = false;
    this._ws        = null;
    this._url       = url;
    this._queue     = [];
    this._connect();
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
      case 'welcome': this.myId = msg.id; h.onWelcome?.(msg); break;
      case 'join':    h.onJoin?.(msg);    break;
      case 'leave':   h.onLeave?.(msg);   break;
      case 'state':   h.onState?.(msg);   break;
      case 'event':   h.onEvent?.(msg);   break;
      case 'chat':    h.onChat?.(msg);    break;
    }
  }

  send(obj) {
    const str = JSON.stringify(obj);
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(str);
    } else {
      this._queue.push(str);
    }
  }

  join(name, skinIndex, roomId) {
    this.send({ type: 'join', name, skinIndex, roomId });
  }

  sendState(data)  { this.send({ type: 'state', data }); }
  sendEvent(data)  { this.send({ type: 'event', data }); }
  sendChat(text)   { this.send({ type: 'chat', text }); }

  disconnect() {
    this._ws?.close();
  }
}

// Representa outro jogador online (controlado remotamente)
export class RemotePlayer {
  constructor({ id, name, skinIndex, skins }) {
    const { SKINS } = skins;
    this.id   = id;
    this.name = name;
    this.skin = SKINS[skinIndex] || SKINS[0];
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
  }

  update(dt) {
    this.x += (this._tx - this.x) * Math.min(1, 12 * dt);
    this.y += (this._ty - this.y) * Math.min(1, 12 * dt);
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    this.skin.draw(ctx, 1.35);
    ctx.restore();
    // Nome
    ctx.fillStyle = '#aaccff';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, this.x, this.y - 28);
    // HP bar
    const bw = 30;
    ctx.fillStyle = '#0d1e32';
    ctx.fillRect(this.x - bw/2, this.y - 28, bw, 4);
    ctx.fillStyle = '#00d4ff';
    ctx.fillRect(this.x - bw/2, this.y - 28, bw * (this.hp/this.maxHp), 4);
  }
}
