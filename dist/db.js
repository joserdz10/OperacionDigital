import pg from 'pg';
import { env } from './config/env.js';
const { Pool } = pg;
export const db = new Pool({ connectionString: env.databaseUrl, ssl: env.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } });
export async function query(text, params = []) {
    const result = await db.query(text, params);
    return result.rows;
}
export async function one(text, params = []) {
    const rows = await query(text, params);
    return rows[0] || null;
}
