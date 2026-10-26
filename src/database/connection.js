import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Create a data folder at the project root.
const dataFolder = fileURLToPath(new URL("../../data/", import.meta.url));
mkdirSync(dataFolder, { recursive: true });

// Open the database, creating the file if needed.
const db = new Database(`${dataFolder}/economy.db`);

db.pragma("journal_mode = WAL");

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_cards (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id, card_id)
    )
  `);

  // Check whether the daily cooldown column already exists.
  const columns = db.prepare("PRAGMA table_info(accounts)").all();

  if (!columns.some((column) => column.name === "last_daily_at")) {
    db.exec(`
      ALTER TABLE accounts
      ADD COLUMN last_daily_at INTEGER NOT NULL DEFAULT 0
    `);
  }

  const workColumns = db.prepare("PRAGMA table_info(accounts)").all();

  if (!workColumns.some((column) => column.name === "last_work_at")) {
    db.exec(`
      ALTER TABLE accounts
      ADD COLUMN last_work_at INTEGER NOT NULL DEFAULT 0
    `);
  }

  const accountColumns = db.prepare("PRAGMA table_info(accounts)").all();
  
  if (!accountColumns.some((column) => column.name === "equipped_weapon")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN equipped_weapon TEXT DEFAULT NULL`);
  }
  
  if (!accountColumns.some((column) => column.name === "equipped_armor")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN equipped_armor TEXT DEFAULT NULL`);
  }
}

export default db;