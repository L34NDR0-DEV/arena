'use strict';
const db       = require('./db');
const auth     = require('./auth');
const economy  = require('./economy');
const payments = require('./payments');
const { rateLimit } = require('./ratelimit');

const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
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
  const owned = db.listOwnedSkins.all(user.id).map(r => r.skin_id);
  return {
    user: publicUser(user),
    ownedSkins: owned,
    equippedSkin: user.equipped_skin,
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
    tournament: {
      active: economy.isTournamentActive(),
      endsAt: economy.TOURNAMENT_ENDS_AT,
    },
  };
}

function startSessionAndRespond(res, status, userId) {
  const signed = auth.startSession(userId);
  setSessionCookie(res, signed);
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
        credits: u.credits, createdAt: u.created_at,
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

  {
    method: 'POST', path: '/api/payments/webhook',
    handler: async (req, res, { body, query }) => {
      try {
        const result = await payments.handleWebhook(query, body);
        if (!result.ok) console.warn('[ANTIFRAUDE] webhook de pagamento rejeitado:', result.reason);
      } catch (err) {
        console.error('[PAGAMENTOS] erro ao processar webhook:', err.message);
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

module.exports = { handleApi, sendJson };
