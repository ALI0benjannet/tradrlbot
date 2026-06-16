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

const insertStmt = db.prepare(
  `INSERT INTO interactions (input, response, intent) VALUES (?, ?, ?)`
);
const listStmt = db.prepare(
  `SELECT id, input, response, intent, createdAt FROM interactions ORDER BY id DESC LIMIT 100`
);

export function recordInteraction({ input, response, intent = null }) {
  insertStmt.run(input, response, intent);
}

export function getHistory() {
  return listStmt.all();
}

export default db;
