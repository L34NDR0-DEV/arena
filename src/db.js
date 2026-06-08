'use strict';
// Banco de dados SQLite (node:sqlite, nativo do Node — sem dependências externas).
// Local do arquivo configurável via DB_PATH (padrão: arena-web/data/arena.db).
// Para mover para um VPS depois, basta apontar DB_PATH para o novo caminho.
const path = require('path');
const fs   = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'arena.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  email                 TEXT UNIQUE NOT NULL,
  display_name          TEXT NOT NULL,
  password_hash         TEXT,
  google_id             TEXT UNIQUE,
  credits               INTEGER NOT NULL DEFAULT 0,
  equipped_skin         INTEGER NOT NULL DEFAULT 6,
  reward_progress_count INTEGER NOT NULL DEFAULT 0,
  reward_modes_seen     TEXT NOT NULL DEFAULT '[]',
  reward_hour_count     INTEGER NOT NULL DEFAULT 0,
  reward_hour_started   TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

CREATE TABLE IF NOT EXISTS owned_skins (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skin_id     INTEGER NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, skin_id)
);
CREATE INDEX IF NOT EXISTS idx_owned_skins_user ON owned_skins(user_id);

CREATE TABLE IF NOT EXISTS matches (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode                TEXT NOT NULL,
  difficulty          TEXT,
  win                 INTEGER NOT NULL,
  score               INTEGER NOT NULL DEFAULT 0,
  kills               INTEGER NOT NULL DEFAULT 0,
  skin_id             INTEGER,
  counted_for_reward  INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_matches_user_created ON matches(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS credit_orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id       TEXT NOT NULL,
  credits_amount   INTEGER NOT NULL,
  price_cents      INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  mp_preference_id TEXT,
  mp_payment_id    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_credit_orders_user       ON credit_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_orders_mp_payment ON credit_orders(mp_payment_id);
`);

// Migração leve: bancos criados antes da feature de recompensa horária não têm
// essas colunas (CREATE TABLE IF NOT EXISTS não altera tabelas existentes).
const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
if (!userColumns.includes('reward_hour_count')) {
  db.exec(`ALTER TABLE users ADD COLUMN reward_hour_count INTEGER NOT NULL DEFAULT 0`);
}
if (!userColumns.includes('reward_hour_started')) {
  db.exec(`ALTER TABLE users ADD COLUMN reward_hour_started TEXT`);
}
if (!userColumns.includes('profile_icon')) {
  db.exec(`ALTER TABLE users ADD COLUMN profile_icon INTEGER NOT NULL DEFAULT 0`);
}
if (!userColumns.includes('tutorial_seen')) {
  db.exec(`ALTER TABLE users ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0`);
}

const stmts = {
  insertUser:           db.prepare(`INSERT INTO users (email, display_name, password_hash, google_id) VALUES (?, ?, ?, ?)`),
  findUserByEmail:      db.prepare(`SELECT * FROM users WHERE email = ?`),
  findUserByGoogleId:   db.prepare(`SELECT * FROM users WHERE google_id = ?`),
  findUserById:         db.prepare(`SELECT * FROM users WHERE id = ?`),
  linkGoogleId:         db.prepare(`UPDATE users SET google_id = ? WHERE id = ?`),
  grantSkin:            db.prepare(`INSERT OR IGNORE INTO owned_skins (user_id, skin_id) VALUES (?, ?)`),
  ownsSkin:             db.prepare(`SELECT 1 AS one FROM owned_skins WHERE user_id = ? AND skin_id = ?`),
  listOwnedSkins:       db.prepare(`SELECT skin_id FROM owned_skins WHERE user_id = ?`),
  setEquippedSkin:      db.prepare(`UPDATE users SET equipped_skin = ? WHERE id = ?`),
  setProfileIcon:       db.prepare(`UPDATE users SET profile_icon = ? WHERE id = ?`),
  setDisplayName:       db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`),
  setTutorialSeen:      db.prepare(`UPDATE users SET tutorial_seen = 1 WHERE id = ?`),
  addCredits:           db.prepare(`UPDATE users SET credits = credits + ? WHERE id = ?`),
  spendCredits:         db.prepare(`UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?`),
  setRewardState:       db.prepare(`UPDATE users SET reward_progress_count = ?, reward_modes_seen = ? WHERE id = ?`),
  setRewardHourState:   db.prepare(`UPDATE users SET reward_hour_count = ?, reward_hour_started = ? WHERE id = ?`),
  insertMatch:          db.prepare(`INSERT INTO matches (user_id, mode, difficulty, win, score, kills, skin_id, counted_for_reward) VALUES (?,?,?,?,?,?,?,?)`),
  recentMatches:        db.prepare(`SELECT * FROM matches WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`),
  createSession:        db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`),
  findSession:          db.prepare(`SELECT * FROM sessions WHERE token = ?`),
  deleteSession:        db.prepare(`DELETE FROM sessions WHERE token = ?`),
  purgeExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`),

  insertOrder:          db.prepare(`INSERT INTO credit_orders (user_id, package_id, credits_amount, price_cents, status) VALUES (?, ?, ?, ?, 'pending')`),
  findOrderById:        db.prepare(`SELECT * FROM credit_orders WHERE id = ?`),
  findOrderByPreference:db.prepare(`SELECT * FROM credit_orders WHERE mp_preference_id = ?`),
  findOrderByPaymentId: db.prepare(`SELECT * FROM credit_orders WHERE mp_payment_id = ?`),
  setOrderPreference:   db.prepare(`UPDATE credit_orders SET mp_preference_id = ?, updated_at = datetime('now') WHERE id = ?`),
  setOrderStatus:       db.prepare(`UPDATE credit_orders SET status = ?, mp_payment_id = ?, updated_at = datetime('now') WHERE id = ?`),
  recentOrders:         db.prepare(`SELECT * FROM credit_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`),

  // Aprova o pedido e credita o saldo atomicamente, só se ainda 'pending'.
  // O filtro WHERE garante idempotência: reprocessar o mesmo webhook não soma duas vezes.
  approveOrderIfPending: db.prepare(`UPDATE credit_orders SET status = 'approved', mp_payment_id = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'`),
};

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, transaction, ...stmts };
