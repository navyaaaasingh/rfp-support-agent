import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    '[db] DATABASE_URL is not set — set it in .env before starting the server.'
  );
}

// Supabase / Neon free tier both require SSL; rejectUnauthorized: false
// is the common pattern for their managed certs.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

export async function query(text, params) {
  return pool.query(text, params);
}
