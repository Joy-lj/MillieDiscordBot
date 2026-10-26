import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dataFolder = fileURLToPath(new URL("../../data/", import.meta.url));
mkdirSync(dataFolder, { recursive: true });

const db = new Database(`${dataFolder}/economy.db`);
db.pragma("journal_mode = WAL");

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      equipped_weapon_id INTEGER DEFAULT NULL,
      equipped_armor_id INTEGER DEFAULT NULL,
      last_daily_at INTEGER NOT NULL DEFAULT 0,
      last_work_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      serial_number INTEGER NOT NULL
    )
  `);

  const accountColumns = db.prepare("PRAGMA table_info(accounts)").all();

  if (!accountColumns.some((col) => col.name === "equipped_weapon_id")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN equipped_weapon_id INTEGER DEFAULT NULL`);
  }
  if (!accountColumns.some((col) => col.name === "equipped_armor_id")) {
    db.exec(`ALTER TABLE accounts ADD COLUMN equipped_armor_id INTEGER DEFAULT NULL`);
  }
}

export default db;