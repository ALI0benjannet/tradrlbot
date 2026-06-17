import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Base SQLite locale pour l'historique des interactions.
// Utilise le module natif `node:sqlite` intégré à Node.js (aucune
// compilation C++ requise, contrairement à better-sqlite3).
const DB_PATH = resolve(process.env.SQLITE_PATH || './data/tradrly.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS interactions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    input     TEXT NOT NULL,
    response  TEXT NOT NULL,
    intent    TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Stockage clé/valeur générique (état persistant de l'UI : productivité, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS app_state (
    key       TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertStmt = db.prepare(
  `INSERT INTO interactions (input, response, intent) VALUES (?, ?, ?)`
);
const listStmt = db.prepare(
  `SELECT id, input, response, intent, createdAt FROM interactions ORDER BY id DESC LIMIT 100`
);

const getStateStmt = db.prepare(`SELECT value FROM app_state WHERE key = ?`);
const setStateStmt = db.prepare(
  `INSERT INTO app_state (key, value, updatedAt) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
);

export function recordInteraction({ input, response, intent = null }) {
  insertStmt.run(input, response, intent);
}

export function getHistory() {
  return listStmt.all();
}

// Lit un état persistant (renvoie l'objet JSON parsé ou `fallback`).
export function getState(key, fallback = null) {
  const row = getStateStmt.get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

// Écrit un état persistant (l'objet est sérialisé en JSON).
export function setState(key, value) {
  setStateStmt.run(key, JSON.stringify(value));
  return value;
}

export default db;
