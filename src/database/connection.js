import dotenv from "dotenv";
dotenv.config();
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in the environment variables.");
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10_000,
});

db.on("error", (error) => {
  console.error("Unexpected database connection error:", error);
});

export async function initializeDatabase() {
  // Tables are created separately through your schema migration.
  await db.query("SELECT 1");
  console.log("Connected to Supabase.");
}


export default db;