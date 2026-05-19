import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'allin.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS funds (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      manager TEXT,
      scale REAL,
      inception TEXT,
      company TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fund_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_code TEXT NOT NULL,
      date TEXT NOT NULL,
      momentum REAL,
      risk_control REAL,
      risk_adjusted REAL,
      manager_score REAL,
      scale_score REAL,
      sector_match REAL,
      total REAL,
      FOREIGN KEY (fund_code) REFERENCES funds(code),
      UNIQUE(fund_code, date)
    );

    CREATE TABLE IF NOT EXISTS daily_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      fund_code TEXT NOT NULL,
      total_score REAL NOT NULL,
      signal TEXT NOT NULL,
      FOREIGN KEY (fund_code) REFERENCES funds(code),
      UNIQUE(date, rank)
    );
  `);
}
