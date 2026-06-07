'use strict';
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const db = require('./db');

const SESSION_SECRET   = process.env.SESSION_SECRET || 'dev-secret-change-me-in-prod';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient     = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// ── Hash de senha (crypto.scrypt nativo — sem dependências externas) ──────
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored) return false;
  const [scheme, salt, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;
  const hash = crypto.scryptSync(plain, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

// ── Verificação do ID token do Google Sign-In ─────────────────────────────
async function verifyGoogleIdToken(idToken) {
  if (!googleClient) throw new Error('GOOGLE_CLIENT_ID não configurado no servidor');
  const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  return { googleId: payload.sub, email: payload.email, name: payload.name || payload.email };
}

// ── Tokens de sessão assinados (HMAC) ──────────────────────────────────────
function signToken(token) {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
  return `${token}.${sig}`;
}

function unsignToken(signed) {
  if (!signed || typeof signed !== 'string') return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const token = signed.slice(0, i);
  const sig   = signed.slice(i + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return token;
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Cookies ────────────────────────────────────────────────────────────────
function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function startSession(userId) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.createSession.run(token, userId, expiresAt);
  return signToken(token);
}

function resolveUserFromCookieHeader(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader);
  const raw = cookies['arena_session'];
  const token = unsignToken(raw);
  if (!token) return null;
  const session = db.findSession.get(token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.deleteSession.run(token);
    return null;
  }
  return db.findUserById.get(session.user_id) || null;
}

function destroySessionFromCookieHeader(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader);
  const token = unsignToken(cookies['arena_session']);
  if (token) db.deleteSession.run(token);
}

module.exports = {
  hashPassword, verifyPassword, verifyGoogleIdToken,
  signToken, unsignToken, newSessionToken,
  parseCookieHeader, startSession, resolveUserFromCookieHeader, destroySessionFromCookieHeader,
  GOOGLE_CLIENT_ID,
};
