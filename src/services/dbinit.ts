import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '../db.js';

async function runSqlFile(file: string) {
  const sql = await readFile(join(process.cwd(), 'db', file), 'utf8');
  if (sql.trim()) await db.query(sql);
}

export async function initializeDatabase() {
  const check = await db.query("SELECT to_regclass('public.territory_brains') AS table_name");
  const exists = Boolean(check.rows[0]?.table_name);

  if (!exists) {
    await runSqlFile('schema.sql');
  }

  // These files are designed to be safe to run after the base schema exists.
  await runSqlFile('operational.sql');
  await runSqlFile('seed_network.sql');
  await runSqlFile('seed_nuevo_leon.sql');
}
