// Server entry point.
// Order: config bootstrap → migrations → seed if empty → tick loop → listen.

import './config.js';   // must be first — bootstraps MASTER_ENCRYPTION_KEY and SESSION_SIGNING_SECRET
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { db } from './db/connection.js';
import { createApp } from './app.js';
import { startTickLoop } from './sim/tick.js';
import { config } from './config.js';
import { info, error as logError } from './util/logger.js';

async function main(): Promise<void> {
  // 1. Migrations (idempotent)
  runMigrations();

  // 2. Seed if recipes table is empty
  interface CountRow { cnt: number }
  const count = db.prepare<[], CountRow>(`SELECT COUNT(*) as cnt FROM recipes`).get();
  if (!count || count.cnt === 0) {
    runSeed();
  }

  // 3. Start sim tick (background, 1 Hz)
  startTickLoop();

  // 4. Start Express
  const app = createApp();
  const port = config.port;

  app.listen(port, () => {
    info(`
╔══════════════════════════════════════════╗
║  Kitchen Rush Server  v0.1.0             ║
║  http://localhost:${port}                    ║
║  NODE_ENV: ${config.nodeEnv.padEnd(28)}  ║
╚══════════════════════════════════════════╝`);
  });
}

main().catch(err => {
  logError('Failed to start server:', err);
  process.exit(1);
});
