import pg from 'pg';
import { env } from './config/env.js';

const { Pool } = pg;
export const db = new Pool({ connectionString: env.databaseUrl, ssl: env.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } });

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await db.query(text, params);
  return result.rows as T[];
}

export async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}
