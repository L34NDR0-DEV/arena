'use strict';
const http   = require('http');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const { handleApi, isLocked, maintenanceStatus, setNotifyUser, setBroadcastAll } = require('./src/api');
const auth          = require('./src/auth');
const economy       = require('./src/economy');
const db            = require('./src/db');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
// Demais variáveis de ambiente (DB_PATH, SESSION_SECRET, GOOGLE_CLIENT_ID,
// COOKIE_SECURE, MP_ACCESS_TOKEN, MP_PUBLIC_KEY, PUBLIC_URL) são lidas
// diretamente em src/db.js, src/auth.js, src/api.js e src/payments.js,
// todas com defaults que funcionam em http://localhost.

// Perfis fixos de bot — dão "identidade" reconhecível entre partidas
// (mesmo nome + mesma skin sempre que aquele slot é preenchido). O servidor
// só precisa de name+skinIndex para o payload match_start/td_match_start; o
// "estilo de combate" (traits) mora em src/enemies.js (só importa para quem
// roda a IA, o cliente anfitrião) — módulo ESM que este arquivo CommonJS não
// importa (mesmo motivo do antigo BOT_SKIN_POOL: client-side, usa Image/canvas).
// MANTER EM SINCRONIA com BOT_PROFILES em src/enemies.js: mesma ORDEM, mesmos
// `name` e `skinIndex` (nenhum deve estar em REWARD_ONLY_SKIN_IDS=[10,12]).
const BOT_PROFILES = [
  { name:'BOT-Falcão',    skinIndex:0  },
  { name:'BOT-Centinela', skinIndex:3  },
  { name:'BOT-Víbora',    skinIndex:6  },
  { name:'BOT-Titânio',   skinIndex:7  },
  { name:'BOT-Rajada',    skinIndex:9  },
  { name:'BOT-Espectro',  skinIndex:11 },
  { name:'BOT-Lâmina',    skinIndex:13 },
  { name:'BOT-Cometa',    skinIndex:14 },
];
// Atribuição determinística por slot — o 1º bot de cada partida é sempre
// "BOT-Falcão", o 2º sempre "BOT-Centinela" etc. Sem hash/sorteio/banco:
// o índice do laço de criação já é estável (sempre 0,1,2... por sala).
function botProfileForSlot(i) {
  return BOT_PROFILES[i % BOT_PROFILES.length];
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml; charset=utf-8',
  '.mp3':  'audio/mpeg',
  '.json': 'application/json',
  '.xml':  'application/xml; charset=utf-8',
};

// ── Estado do servidor ─────────────────────────────────────────
const rooms  = new Map();   // roomId → { players: Map<id, {socket, state}>, started }
const socks  = new Map();   // socket → { id, name, roomId, skinIndex, team }
let   nextId = 1;

function getRoomOrCreate(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { players: new Map(), started: false });
  return rooms.get(roomId);
}

// ── Matchmaking do modo "Equipe Online" (PvP 3x3) ──────────────
// Salas dedicadas (equipe_online_<n>) com até 6 jogadores, 2 times de 3.
// Quando a sala enche ou o tempo de espera expira, o servidor sorteia um
// "anfitrião" (primeiro a entrar) que simula bots localmente para preencher
// vagas vazias — o servidor continua "burro", apenas repassando mensagens.
const TEAM_SIZE        = 3;
const TEAM_ROOM_MAX    = TEAM_SIZE * 2;
const TEAM_WAIT_MS     = 12_000;
let   teamRoomSeq      = 1;
const teamRooms        = new Map(); // roomId → { players:[{id,name,skinIndex,socket,team,isHost}], teamCounts:{red,blue}, started, waitTimer }

function findOpenTeamRoom() {
  for (const [roomId, tr] of teamRooms) {
    if (!tr.started && tr.players.length < TEAM_ROOM_MAX) return roomId;
  }
  return null;
}

function assignTeam(tr) {
  return tr.teamCounts.red <= tr.teamCounts.blue ? 'red' : 'blue';
}

function startTeamMatch(roomId) {
  const tr = teamRooms.get(roomId);
  if (!tr || tr.started) return;
  tr.started = true;
  if (tr.waitTimer) { clearTimeout(tr.waitTimer); tr.waitTimer = null; }

  const slotsToFill = TEAM_ROOM_MAX - tr.players.length;
  const botSlots = [];
  for (let i = 0; i < slotsToFill; i++) {
    const team = assignTeam(tr);
    tr.teamCounts[team]++;
    const botId = `bot_${roomId}_${i}`;
    const profile = botProfileForSlot(i);
    botSlots.push({ id: botId, name: profile.name, skinIndex: profile.skinIndex, profileIcon: 0, team, isBot: true, isHost: false });
  }

  const playersPayload = tr.players.map((p, idx) => ({
    id: p.id, name: p.name, skinIndex: p.skinIndex, profileIcon: p.profileIcon, team: p.team,
    isBot: false, isHost: idx === 0,
  })).concat(botSlots);

  // Guarda quais IDs de bot pertencem a essa sala e quem é o anfitrião,
  // para validar e repassar os relatos de estado/eventos simulados (ver
  // 'bot_state'/'bot_event' em handleMsg) sem permitir spoofing por outros.
  tr.botIds = new Set(botSlots.map(b => b.id));
  tr.hostId = tr.players[0]?.id ?? null;

  for (const p of tr.players) {
    wsSend(p.socket, JSON.stringify({
      type: 'match_start',
      roomId,
      players: playersPayload,
      you: { id: p.id, team: p.team, isHost: p.id === tr.hostId },
    }));
  }
  console.log(`[MATCH] Equipe Online iniciada em "${roomId}" — ${tr.players.length} jogador(es) real(is) + ${botSlots.length} bot(s)`);
}

function joinTeamQueue(socket, info, name, skinIndex, profileIcon) {
  let roomId = findOpenTeamRoom();
  let tr;
  if (roomId) {
    tr = teamRooms.get(roomId);
  } else {
    roomId = `equipe_online_${teamRoomSeq++}`;
    tr = { players: [], teamCounts: { red: 0, blue: 0 }, started: false, waitTimer: null };
    teamRooms.set(roomId, tr);
  }

  const team = assignTeam(tr);
  tr.teamCounts[team]++;
  tr.players.push({ id: info.id, name, skinIndex, profileIcon, socket, team });
  info.roomId = roomId;
  info.team   = team;
  info.name   = name;
  info.skinIndex = skinIndex;

  // Registra também no mapa "rooms" padrão, para que broadcastRoom()
  // funcione normalmente para state/event/chat/leave após o match_start.
  const room = getRoomOrCreate(roomId);
  room.players.set(info.id, { socket, state: null });

  console.log(`[MATCH] ${name} entrou na fila "Equipe Online" (sala ${roomId}, time ${team}, ${tr.players.length}/${TEAM_ROOM_MAX})`);

  if (tr.players.length >= TEAM_ROOM_MAX) {
    startTeamMatch(roomId);
  } else if (!tr.waitTimer) {
    tr.waitTimer = setTimeout(() => startTeamMatch(roomId), TEAM_WAIT_MS);
  }
}

function leaveTeamQueue(socket, info) {
  const tr = teamRooms.get(info.roomId);
  if (!tr) return;
  const idx = tr.players.findIndex(p => p.socket === socket);
  if (idx === -1) return;
  const [removed] = tr.players.splice(idx, 1);
  if (removed && tr.teamCounts[removed.team] > 0) tr.teamCounts[removed.team]--;
  if (tr.players.length === 0) {
    if (tr.waitTimer) clearTimeout(tr.waitTimer);
    teamRooms.delete(info.roomId);
    return;
  }

  // Partida já iniciada: substitui o desistente por um bot do mesmo time,
  // e migra o host se necessário.
  if (!tr.started) return;

  // Conta quantos bots já existem para gerar o próximo índice de perfil
  const existingBots = tr.botIds ? tr.botIds.size : 0;
  const botId = `bot_${info.roomId}_sub_${existingBots}`;
  const profile = botProfileForSlot(existingBots);
  if (!tr.botIds) tr.botIds = new Set();
  tr.botIds.add(botId);

  // Migra host se quem saiu era o anfitrião — elege o próximo jogador real
  let newHostId = tr.hostId;
  if (removed.id === tr.hostId) {
    const nextPlayer = tr.players.find(p => !p.isBot);
    newHostId = nextPlayer?.id ?? tr.hostId;
    tr.hostId = newHostId;
  }

  const botSlot = { id: botId, name: profile.name, skinIndex: profile.skinIndex,
    profileIcon: 0, team: removed.team, isBot: true, isHost: false };

  const notifyMsg = JSON.stringify({
    type: 'player_replaced_by_bot',
    leaverId: removed.id,
    leaverName: removed.name,
    bot: botSlot,
    newHostId,
  });
  broadcastRoom(info.roomId, JSON.parse(notifyMsg));
  console.log(`[MATCH] ${removed.name} saiu — substituído por ${profile.name} (${removed.team}) em "${info.roomId}"; host agora: ${newHostId}`);
}

// ── Matchmaking do "Torneio Tower Defense" (PvP 2x2, torre central) ──
// Diferente do "Equipe Online" (várias salas simultâneas), aqui existe UMA
// fila global de até TD_QUEUE_MAX jogadores e UMA partida 2x2 ativa por vez —
// "turnos revezados": pares de times jogam em sequência, o restante aguarda.
// Some/desaparece automaticamente quando isTournamentActive() vira false
// (ver checagem em joinTdQueue) — sem precisar remover código do servidor.
const TD_TEAM_SIZE   = 2;
const TD_MATCH_SIZE  = TD_TEAM_SIZE * 2;
const TD_QUEUE_MAX   = 8;
const TD_WAIT_MS     = 12_000;
const TD_ROOM_ID     = 'tower_defense_arena';
let   tdMatchSeq     = 1;

const tdQueue = []; // [{ id, name, skinIndex, profileIcon, socket }] aguardando turno
let   tdMatch = null; // { roomId, players, teamCounts, started, tournamentEligible, botIds, hostId }
let   tdWaitTimer = null;

// ── Cards of Defense — fila co-op (até 5) ──────────────────────
const CARDS_MATCH_SIZE = 5;
const CARDS_WAIT_MS    = 15_000;
const cardsQueue = []; // [{ id, name, skinIndex, profileIcon, socket }]
let   cardsWaitTimer = null;
let   cardsMatchSeq  = 1;

function flushCardsQueue(allowBots = false) {
  if (cardsQueue.length === 0) return;
  if (cardsWaitTimer) { clearTimeout(cardsWaitTimer); cardsWaitTimer = null; }
  const realCount = Math.min(CARDS_MATCH_SIZE, cardsQueue.length);
  const chosen = cardsQueue.splice(0, realCount);
  const roomId = `cards_room_${cardsMatchSeq++}`;
  const hostId = chosen[0].id;
  const botIds = new Set();

  // Preenche vagas com bots
  const slotsToFill = CARDS_MATCH_SIZE - chosen.length;
  for (let i = 0; i < slotsToFill; i++) {
    const botId = `cards_bot_${roomId}_${i}`;
    botIds.add(botId);
  }

  // Cria sala e notifica jogadores
  const players = chosen.map((p, idx) => ({
    id: p.id, name: p.name, skinIndex: p.skinIndex,
    profileIcon: p.profileIcon, socket: p.socket,
    isBot: false, isHost: idx === 0,
  }));

  for (const p of players) {
    const botList = [...botIds].map((bid, i) => ({
      id: bid, name: `Bot ${i+1}`, skinIndex: i % 3, profileIcon: 0, isBot: true,
    }));
    const peers = players.filter(pp => pp.id !== p.id).map(pp => ({
      id: pp.id, name: pp.name, skinIndex: pp.skinIndex, profileIcon: pp.profileIcon, isBot: false,
    }));
    wsSend(p.socket, JSON.stringify({
      type: 'cards_match_start',
      roomId,
      isHost: p.id === hostId,
      peers: [...peers, ...botList],
      bots: botList,
    }));
  }
  console.log(`[Cards] Partida iniciada: sala ${roomId}, ${players.length} real + ${slotsToFill} bot(s)`);
}

function tdQueuePosition(userId) {
  return tdQueue.findIndex(p => p.id === userId);
}

function tdAssignTeam(counts) {
  return counts.red <= counts.blue ? 'red' : 'blue';
}

function tdBroadcastQueueState() {
  const msg = JSON.stringify({ type: 'td_queue_state', queueLength: tdQueue.length, matchActive: !!tdMatch });
  for (const p of tdQueue) wsSend(p.socket, msg);
}

// Forma a próxima partida 2x2: roda assim que 4 jogadores reais estiverem
// na fila, OU — se não houver gente suficiente — após TD_WAIT_MS de espera,
// preenchendo as vagas vazias com bots (mesmo padrão do "Equipe Online"),
// para o torneio nunca ficar travado esperando jogadores que não aparecem.
// "Turnos revezados": só roda uma disputa por vez.
function tdTryStartMatch(allowBots = false) {
  if (tdMatch || tdQueue.length === 0) return;
  if (!allowBots && tdQueue.length < TD_MATCH_SIZE) return;

  if (tdWaitTimer) { clearTimeout(tdWaitTimer); tdWaitTimer = null; }

  const realCount = Math.min(TD_MATCH_SIZE, tdQueue.length);
  const chosen = tdQueue.splice(0, realCount);
  const teamCounts = { red: 0, blue: 0 };
  const players = chosen.map((p, idx) => {
    const team = tdAssignTeam(teamCounts);
    teamCounts[team]++;
    return { id: p.id, name: p.name, skinIndex: p.skinIndex, profileIcon: p.profileIcon, socket: p.socket, team, isBot: false, isHost: idx === 0 };
  });

  const slotsToFill = TD_MATCH_SIZE - players.length;
  const botSlots = [];
  const roomId = `${TD_ROOM_ID}_${tdMatchSeq++}`;
  for (let i = 0; i < slotsToFill; i++) {
    const team = tdAssignTeam(teamCounts);
    teamCounts[team]++;
    const botId = `bot_${roomId}_${i}`;
    const profile = botProfileForSlot(i);
    botSlots.push({ id: botId, name: profile.name, skinIndex: profile.skinIndex, profileIcon: 0, team, isBot: true, isHost: false });
  }

  tdMatch = {
    roomId,
    players,
    teamCounts,
    started: true,
    botIds: new Set(botSlots.map(b => b.id)),
    hostId: players[0]?.id ?? null,
    // Carimba a elegibilidade no início da partida — garante que uma
    // disputa iniciada durante a janela do torneio premie o vencedor mesmo
    // que ela termine logo após o prazo (e vice-versa: não premia se
    // começou fora da janela mesmo terminando "dentro" por acaso de relógio).
    tournamentEligible: economy.isTournamentActive(),
  };

  for (const p of players) {
    const info = socks.get(p.socket);
    if (info) { info.roomId = roomId; info.team = p.team; }
    const room = getRoomOrCreate(roomId);
    room.players.set(p.id, { socket: p.socket, state: null });
  }

  const playersPayload = players.map(p => ({
    id: p.id, name: p.name, skinIndex: p.skinIndex, profileIcon: p.profileIcon, team: p.team, isBot: false, isHost: p.isHost,
  })).concat(botSlots);

  for (const p of players) {
    wsSend(p.socket, JSON.stringify({
      type: 'td_match_start',
      roomId,
      players: playersPayload,
      you: { id: p.id, team: p.team, isHost: p.isHost },
    }));
  }

  console.log(`[TORNEIO] Tower Defense iniciado em "${roomId}" — ${players.length} jogador(es) real(is) + ${botSlots.length} bot(s)`);
  tdBroadcastQueueState();
}

function joinTdQueue(socket, info, name, skinIndex, profileIcon) {
  if (!economy.isTournamentActive()) {
    wsSend(socket, JSON.stringify({ type: 'td_unavailable', reason: 'tournament_ended' }));
    return;
  }
  if (tdQueue.length >= TD_QUEUE_MAX || tdQueuePosition(info.id) !== -1) {
    wsSend(socket, JSON.stringify({ type: 'td_unavailable', reason: 'queue_full' }));
    return;
  }

  tdQueue.push({ id: info.id, name, skinIndex, profileIcon, socket });
  info.name = name;
  info.skinIndex = skinIndex;
  console.log(`[TORNEIO] ${name} entrou na fila do Tower Defense (${tdQueue.length}/${TD_QUEUE_MAX})`);

  tdBroadcastQueueState();
  tdTryStartMatch();

  // Sem jogadores suficientes para fechar 2x2 real: agenda o preenchimento
  // com bots após TD_WAIT_MS, para a fila nunca ficar travada indefinidamente.
  if (!tdMatch && tdQueue.length > 0 && tdQueue.length < TD_MATCH_SIZE && !tdWaitTimer) {
    tdWaitTimer = setTimeout(() => { tdWaitTimer = null; tdTryStartMatch(true); }, TD_WAIT_MS);
  }
}

function leaveTdQueue(socket, info) {
  const idx = tdQueuePosition(info.id);
  if (idx !== -1) {
    tdQueue.splice(idx, 1);
    tdBroadcastQueueState();
  }
  if (tdQueue.length === 0 && tdWaitTimer) {
    clearTimeout(tdWaitTimer);
    tdWaitTimer = null;
  }
}

// Encerra a partida ativa e libera o próximo par de times da fila —
// chamado quando o cliente reporta `td_match_end` (torre conquistada).
function tdEndMatch(roomId, winnerTeam) {
  if (!tdMatch || tdMatch.roomId !== roomId) return;
  const finished = tdMatch;
  tdMatch = null;

  if (finished.tournamentEligible && (winnerTeam === 'red' || winnerTeam === 'blue')) {
    for (const p of finished.players) {
      if (p.team !== winnerTeam) continue;
      const info = socks.get(p.socket);
      if (!info || info.userId === null) continue;
      try {
        if (!db.ownsSkin.get(info.userId, economy.TOURNAMENT_SKIN_ID)) {
          db.grantSkin.run(info.userId, economy.TOURNAMENT_SKIN_ID);
          wsSend(p.socket, JSON.stringify({ type: 'td_reward_granted', skinId: economy.TOURNAMENT_SKIN_ID }));
          console.log(`[TORNEIO] ${info.name} (time ${winnerTeam}) recebeu a skin "Hex Champion" pela vitória no Tower Defense`);
        }
      } catch (e) {
        console.error('[TORNEIO] Falha ao conceder skin de recompensa:', e.message);
      }
    }
  }

  rooms.delete(roomId);
  console.log(`[TORNEIO] Tower Defense "${roomId}" encerrado — vencedor: ${winnerTeam || 'ninguém'}`);
  tdBroadcastQueueState();
  tdTryStartMatch();
  if (!tdMatch && tdQueue.length > 0 && tdQueue.length < TD_MATCH_SIZE && !tdWaitTimer) {
    tdWaitTimer = setTimeout(() => { tdWaitTimer = null; tdTryStartMatch(true); }, TD_WAIT_MS);
  }
}

function tdHandleDisconnect(socket, info) {
  leaveTdQueue(socket, info);
  if (tdMatch && tdMatch.roomId === info.roomId) {
    // Jogador saiu durante a partida: o time adversário vence por W.O.
    const leaver = tdMatch.players.find(p => p.socket === socket);
    const winnerTeam = leaver ? (leaver.team === 'red' ? 'blue' : 'red') : null;
    tdEndMatch(info.roomId, winnerTeam);
  }
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

  if (urlPath.startsWith('/api/')) { handleApi(req, res, urlPath); return; }

  if (urlPath === '/') urlPath = '/index.html';
  // Painel admin: qualquer um pode carregar o HTML (o JS dentro verifica sessão),
  // mas bloqueia acesso direto de IPs externos em produção como defesa extra.
  if (urlPath === '/admin.html' || urlPath === '/admin') {
    const ip = req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (!isLocal && process.env.NODE_ENV === 'production') {
      res.writeHead(404); res.end('Not found'); return;
    }
    if (urlPath === '/admin') urlPath = '/admin.html';
  }
  const filePath = path.join(ROOT, urlPath);

  // Segurança: não servir fora do ROOT
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  // Segurança: nunca servir banco de dados, segredos ou código backend —
  // só o cliente web (HTML, módulos do jogo, sprites, sons) deve ser público.
  const PRIVATE_PATTERNS = [
    /^[\\/]data[\\/]/i,
    /^[\\/]\.env/i,
    /^[\\/]\.git/i,
    /^[\\/]node_modules[\\/]/i,
    /^[\\/]package(-lock)?\.json$/i,
    /^[\\/]server\.js$/i,
    /^[\\/]src[\\/](db|api|auth|economy|payments|ratelimit)\.js$/i,
  ];
  const relPath = filePath.slice(ROOT.length);
  if (PRIVATE_PATTERNS.some(re => re.test(relPath))) { res.writeHead(404); res.end('Not found'); return; }

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
  // Resolve identidade pelo cookie de sessão (enviado automaticamente pelo
  // navegador no handshake, por ser same-origin). Jogadores autenticados têm
  // nome e skin equipada vindos do banco — não confiamos no que o client envia.
  const sessionUser = auth.resolveUserFromCookieHeader(req.headers.cookie);
  socks.set(socket, {
    id,
    name:        sessionUser ? sessionUser.display_name : `Jogador${id}`,
    roomId:      'default',
    skinIndex:   sessionUser ? sessionUser.equipped_skin : 0,
    profileIcon: sessionUser ? sessionUser.profile_icon : 0,
    userId:      sessionUser ? sessionUser.id : null,
  });

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
  // Informa a todos o novo total de conectados
  broadcastOnlineCount();
});

function broadcastOnlineCount() {
  const count = socks.size;
  const msg = JSON.stringify({ type: 'online_count', count });
  for (const [s] of socks) wsSend(s, msg);
}

function broadcastLobbyChat(from, text) {
  const msg = JSON.stringify({ type: 'lobby_chat', name: from, text });
  for (const [s] of socks) wsSend(s, msg);
}

function onDisconnect(socket) {
  const info = socks.get(socket);
  if (!info) return;
  socks.delete(socket);
  broadcastOnlineCount();
  if (info.roomId && info.roomId.startsWith('equipe_online_')) leaveTeamQueue(socket, info);
  if (info.roomId && info.roomId.startsWith(TD_ROOM_ID)) tdHandleDisconnect(socket, info);
  else leaveTdQueue(socket, info);
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
      if (isLocked()) {
        wsSend(socket, JSON.stringify({ type: 'maintenance_locked', status: maintenanceStatus() }));
        return;
      }
      // Para visitantes anônimos (userId null), aceitamos nome/skin enviados
      // pelo client. Para autenticados, esses dados já vieram do banco no
      // momento do upgrade — ignoramos o que o client manda para impedir
      // spoofing de identidade ou uso de skins não compradas.
      if (info.userId === null) {
        info.name      = msg.name      || info.name;
        info.skinIndex = msg.skinIndex ?? 0;
      }
      info.roomId    = msg.roomId    || 'default';
      const room = getRoomOrCreate(info.roomId);
      room.players.set(info.id, { socket, state: null });
      // Informa o novo cliente do seu ID e dos jogadores já na sala
      const peers = [...room.players.entries()]
        .filter(([pid]) => pid !== info.id)
        .map(([pid, p]) => {
          const pi = [...socks.entries()].find(([s]) => s === p.socket)?.[1];
          return pi ? { id: pid, name: pi.name, skinIndex: pi.skinIndex, profileIcon: pi.profileIcon } : null;
        }).filter(Boolean);
      wsSend(socket, JSON.stringify({ type: 'welcome', id: info.id, peers }));
      broadcastRoom(info.roomId, { type: 'join', id: info.id, name: info.name, skinIndex: info.skinIndex, profileIcon: info.profileIcon }, socket);
      console.log(`[WS] ${info.name} entrou na sala "${info.roomId}" (${room.players.size} jogadores)`);
      break;
    }
    case 'queue_join': {
      if (isLocked()) {
        wsSend(socket, JSON.stringify({ type: 'maintenance_locked', status: maintenanceStatus() }));
        return;
      }
      // Fila de matchmaking do modo "Equipe Online" (PvP 3x3) — substitui
      // o antigo fluxo cooperativo de sala fixa para esse modo de jogo.
      if (info.userId === null) {
        info.name      = msg.name      || info.name;
        info.skinIndex = msg.skinIndex ?? 0;
      }
      joinTeamQueue(socket, info, info.name, info.skinIndex, info.profileIcon);
      // Avisa o cliente do seu próprio ID — ele precisa antes de "match_start"
      // chegar (não há snapshot de peers aqui: a lista completa virá em
      // "match_start" assim que a partida for formada).
      wsSend(socket, JSON.stringify({ type: 'welcome', id: info.id, peers: [] }));
      break;
    }
    case 'td_queue_join': {
      if (isLocked()) {
        wsSend(socket, JSON.stringify({ type: 'maintenance_locked', status: maintenanceStatus() }));
        return;
      }
      // Fila do Torneio "Tower Defense" (PvP 2x2, torre central, turnos
      // revezados — só uma disputa ativa por vez, até 8 na fila).
      if (info.userId === null) {
        info.name      = msg.name      || info.name;
        info.skinIndex = msg.skinIndex ?? 0;
      }
      joinTdQueue(socket, info, info.name, info.skinIndex, info.profileIcon);
      wsSend(socket, JSON.stringify({ type: 'welcome', id: info.id, peers: [] }));
      break;
    }
    case 'queue_leave':
      leaveTeamQueue(socket, info);
      break;
    case 'td_queue_leave':
      leaveTdQueue(socket, info);
      break;
    case 'cards_queue_join': {
      if (isLocked()) { wsSend(socket, JSON.stringify({ type: 'cards_unavailable', reason:'locked' })); break; }
      const already = cardsQueue.findIndex(p => p.id === info.id) !== -1;
      if (already) break;
      if (cardsQueue.length >= CARDS_MATCH_SIZE) { flushCardsQueue(true); }
      cardsQueue.push({ id: info.id, name: info.name, skinIndex: info.skinIndex, profileIcon: info.profileIcon, socket });
      wsSend(socket, JSON.stringify({ type: 'cards_queue_state', position: cardsQueue.length }));
      if (cardsQueue.length >= CARDS_MATCH_SIZE) {
        flushCardsQueue(false);
      } else if (!cardsWaitTimer) {
        cardsWaitTimer = setTimeout(() => { cardsWaitTimer = null; flushCardsQueue(true); }, CARDS_WAIT_MS);
      }
      break;
    }
    case 'cards_queue_leave': {
      const qi = cardsQueue.findIndex(p => p.id === info.id);
      if (qi !== -1) cardsQueue.splice(qi, 1);
      break;
    }
    case 'td_match_end': {
      // Reportado pelo cliente que presenciou a torre central ser destruída
      // e conquistada — qualquer jogador da partida pode reportar; o servidor
      // ignora reportes duplicados (tdMatch já é null após o primeiro).
      const winnerTeam = msg.winnerTeam === 'red' || msg.winnerTeam === 'blue' ? msg.winnerTeam : null;
      if (tdMatch && tdMatch.roomId === info.roomId) tdEndMatch(info.roomId, winnerTeam);
      break;
    }
    case 'state':
      broadcastRoom(info.roomId, { type: 'state', id: info.id, data: msg.data }, socket);
      break;
    case 'event':
      broadcastRoom(info.roomId, { type: 'event', id: info.id, data: msg.data }, socket);
      break;
    case 'bot_state':
    case 'bot_event': {
      // Repasse de estado/evento de bots simulados pelo anfitrião dos modos
      // "Equipe Online" e "Tower Defense". Só aceitamos de quem é realmente
      // o anfitrião da sala/partida, e só para IDs de bot que o servidor
      // atribuiu a essa sala — evita spoofing de identidade por outros jogadores.
      const tr = teamRooms.get(info.roomId);
      const validRoom = (tr && tr.hostId === info.id && tr.botIds?.has(msg.botId))
        || (tdMatch && tdMatch.roomId === info.roomId && tdMatch.hostId === info.id && tdMatch.botIds?.has(msg.botId));
      if (!validRoom) break;
      broadcastRoom(info.roomId, {
        type: msg.type === 'bot_state' ? 'state' : 'event',
        id: msg.botId,
        data: msg.data,
      }, socket);
      break;
    }
    case 'chat':
      broadcastRoom(info.roomId, { type: 'chat', id: info.id, name: info.name, text: msg.text });
      break;
    case 'lobby_chat': {
      const text = String(msg.text || '').trim().slice(0, 200);
      if (!text) break;
      broadcastLobbyChat(info.name, text);
      break;
    }
    case 'ping':
      // Eco simples para medição de latência local — devolve o timestamp
      // enviado pelo cliente, que calcula o RTT (round-trip time) sozinho.
      wsSend(socket, JSON.stringify({ type: 'pong', t: msg.t }));
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

// Envia mensagem WebSocket para um usuário autenticado pelo userId do banco.
// Usado por src/api.js para notificar mudanças feitas pelo admin em tempo real.
function notifyUser(userId, msgObj) {
  const text = JSON.stringify(msgObj);
  for (const [socket, info] of socks) {
    if (info.userId === userId) wsSend(socket, text);
  }
}
// Envia mensagem para todos os clientes conectados (autenticados ou não).
function broadcastAll(msgObj) {
  const text = JSON.stringify(msgObj);
  for (const socket of socks.keys()) wsSend(socket, text);
}

// Injeta funções no módulo api (resolve dependência circular)
setNotifyUser(notifyUser);
setBroadcastAll(broadcastAll);
module.exports = { notifyUser, broadcastAll };

server.listen(PORT, () => {
  console.log(`\n  Tower Defense Space`);
  console.log(`  Servidor: http://localhost:${PORT}`);
  console.log(`  Aguardando jogadores...\n`);
});
