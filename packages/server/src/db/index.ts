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

    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      cost_nav REAL NOT NULL,
      shares REAL NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (code) REFERENCES funds(code)
    );

    CREATE TABLE IF NOT EXISTS stocks (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      market_cap REAL,
      pe REAL,
      pb REAL,
      roe REAL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      date TEXT NOT NULL,
      momentum REAL,
      risk_control REAL,
      risk_adjusted REAL,
      company_quality REAL,
      valuation REAL,
      sector_match REAL,
      total REAL,
      FOREIGN KEY (stock_code) REFERENCES stocks(code),
      UNIQUE(stock_code, date)
    );

    CREATE TABLE IF NOT EXISTS stock_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      rank INTEGER NOT NULL,
      stock_code TEXT NOT NULL,
      total_score REAL NOT NULL,
      signal TEXT NOT NULL,
      FOREIGN KEY (stock_code) REFERENCES stocks(code),
      UNIQUE(date, rank)
    );

    CREATE TABLE IF NOT EXISTS stock_portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      cost_price REAL NOT NULL,
      shares INTEGER NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (code) REFERENCES stocks(code)
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      buy_signal INTEGER NOT NULL DEFAULT 0,
      total_score REAL NOT NULL,
      confidence REAL NOT NULL,
      summary TEXT,
      actual_direction INTEGER, -- 次日实际涨跌: 1涨 0跌
      actual_pct REAL,           -- 次日上证涨跌幅
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      total_value REAL NOT NULL,
      total_cost REAL NOT NULL,
      total_pnl REAL NOT NULL,
      pnl_percent REAL NOT NULL,
      UNIQUE(date)
    );
  `);
}
