'use strict';
const http   = require('http');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

// ── Estado do servidor ─────────────────────────────────────────
const rooms  = new Map();   // roomId → { players: Map<id, {socket, state}>, started }
const socks  = new Map();   // socket → { id, name, roomId, skinIndex }
let   nextId = 1;

function getRoomOrCreate(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { players: new Map(), started: false });
  return rooms.get(roomId);
}

function broadcastRoom(roomId, data, except = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(data);
  for (const [, p] of room.players) {
    if (p.socket !== except) wsSend(p.socket, msg);
  }
}

// ── HTTP estático ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath);

  // Segurança: não servir fora do ROOT
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

// ── WebSocket RFC 6455 (sem dependências) ──────────────────────
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }

  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const id = nextId++;
  socks.set(socket, { id, name: `Jogador${id}`, roomId: 'default', skinIndex: 0 });

  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    let frame;
    while ((frame = parseFrame(buf))) {
      buf = buf.slice(frame.consumed);
      if (frame.opcode === 8) { socket.destroy(); return; }
      if (frame.opcode === 1) handleMsg(socket, frame.payload.toString('utf8'));
    }
  });

  socket.on('close', () => onDisconnect(socket));
  socket.on('error', () => onDisconnect(socket));
});

function onDisconnect(socket) {
  const info = socks.get(socket);
  if (!info) return;
  socks.delete(socket);
  const room = rooms.get(info.roomId);
  if (room) {
    room.players.delete(info.id);
    broadcastRoom(info.roomId, { type: 'leave', id: info.id });
    if (room.players.size === 0) rooms.delete(info.roomId);
  }
  console.log(`[WS] Desconectado: ${info.name} (id=${info.id})`);
}

function handleMsg(socket, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  const info = socks.get(socket);
  if (!info) return;

  switch (msg.type) {
    case 'join': {
      info.name      = msg.name      || info.name;
      info.skinIndex = msg.skinIndex ?? 0;
      info.roomId    = msg.roomId    || 'default';
      const room = getRoomOrCreate(info.roomId);
      room.players.set(info.id, { socket, state: null });
      // Informa o novo cliente do seu ID e dos jogadores já na sala
      const peers = [...room.players.entries()]
        .filter(([pid]) => pid !== info.id)
        .map(([pid, p]) => {
          const pi = [...socks.entries()].find(([s]) => s === p.socket)?.[1];
          return pi ? { id: pid, name: pi.name, skinIndex: pi.skinIndex } : null;
        }).filter(Boolean);
      wsSend(socket, JSON.stringify({ type: 'welcome', id: info.id, peers }));
      broadcastRoom(info.roomId, { type: 'join', id: info.id, name: info.name, skinIndex: info.skinIndex }, socket);
      console.log(`[WS] ${info.name} entrou na sala "${info.roomId}" (${room.players.size} jogadores)`);
      break;
    }
    case 'state':
      broadcastRoom(info.roomId, { type: 'state', id: info.id, data: msg.data }, socket);
      break;
    case 'event':
      broadcastRoom(info.roomId, { type: 'event', id: info.id, data: msg.data }, socket);
      break;
    case 'chat':
      broadcastRoom(info.roomId, { type: 'chat', id: info.id, name: info.name, text: msg.text });
      break;
  }
}

// ── Helpers WebSocket ──────────────────────────────────────────
function wsSend(socket, text) {
  if (!socket.writable) return;
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126)       header = Buffer.from([0x81, len]);
  else if (len < 65536) header = Buffer.from([0x81,126,(len>>8)&0xff,len&0xff]);
  else                  header = Buffer.from([0x81,127,0,0,0,0,(len>>24)&0xff,(len>>16)&0xff,(len>>8)&0xff,len&0xff]);
  try { socket.write(Buffer.concat([header, payload])); } catch {}
}

function parseFrame(buf) {
  if (buf.length < 2) return null;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f, offset = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = buf.readUInt32BE(6); offset = 10; }
  const total = offset + (masked ? 4 : 0) + len;
  if (buf.length < total) return null;
  let payload = buf.slice(offset + (masked ? 4 : 0), total);
  if (masked) {
    const mask = buf.slice(offset, offset + 4);
    payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
  }
  return { opcode: buf[0] & 0x0f, payload, consumed: total };
}

server.listen(PORT, () => {
  console.log(`\n  Tower Defense on the Space`);
  console.log(`  Servidor: http://localhost:${PORT}`);
  console.log(`  Aguardando jogadores...\n`);
});
