import { initializeDatabase } from './services/dbinit.js';
import { db } from './db.js';
initializeDatabase()
    .then(async () => { console.log('Database initialized.'); await db.end(); })
    .catch(async (e) => { console.error(e); await db.end(); process.exit(1); });
