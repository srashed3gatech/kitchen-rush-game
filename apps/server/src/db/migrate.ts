// migrate.ts — reads schema.sql and executes it against the DB.
// Schema uses IF NOT EXISTS so this is idempotent; safe to call on every boot.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db } from './connection.js';
import { info } from '../util/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations(): void {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  db.exec(sql);
  info('Migrations applied (schema.sql executed)');
}
