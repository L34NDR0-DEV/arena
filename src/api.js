'use strict';
const fs       = require('fs');
const path     = require('path');
const db       = require('./db');
const auth     = require('./auth');
const economy  = require('./economy');
const payments = require('./payments');
const receipt  = require('./receipt');
const mailer   = require('./mailer');
const { rateLimit } = require('./ratelimit');

const ADMIN_EMAIL = 'leandrosilva212010@gmail.com';

// Injetado pelo server.js após inicialização (evita dependência circular).
let _notifyUser   = () => {};
let _broadcastAll = () => {};
function setNotifyUser(fn)   { _notifyUser   = fn; }
function setBroadcastAll(fn) { _broadcastAll = fn; }

// ── Configuração da loja (preços customizados + promoção) ─────────
const SHOP_CONFIG_PATH = path.join(__dirname, '..', 'shop-config.json');

function loadShopConfig() {
  try {
    if (fs.existsSync(SHOP_CONFIG_PATH))
      return JSON.parse(fs.readFileSync(SHOP_CONFIG_PATH, 'utf8'));
  } catch(e) {}
  return { prices: {}, promo: {} };
}

function saveShopConfig(cfg) {
  fs.writeFileSync(SHOP_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

// ── Estado de manutenção (graceful shutdown) ───────────────────────────────
// Fases: 'off' → 'warning' (aviso, 60min) → 'locked' (sem novas partidas)
//        → 'draining' (aguardando partidas ativas) → 'off' (reabertura)
const maintenance = {
  phase: 'off',         // 'off' | 'warning' | 'locked' | 'draining'
  activatedAt: null,    // Date quando foi ativado
  lockedAt: null,       // Date quando trancou novas partidas
  warningMinutes: 60,   // minutos de aviso antes de trancar
  activeSessions: new Set(), // IDs de partidas ativas reportadas pelo client
};

function maintenanceStatus() {
  const now = Date.now();
  let minutesLeft = null;
  if (maintenance.phase === 'warning' && maintenance.activatedAt) {
    minutesLeft = Math.max(0, Math.round(
      maintenance.warningMinutes - (now - maintenance.activatedAt) / 60000
    ));
  }
  return {
    phase: maintenance.phase,
    minutesLeft,
    activeSessions: maintenance.activeSessions.size,
    activatedAt: maintenance.activatedAt,
  };
}

// Exporta para o server.js verificar se pode bloquear novas conexões
function isLocked()   { return maintenance.phase === 'locked' || maintenance.phase === 'draining'; }
function isWarning()  { return maintenance.phase === 'warning'; }
function isOff()      { return maintenance.phase === 'off'; }

// ── Presença online — rastrea quais userIds estão ativos ───────────────────
// Considera online quem mandou heartbeat nos últimos 90s.
const onlinePresence = new Map(); // userId -> timestamp
const ONLINE_TTL_MS  = 90_000;

function markOnline(userId) {
  onlinePresence.set(userId, Date.now());
}
function isOnline(userId) {
  const t = onlinePresence.get(userId);
  return !!t && (Date.now() - t) < ONLINE_TTL_MS;
}
// Limpa entradas expiradas a cada 2 minutos
setInterval(() => {
  const now = Date.now();
  for (const [uid, t] of onlinePresence) {
    if (now - t >= ONLINE_TTL_MS) onlinePresence.delete(uid);
  }
}, 120_000);
const MAX_BODY_BYTES = 1024 * 1024; // 1MB

function clientIp(req) {
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Aplica um limite de requisições; loga e responde 429 quando estourado.
// `keyFn` recebe (req, ctx) e retorna a chave de agrupamento (ex: por usuário ou IP).
function rateLimited(label, max, windowMs, keyFn) {
  return (req, ctx) => {
    const key = `${label}:${keyFn(req, ctx)}`;
    if (!rateLimit(key, max, windowMs)) {
      console.warn(`[ANTIFRAUDE] rate limit em "${label}" para ${key}`);
      return false;
    }
    return true;
  };
}

// ── Helpers de resposta ────────────────────────────────────────────────────
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req, cb) {
  let total = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) { req.destroy(); cb(new Error('payload_too_large')); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (!chunks.length) return cb(null, {});
    let parsed;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return cb(new Error('invalid_json')); }
    cb(null, parsed);
  });
  req.on('error', cb);
}

function setSessionCookie(res, signedToken) {
  const secure = COOKIE_SECURE ? '; Secure' : '';
  res.setHeader('Set-Cookie', `arena_session=${signedToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `arena_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    credits: user.credits,
    equippedSkin: user.equipped_skin,
    profileIcon: user.profile_icon,
  };
}

function profileFor(user) {
  const owned       = db.listOwnedSkins.all(user.id).map(r => r.skin_id);
  const ownedTrails = db.listOwnedTrails.all(user.id).map(r => r.trail_id);
  return {
    user: publicUser(user),
    ownedSkins: owned,
    equippedSkin: user.equipped_skin,
    ownedTrails,
    equippedTrail: user.equipped_trail ?? 0,
    profileIcon: user.profile_icon,
    tutorialSeen: !!user.tutorial_seen,
    rewardProgress: {
      count: user.reward_progress_count,
      modesSeen: JSON.parse(user.reward_modes_seen || '[]'),
      blockSize: economy.REWARD_BLOCK_SIZE,
      minModes: economy.REWARD_MIN_MODES,
      amount: economy.REWARD_AMOUNT,
    },
    promo: economy.isPromoActive() ? {
      skinIds: economy.PROMO_SKIN_IDS,
      price: economy.PROMO_PRICE,
      endsAt: economy.PROMO_ENDS_AT,
    } : null,
    customPrices: loadShopConfig().prices || {},
    userPromo: (() => {
      try { return user.user_promo ? JSON.parse(user.user_promo) : null; } catch { return null; }
    })(),
    tournament: {
      active: economy.isTournamentActive(),
      endsAt: economy.TOURNAMENT_ENDS_AT,
    },
  };
}

function startSessionAndRespond(res, status, userId) {
  const signed = auth.startSession(userId);
  setSessionCookie(res, signed);
  db.updateLastSeen?.run(userId);
  const user = db.findUserById.get(userId);
  sendJson(res, status, { user: publicUser(user) });
}

// ── Validação simples ──────────────────────────────────────────────────────
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function normalizeDisplayName(v) { return String(v || '').trim().slice(0, 20); }

// ── Rotas ──────────────────────────────────────────────────────────────────
const ROUTES = [
  {
    method: 'GET', path: '/api/config',
    handler: (req, res) => sendJson(res, 200, { googleClientId: auth.GOOGLE_CLIENT_ID }),
  },

  {
    method: 'POST', path: '/api/auth/register',
    rateLimit: rateLimited('auth', 8, 60_000, (req) => clientIp(req)),
    handler: (req, res, { body }) => {
      const email = normalizeEmail(body.email);
      const displayName = normalizeDisplayName(body.displayName);
      const password = String(body.password || '');

      if (!EMAIL_RE.test(email))      return sendJson(res, 400, { error: 'invalid_email' });
      if (!displayName)               return sendJson(res, 400, { error: 'missing_display_name' });
      if (password.length < 6)        return sendJson(res, 400, { error: 'weak_password' });
      if (db.findUserByEmail.get(email)) return sendJson(res, 409, { error: 'email_taken' });

      const passwordHash = auth.hashPassword(password);
      const userId = db.transaction(() => {
        const info = db.insertUser.run(email, displayName, passwordHash, null);
        const id = Number(info.lastInsertRowid);
        db.grantSkin.run(id, economy.FREE_SKIN_ID);
        return id;
      });
      startSessionAndRespond(res, 201, userId);
    },
  },

  {
    method: 'POST', path: '/api/auth/login',
    rateLimit: rateLimited('auth', 8, 60_000, (req) => clientIp(req)),
    handler: (req, res, { body }) => {
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');
      const user = db.findUserByEmail.get(email);
      if (!user || !auth.verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, { error: 'invalid_credentials' });
      }
      startSessionAndRespond(res, 200, user.id);
    },
  },

  {
    method: 'POST', path: '/api/auth/google',
    handler: async (req, res, { body }) => {
      const idToken = String(body.idToken || '');
      if (!idToken) return sendJson(res, 400, { error: 'missing_id_token' });

      let payload;
      try { payload = await auth.verifyGoogleIdToken(idToken); }
      catch { return sendJson(res, 401, { error: 'invalid_google_token' }); }

      let user = db.findUserByGoogleId.get(payload.googleId);
      if (!user) {
        const existingByEmail = db.findUserByEmail.get(normalizeEmail(payload.email));
        if (existingByEmail) {
          db.linkGoogleId.run(payload.googleId, existingByEmail.id);
          user = db.findUserById.get(existingByEmail.id);
        } else {
          const userId = db.transaction(() => {
            const info = db.insertUser.run(normalizeEmail(payload.email), normalizeDisplayName(payload.name) || 'PILOTO', null, payload.googleId);
            const id = Number(info.lastInsertRowid);
            db.grantSkin.run(id, economy.FREE_SKIN_ID);
            return id;
          });
          user = db.findUserById.get(userId);
        }
      }
      startSessionAndRespond(res, 200, user.id);
    },
  },

  {
    method: 'POST', path: '/api/auth/logout',
    handler: (req, res) => {
      auth.destroySessionFromCookieHeader(req.headers.cookie);
      clearSessionCookie(res);
      res.writeHead(204);
      res.end();
    },
  },

  {
    method: 'GET', path: '/api/me',
    handler: (req, res, { user }) => {
      if (!user) return sendJson(res, 200, { loggedIn: false });
      markOnline(user.id);
      sendJson(res, 200, profileFor(user));
    },
  },

  {
    method: 'GET', path: '/api/admin/users',
    auth: true,
    handler: (req, res, { user }) => {
      if (user.email !== 'leandrosilva212010@gmail.com') return sendJson(res, 403, { error: 'forbidden' });
      const total = db.countUsers.get().total;
      const users = db.listUsers.all().map(u => ({
        id: u.id, email: u.email, name: u.display_name,
        credits: u.credits, blocked: !!u.blocked,
        online: isOnline(u.id), createdAt: u.created_at, lastSeenAt: u.last_seen_at,
      }));
      sendJson(res, 200, { total, users });
    },
  },

  {
    method: 'POST', path: '/api/shop/buy',
    auth: true,
    rateLimit: rateLimited('shop_buy', 5, 10_000, (req, { user }) => user.id),
    handler: (req, res, { body, user }) => {
      const skinId = Number(body.skinId);
      if (!Number.isInteger(skinId) || skinId < 0 || skinId > 15) {
        return sendJson(res, 400, { error: 'invalid_skin' });
      }
      if (db.ownsSkin.get(user.id, skinId)) return sendJson(res, 409, { error: 'already_owned' });

      // Preço considera a promoção por tempo limitado (Ponta BR / Alien Disc) —
      // calculado no servidor para não confiar em valor enviado pelo client.
      const owned = db.listOwnedSkins.all(user.id).map(r => r.skin_id);
      const price = economy.skinPriceFor(skinId, owned);

      const ok = db.transaction(() => {
        const result = db.spendCredits.run(price, user.id, price);
        if (result.changes === 0) return false;
        db.grantSkin.run(user.id, skinId);
        return true;
      });
      if (!ok) return sendJson(res, 409, { error: 'insufficient_credits' });

      const fresh = db.findUserById.get(user.id);
      sendJson(res, 200, profileFor(fresh));
    },
  },

  {
    method: 'POST', path: '/api/shop/equip',
    auth: true,
    rateLimit: rateLimited('shop_equip', 5, 10_000, (req, { user }) => user.id),
    handler: (req, res, { body, user }) => {
      const skinId = Number(body.skinId);
      if (!Number.isInteger(skinId) || skinId < 0 || skinId > 15) {
        return sendJson(res, 400, { error: 'invalid_skin' });
      }
      if (!db.ownsSkin.get(user.id, skinId)) return sendJson(res, 403, { error: 'not_owned' });

      db.setEquippedSkin.run(skinId, user.id);
      sendJson(res, 200, { ok: true, equippedSkin: skinId });
    },
  },

  // Comprar rastro
  {
    method: 'POST', path: '/api/shop/trail/buy',
    auth: true,
    rateLimit: rateLimited('shop_buy', 5, 10_000, (req, { user }) => user.id),
    handler: (req, res, { body, user }) => {
      const trailId = Number(body.trailId);
      if (!Number.isInteger(trailId) || trailId < 1 || trailId > 10) {
        return sendJson(res, 400, { error: 'invalid_trail' });
      }
      if (db.ownsTrail.get(user.id, trailId)) return sendJson(res, 409, { error: 'already_owned' });
      const cfg = loadShopConfig();
      const TRAIL_PRICES = cfg.trailPrices || {};
      // Preços padrão dos rastros (podem ser sobrescritos pelo admin)
      const DEFAULT_PRICES = { 1:300, 2:300, 3:400, 4:400, 5:600, 6:600 };
      const price = TRAIL_PRICES[trailId] ?? DEFAULT_PRICES[trailId] ?? 300;
      const ok = db.transaction(() => {
        const result = db.spendCredits.run(price, user.id, price);
        if (result.changes === 0) return false;
        db.grantTrail.run(user.id, trailId);
        return true;
      });
      if (!ok) return sendJson(res, 409, { error: 'insufficient_credits' });
      const fresh = db.findUserById.get(user.id);
      sendJson(res, 200, profileFor(fresh));
    },
  },

  // Equipar rastro
  {
    method: 'POST', path: '/api/shop/trail/equip',
    auth: true,
    rateLimit: rateLimited('shop_equip', 5, 10_000, (req, { user }) => user.id),
    handler: (req, res, { body, user }) => {
      const trailId = Number(body.trailId);
      if (!Number.isInteger(trailId) || trailId < 0 || trailId > 10) {
        return sendJson(res, 400, { error: 'invalid_trail' });
      }
      if (trailId !== 0 && !db.ownsTrail.get(user.id, trailId)) {
        return sendJson(res, 403, { error: 'not_owned' });
      }
      db.setEquippedTrail.run(trailId, user.id);
      sendJson(res, 200, { ok: true, equippedTrail: trailId });
    },
  },

  {
    method: 'POST', path: '/api/profile/icon',
    auth: true,
    rateLimit: rateLimited('profile_icon', 10, 10_000, (req, { user }) => user.id),
    handler: (req, res, { body, user }) => {
      const iconId = Number(body.iconId);
      // Conjunto de ícones de perfil é fixo (definido no client em PROFILE_ICONS) —
      // 0..PROFILE_ICON_COUNT-1, sem custo nem posse (todo jogador pode trocar livremente).
      if (!Number.isInteger(iconId) || iconId < 0 || iconId > 23) {
        return sendJson(res, 400, { error: 'invalid_icon' });
      }
      db.setProfileIcon.run(iconId, user.id);
      sendJson(res, 200, { ok: true, profileIcon: iconId });
    },
  },

  {
    method: 'POST', path: '/api/profile/name',
    auth: true,
    rateLimit: rateLimited('profile_name', 5, 60_000, (req, { user }) => user.id),
    handler: (req, res, { body, user }) => {
      const displayName = normalizeDisplayName(body.displayName);
      if (!displayName) return sendJson(res, 400, { error: 'missing_display_name' });

      db.setDisplayName.run(displayName, user.id);
      sendJson(res, 200, { ok: true, displayName });
    },
  },

  {
    method: 'POST', path: '/api/profile/tutorial-seen',
    auth: true,
    rateLimit: rateLimited('tutorial_seen', 5, 60_000, (req, { user }) => user.id),
    handler: (req, res, { user }) => {
      db.setTutorialSeen.run(user.id);
      sendJson(res, 200, { ok: true });
    },
  },

  {
    method: 'POST', path: '/api/matches',
    auth: true,
    rateLimit: rateLimited('matches', 20, 60_000, (req, { user }) => user.id),
    handler: (req, res, { body, user }) => {
      const mode = String(body.mode || 'livre').slice(0, 30);
      const difficulty = body.difficulty ? String(body.difficulty).slice(0, 20) : null;
      const win = body.win ? 1 : 0;
      const score = Number.isFinite(body.score) ? Math.trunc(body.score) : 0;
      const kills = Number.isFinite(body.kills) ? Math.trunc(body.kills) : 0;

      // O skinId enviado só é aceito se o jogador realmente possui a skin —
      // caso contrário usamos a equipada no banco. Evita registrar partidas
      // "vencidas" com naves não compradas (vetor de inconsistência de dados).
      const requestedSkin = Number.isInteger(body.skinId) ? body.skinId : null;
      const skinId = (requestedSkin !== null && db.ownsSkin.get(user.id, requestedSkin))
        ? requestedSkin
        : user.equipped_skin;

      // Dados ricos do resultado (itens coletados, nível, nome da skin) não têm
      // coluna própria — guardamos como JSON em `details` para reconstruir o
      // histórico completo (igual ao exibido localmente) em qualquer dispositivo.
      const items = Number.isFinite(body.items) ? Math.trunc(body.items) : 0;
      const level = Number.isFinite(body.level) ? Math.trunc(body.level) : 1;
      const skinName = body.skinName ? String(body.skinName).slice(0, 40) : null;
      let itemTypeCounts = null;
      if (body.itemTypeCounts && typeof body.itemTypeCounts === 'object') {
        itemTypeCounts = {};
        for (const [type, count] of Object.entries(body.itemTypeCounts).slice(0, 40)) {
          if (Number.isFinite(count)) itemTypeCounts[String(type).slice(0, 30)] = Math.trunc(count);
        }
      }
      const details = JSON.stringify({ items, level, skinName, itemTypeCounts });

      const result = db.transaction(() => {
        const reward = economy.recordMatchAndMaybeReward(user.id, { mode, win: !!win });
        db.insertMatch.run(user.id, mode, difficulty, win, score, kills, skinId, reward.rewardGranted ? 1 : (win ? 1 : 0), details);
        return reward;
      });

      const fresh = db.findUserById.get(user.id);
      sendJson(res, 200, {
        rewardGranted: result.rewardGranted,
        creditsBalance: fresh.credits,
        rewardProgress: { count: result.progress, modesSeen: result.modesSeen },
      });
    },
  },

  {
    method: 'GET', path: '/api/matches/recent',
    auth: true,
    handler: (req, res, { user }) => {
      const matches = db.recentMatches.all(user.id, 20).map(r => {
        let extra = null;
        try { extra = r.details ? JSON.parse(r.details) : null; } catch { /* dado antigo/corrompido — ignora */ }
        return {
          id: r.id, mode: r.mode, difficulty: r.difficulty, win: r.win,
          score: r.score, kills: r.kills, skinId: r.skin_id, createdAt: r.created_at,
          items: extra?.items, level: extra?.level,
          skinName: extra?.skinName, itemTypeCounts: extra?.itemTypeCounts,
        };
      });
      sendJson(res, 200, { matches });
    },
  },

  {
    method: 'GET', path: '/api/payments/packages',
    handler: (req, res) => {
      sendJson(res, 200, { enabled: payments.isEnabled(), packages: Object.values(payments.CREDIT_PACKAGES) });
    },
  },

  {
    method: 'POST', path: '/api/payments/checkout',
    auth: true,
    rateLimit: rateLimited('checkout', 3, 60_000, (req, { user }) => user.id),
    handler: async (req, res, { body, user }) => {
      const packageId = String(body.packageId || '');
      if (!payments.CREDIT_PACKAGES[packageId]) return sendJson(res, 400, { error: 'invalid_package' });
      if (!payments.isEnabled()) return sendJson(res, 503, { error: 'payments_disabled' });

      try {
        const { checkoutUrl } = await payments.createCheckout(user, packageId);
        sendJson(res, 200, { checkoutUrl });
      } catch (err) {
        console.error('[PAGAMENTOS] erro ao criar checkout:', err.message);
        sendJson(res, 502, { error: 'checkout_failed' });
      }
    },
  },

  // IPN v1: MP envia GET ?topic=payment&id=123
  {
    method: 'GET', path: '/api/payments/webhook',
    handler: async (req, res, { query }) => {
      try {
        const result = await payments.handleWebhook(query, null);
        if (!result.ok) console.warn('[ANTIFRAUDE] webhook GET rejeitado:', result.reason);
      } catch (err) {
        console.error('[PAGAMENTOS] erro ao processar webhook GET:', err.message);
      }
      res.writeHead(200);
      res.end();
    },
  },

  // Webhooks v2: MP envia POST com body JSON { type, data: { id } }
  {
    method: 'POST', path: '/api/payments/webhook',
    handler: async (req, res, { body, query }) => {
      try {
        const result = await payments.handleWebhook(query, body);
        if (!result.ok) console.warn('[ANTIFRAUDE] webhook POST rejeitado:', result.reason);
      } catch (err) {
        console.error('[PAGAMENTOS] erro ao processar webhook POST:', err.message);
      }
      // O Mercado Pago espera 200 rapidamente, independentemente do resultado
      // interno — reenvios de notificação são tratados de forma idempotente.
      res.writeHead(200);
      res.end();
    },
  },

  {
    method: 'GET', path: '/api/payments/orders/recent',
    auth: true,
    handler: (req, res, { user }) => {
      const rows = db.recentOrders.all(user.id, 10);
      sendJson(res, 200, { orders: rows });
    },
  },

  // Envia comprovante por e-mail para o próprio usuário logado.
  {
    method: 'POST', path: '/api/payments/receipt',
    auth: true,
    rateLimit: rateLimited('receipt', 3, 300_000, (req, { user }) => user.id),
    handler: async (req, res, { body, user }) => {
      const orderId = Number(body.orderId);
      if (!Number.isInteger(orderId) || orderId <= 0) return sendJson(res, 400, { error: 'invalid_order' });

      const order = db.findOrderById.get(orderId);
      if (!order || order.user_id !== user.id) return sendJson(res, 404, { error: 'order_not_found' });
      if (order.status !== 'approved' && order.status !== 'refunded') return sendJson(res, 400, { error: 'order_not_approved' });

      if (!mailer.isConfigured()) return sendJson(res, 503, { error: 'email_not_configured' });

      const result = await receipt.sendReceiptEmail({
        order,
        userName: user.display_name,
        userEmail: user.email,
      });
      if (!result.ok) return sendJson(res, 502, { error: 'email_send_failed' });
      sendJson(res, 200, { sent: true });
    },
  },

  // Admin: lista todos os pedidos (apenas leandrosilva212010@gmail.com).
  {
    method: 'GET', path: '/api/admin/orders',
    auth: true,
    handler: (req, res, { user, query }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const limit = Math.min(Number(query.limit) || 50, 200);
      const rows  = db.recentOrdersAdmin.all(limit);
      sendJson(res, 200, { orders: rows });
    },
  },

  // Admin: executa reembolso de um pedido via API do Mercado Pago.
  {
    method: 'POST', path: '/api/admin/refund',
    auth: true,
    handler: async (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });

      const orderId = Number(body.orderId);
      if (!Number.isInteger(orderId) || orderId <= 0) return sendJson(res, 400, { error: 'invalid_order' });

      const order = db.findOrderById.get(orderId);
      if (!order) return sendJson(res, 404, { error: 'order_not_found' });
      if (order.status !== 'approved') return sendJson(res, 400, { error: `order_status_${order.status}` });

      if (!order.mp_payment_id) return sendJson(res, 400, { error: 'no_payment_id' });

      // Chama a API do Mercado Pago para estornar.
      const refundResult = await payments.refundPayment(order.mp_payment_id);
      if (!refundResult.ok) return sendJson(res, 502, { error: 'refund_failed', detail: refundResult.reason });

      // Debita os créditos e marca o pedido como reembolsado atomicamente.
      db.transaction(() => {
        db.setOrderStatus.run('refunded', order.mp_payment_id, orderId);
        // Debita apenas se o usuário ainda tiver saldo suficiente; caso contrário, zera.
        const orderUser = db.findUserById.get(order.user_id);
        const debit = Math.min(order.credits_amount, orderUser ? orderUser.credits : 0);
        if (debit > 0) db.spendCredits.run(debit, order.user_id, debit);
      });

      // Envia e-mail de confirmação do reembolso ao usuário.
      const orderUser = db.findUserById.get(order.user_id);
      if (orderUser && mailer.isConfigured()) {
        const updatedOrder = db.findOrderById.get(orderId);
        receipt.sendReceiptEmail({
          order: updatedOrder,
          userName: orderUser.display_name,
          userEmail: orderUser.email,
        }).catch(() => {});
      }

      console.log(`[ADMIN] Reembolso executado: pedido #${orderId}, usuário ${order.user_id}, R$ ${(order.price_cents/100).toFixed(2)}`);
      sendJson(res, 200, { refunded: true, orderId });
    },
  },

  // Admin: busca usuários por nome ou email
  {
    method: 'GET', path: '/api/admin/search',
    auth: true,
    handler: (req, res, { user, query }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const q = `%${(query.q || '').trim()}%`;
      const users = db.adminSearch.all(q, q).map(u => ({
        id: u.id, email: u.email, name: u.display_name,
        credits: u.credits, blocked: !!u.blocked,
        online: isOnline(u.id), createdAt: u.created_at, lastSeenAt: u.last_seen_at,
      }));
      sendJson(res, 200, { users });
    },
  },

  // Admin: detalhes completos de um usuário (skins + pedidos)
  {
    method: 'GET', path: '/api/admin/user',
    auth: true,
    handler: (req, res, { user, query }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const uid = Number(query.id);
      if (!Number.isInteger(uid) || uid <= 0) return sendJson(res, 400, { error: 'invalid_id' });
      const target = db.adminFindUser.get(uid);
      if (!target) return sendJson(res, 404, { error: 'not_found' });
      const skins  = db.listOwnedSkins.all(uid).map(r => r.skin_id);
      const trails = db.listOwnedTrails.all(uid).map(r => r.trail_id);
      const orders = db.adminUserOrders.all(uid);
      sendJson(res, 200, {
        id: target.id, email: target.email, name: target.display_name,
        credits: target.credits, blocked: !!target.blocked,
        createdAt: target.created_at, skins, trails, orders,
      });
    },
  },

  // Admin: ajusta créditos de um usuário (valor absoluto ou delta)
  {
    method: 'POST', path: '/api/admin/credits',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const uid    = Number(body.userId);
      const amount = Number(body.amount);
      const mode   = body.mode || 'set'; // 'set' | 'add' | 'subtract'
      if (!Number.isInteger(uid) || uid <= 0) return sendJson(res, 400, { error: 'invalid_user' });
      if (!Number.isInteger(amount) || amount < 0) return sendJson(res, 400, { error: 'invalid_amount' });
      const target = db.adminFindUser.get(uid);
      if (!target) return sendJson(res, 404, { error: 'not_found' });
      let newCredits;
      if (mode === 'add')      newCredits = target.credits + amount;
      else if (mode === 'subtract') newCredits = Math.max(0, target.credits - amount);
      else                     newCredits = amount;
      db.adminSetCredits.run(newCredits, uid);
      console.log(`[ADMIN] Créditos: user #${uid} ${target.credits} -> ${newCredits} (${mode} ${amount})`);
      _notifyUser(uid, { type: 'admin_update', kind: 'credits', credits: newCredits });
      sendJson(res, 200, { userId: uid, credits: newCredits });
    },
  },

  // Admin: dar ou remover uma skin de um usuário
  {
    method: 'POST', path: '/api/admin/skin',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const uid    = Number(body.userId);
      const skinId = Number(body.skinId);
      const action = body.action; // 'grant' | 'revoke' | 'revoke_all'
      if (!Number.isInteger(uid) || uid <= 0) return sendJson(res, 400, { error: 'invalid_user' });
      if (!db.adminFindUser.get(uid)) return sendJson(res, 404, { error: 'not_found' });
      if (action === 'revoke_all') {
        db.adminRemoveAllSkins.run(uid);
        console.log(`[ADMIN] Skins removidas: todas do user #${uid}`);
      } else if (action === 'grant') {
        if (!Number.isInteger(skinId)) return sendJson(res, 400, { error: 'invalid_skin' });
        db.grantSkin.run(uid, skinId);
        console.log(`[ADMIN] Skin concedida: skin #${skinId} -> user #${uid}`);
      } else if (action === 'revoke') {
        if (!Number.isInteger(skinId)) return sendJson(res, 400, { error: 'invalid_skin' });
        db.adminRemoveSkin.run(uid, skinId);
        console.log(`[ADMIN] Skin removida: skin #${skinId} do user #${uid}`);
      } else {
        return sendJson(res, 400, { error: 'invalid_action' });
      }
      const skins = db.listOwnedSkins.all(uid).map(r => r.skin_id);
      _notifyUser(uid, { type: 'admin_update', kind: 'skins', skins });
      sendJson(res, 200, { userId: uid, skins });
    },
  },

  // Admin: top compradores (por total gasto em CR)
  {
    method: 'GET', path: '/api/admin/top-buyers',
    auth: true,
    handler: (req, res, { user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const rows = db.topBuyers.all();
      sendJson(res, 200, { buyers: rows });
    },
  },

  // Admin: definir promoção individual para um usuário
  {
    method: 'POST', path: '/api/admin/user-promo',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const uid = Number(body.userId);
      if (!Number.isInteger(uid) || uid <= 0) return sendJson(res, 400, { error: 'invalid_user' });
      if (!db.adminFindUser.get(uid)) return sendJson(res, 404, { error: 'not_found' });
      // body.promo = null (remove) ou { skinIds, trailIds, discountPct, endsAt, note }
      const promoJson = body.promo ? JSON.stringify(body.promo) : null;
      db.setUserPromo.run(promoJson, uid);
      console.log(`[ADMIN] Promo individual: user #${uid}`, body.promo || 'removida');
      // Notifica o usuário em tempo real se estiver online
      if (body.promo) {
        _notifyUser(uid, { type: 'user_promo', promo: body.promo });
      }
      sendJson(res, 200, { ok: true });
    },
  },

  // Admin: dar ou remover rastro de um usuário
  {
    method: 'POST', path: '/api/admin/trail',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const uid     = Number(body.userId);
      const trailId = Number(body.trailId);
      const action  = body.action; // 'grant' | 'revoke' | 'revoke_all'
      if (!Number.isInteger(uid) || uid <= 0) return sendJson(res, 400, { error: 'invalid_user' });
      if (!db.adminFindUser.get(uid)) return sendJson(res, 404, { error: 'not_found' });
      if (action === 'revoke_all') {
        db.adminRemoveAllTrails.run(uid);
        console.log(`[ADMIN] Trails removidos: todos do user #${uid}`);
      } else if (action === 'grant') {
        if (!Number.isInteger(trailId) || trailId < 1) return sendJson(res, 400, { error: 'invalid_trail' });
        db.grantTrail.run(uid, trailId);
        console.log(`[ADMIN] Trail concedido: trail #${trailId} -> user #${uid}`);
      } else if (action === 'revoke') {
        if (!Number.isInteger(trailId) || trailId < 1) return sendJson(res, 400, { error: 'invalid_trail' });
        db.adminRemoveTrail.run(uid, trailId);
        console.log(`[ADMIN] Trail removido: trail #${trailId} do user #${uid}`);
      } else {
        return sendJson(res, 400, { error: 'invalid_action' });
      }
      const trails = db.listOwnedTrails.all(uid).map(r => r.trail_id);
      sendJson(res, 200, { userId: uid, trails });
    },
  },

  // Público: status do servidor (manutenção + modos desativados)
  {
    method: 'GET', path: '/api/server/status',
    handler: (req, res) => {
      const cfg = loadShopConfig();
      sendJson(res, 200, { ...maintenanceStatus(), disabledModes: cfg.disabledModes || [] });
    },
  },

  // Cliente reporta que tem partida ativa (heartbeat a cada 30s)
  {
    method: 'POST', path: '/api/server/heartbeat',
    auth: true,
    handler: (req, res, { body, user }) => {
      const sessionKey = `${user.id}`;
      if (body && body.inMatch) {
        maintenance.activeSessions.add(sessionKey);
      } else {
        maintenance.activeSessions.delete(sessionKey);
      }
      markOnline(user.id);
      sendJson(res, 200, maintenanceStatus());
    },
  },

  // Admin: ativar fase de manutenção
  {
    method: 'POST', path: '/api/admin/maintenance',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const action = body.action; // 'start' | 'lock' | 'off'

      if (action === 'start') {
        if (maintenance.phase !== 'off') return sendJson(res, 400, { error: 'already_active' });
        maintenance.phase       = 'warning';
        maintenance.activatedAt = Date.now();
        maintenance.lockedAt    = null;
        maintenance.activeSessions.clear();
        console.log('[MANUTENÇÃO] Fase 1: aviso ativado — 60 minutos para trancar');
        _broadcastAll({ type: 'server_notice', level: 'warning', text: `MANUTENCAO EM ${maintenance.warningMinutes} MIN`, subtext: 'Termine sua partida. O servidor sera reiniciado em breve.' });

        // Avança automaticamente para 'locked' após warningMinutes
        setTimeout(() => {
          if (maintenance.phase === 'warning') {
            maintenance.phase    = 'locked';
            maintenance.lockedAt = Date.now();
            console.log('[MANUTENÇÃO] Fase 2: novas partidas bloqueadas — aguardando partidas ativas');
            _broadcastAll({ type: 'server_notice', level: 'locked', text: 'SERVIDOR EM MANUTENCAO', subtext: 'Novas partidas bloqueadas. Finalize e volte em breve.' });
          }
        }, maintenance.warningMinutes * 60 * 1000);

      } else if (action === 'lock') {
        // Avança manualmente para locked antes dos 60min
        if (maintenance.phase !== 'warning') return sendJson(res, 400, { error: 'not_in_warning' });
        maintenance.phase    = 'locked';
        maintenance.lockedAt = Date.now();
        console.log('[MANUTENÇÃO] Fase 2 (manual): novas partidas bloqueadas');
        _broadcastAll({ type: 'server_notice', level: 'locked', text: 'SERVIDOR EM MANUTENCAO', subtext: 'Novas partidas bloqueadas. Finalize e volte em breve.' });

      } else if (action === 'off') {
        maintenance.phase       = 'off';
        maintenance.activatedAt = null;
        maintenance.lockedAt    = null;
        maintenance.activeSessions.clear();
        console.log('[MANUTENÇÃO] Sistema reaberto — manutenção encerrada');
        _broadcastAll({ type: 'server_notice', level: 'off', text: '', subtext: '' });

      } else {
        return sendJson(res, 400, { error: 'invalid_action' });
      }

      sendJson(res, 200, maintenanceStatus());
    },
  },

  // Admin: bloquear ou desbloquear conta
  {
    method: 'POST', path: '/api/admin/block',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const uid     = Number(body.userId);
      const blocked = body.blocked ? 1 : 0;
      if (!Number.isInteger(uid) || uid <= 0) return sendJson(res, 400, { error: 'invalid_user' });
      if (!db.adminFindUser.get(uid)) return sendJson(res, 404, { error: 'not_found' });
      db.adminSetBlocked.run(blocked, uid);
      console.log(`[ADMIN] Conta #${uid} ${blocked ? 'BLOQUEADA' : 'DESBLOQUEADA'}`);
      _notifyUser(uid, { type: 'admin_update', kind: 'blocked', blocked: !!blocked });
      sendJson(res, 200, { userId: uid, blocked: !!blocked });
    },
  },

  // Admin: ler configuração da loja (preços + promoção + modos)
  {
    method: 'GET', path: '/api/admin/shop',
    auth: true,
    handler: (req, res, { user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const cfg = loadShopConfig();
      sendJson(res, 200, {
        prices:        cfg.prices        || {},
        promo:         cfg.promo         || {},
        disabledModes: cfg.disabledModes || [],
      });
    },
  },

  // Admin: salvar preços customizados das skins
  {
    method: 'POST', path: '/api/admin/shop/prices',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const cfg = loadShopConfig();
      cfg.prices = body.prices || {};
      saveShopConfig(cfg);
      // Atualiza economy em memória para que skinPriceFor() use os novos valores imediatamente
      economy.applyAdminPrices(cfg.prices);
      console.log('[ADMIN] Precos da loja atualizados:', cfg.prices);
      _broadcastAll({ type: 'prices_update', prices: cfg.prices });
      sendJson(res, 200, { ok: true });
    },
  },

  // Admin: salvar promoção por tempo limitado
  {
    method: 'POST', path: '/api/admin/shop/promo',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const cfg = loadShopConfig();
      cfg.promo = {
        skinIds:  body.skinIds  || [],
        price:    Number(body.price) || 0,
        startsAt: body.startsAt || null,
        endsAt:   body.endsAt   || null,
      };
      saveShopConfig(cfg);
      economy.applyAdminPromo(cfg.promo);
      console.log('[ADMIN] Promocao atualizada:', cfg.promo);
      // Notifica todos os clientes para atualizar preços em tempo real
      _broadcastAll({ type: 'promo_update', promo: cfg.promo });
      sendJson(res, 200, { ok: true });
    },
  },

  // Cards of Defense: ranking público (top 20)
  {
    method: 'GET', path: '/api/cards/ranking',
    handler: (req, res) => {
      const rows = db.topCardsRanking.all();
      sendJson(res, 200, { ok: true, data: rows });
    },
  },

  // Cards of Defense: salvar resultado (auth, ignora bots)
  {
    method: 'POST', path: '/api/cards/ranking',
    auth: true,
    rateLimit: rateLimited('cards_rank', 10, 60_000, (req, { user }) => user.id),
    handler: (req, res, { body, user }) => {
      const score     = Math.round(Number(body.score)     || 0);
      const level     = Math.round(Number(body.level)     || 1);
      const kills     = Math.round(Number(body.kills)     || 0);
      const livesLeft = Math.round(Number(body.lives_left)|| 0);
      const cardsUsed = typeof body.cards_used === 'string' ? body.cards_used.slice(0, 500) : '';
      if (!Number.isFinite(score) || score < 0) return sendJson(res, 400, { error: 'invalid_score' });
      db.insertCardsRank.run(user.id, score, level, kills, livesLeft, cardsUsed);
      sendJson(res, 200, { ok: true });
    },
  },

  // Admin: salvar modos desativados
  {
    method: 'POST', path: '/api/admin/shop/modes',
    auth: true,
    handler: (req, res, { body, user }) => {
      if (user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'forbidden' });
      const cfg = loadShopConfig();
      cfg.disabledModes = Array.isArray(body.disabledModes) ? body.disabledModes : [];
      saveShopConfig(cfg);
      console.log('[ADMIN] Modos desativados:', cfg.disabledModes);
      sendJson(res, 200, { ok: true, disabledModes: cfg.disabledModes });
    },
  },
];

function matchRoute(method, urlPath) {
  return ROUTES.find(r => r.method === method && r.path === urlPath);
}

function parseQuery(req) {
  const idx = req.url.indexOf('?');
  if (idx === -1) return {};
  const out = {};
  for (const [k, v] of new URLSearchParams(req.url.slice(idx + 1))) out[k] = v;
  return out;
}

function handleApi(req, res, urlPath) {
  const route = matchRoute(req.method, urlPath);
  if (!route) return sendJson(res, 404, { error: 'not_found' });

  const user = auth.resolveUserFromCookieHeader(req.headers.cookie);
  if (route.auth && !user) return sendJson(res, 401, { error: 'unauthenticated' });
  if (user && user.blocked && user.email !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'account_blocked' });

  const query = parseQuery(req);

  if (req.method === 'GET') {
    if (route.rateLimit && !route.rateLimit(req, { user, query })) return sendJson(res, 429, { error: 'rate_limited' });
    try { route.handler(req, res, { user, query }); }
    catch (err) { console.error(err); sendJson(res, 500, { error: 'internal_error' }); }
    return;
  }

  readJsonBody(req, (err, body) => {
    if (err) return sendJson(res, 400, { error: 'invalid_body' });
    if (route.rateLimit && !route.rateLimit(req, { user, query, body })) return sendJson(res, 429, { error: 'rate_limited' });
    Promise.resolve()
      .then(() => route.handler(req, res, { body, user, query }))
      .catch((e) => { console.error(e); sendJson(res, 500, { error: 'internal_error' }); });
  });
}

module.exports = { handleApi, sendJson, isLocked, isWarning, maintenanceStatus, setNotifyUser, setBroadcastAll };
