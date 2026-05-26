// better-sqlite3 singleton.
// Path: apps/server/data/kitchen-rush.sqlite
// IMPORTANT: We run schema.sql here (idempotent CREATE TABLE IF NOT EXISTS)
// before any module can call db.prepare(). This avoids the ESM hoisting problem
// where module-level prepared statements would run before index.ts calls runMigrations().

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../data/kitchen-rush.sqlite');

// Ensure the data directory exists.
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

// Configure WAL mode and foreign keys as specified in architecture §2.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Apply schema immediately so all module-level db.prepare() calls succeed.
// Uses CREATE TABLE IF NOT EXISTS — idempotent, safe to run every boot.
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = readFileSync(schemaPath, 'utf8');
db.exec(schema);
