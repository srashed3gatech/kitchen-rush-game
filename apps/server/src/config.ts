// config.ts — bootstrap master key and session secret before anything else runs.
// Per architecture §5 + critique §3.2.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { info, warn } from './util/logger.js';

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isDev = NODE_ENV !== 'production';

// ─── Master encryption key ────────────────────────────────────────────────────
// Location: ~/.config/kitchen-rush/master.key (mode 0600).
// Override: process.env.MASTER_ENCRYPTION_KEY (64-char hex).

function bootstrapMasterKey(): string {
  // Env override takes highest priority.
  if (process.env.MASTER_ENCRYPTION_KEY) {
    const k = process.env.MASTER_ENCRYPTION_KEY;
    if (k.length !== 64) {
      throw new Error('MASTER_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).');
    }
    return k;
  }

  const keyPath = process.env.MASTER_KEY_PATH
    ?? path.join(os.homedir(), '.config', 'kitchen-rush', 'master.key');

  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf8').trim();
    if (raw.length !== 64) {
      throw new Error(`master.key at ${keyPath} is malformed (expected 64 hex chars).`);
    }
    return raw;
  }

  if (!isDev) {
    throw new Error(
      `Master encryption key not found at ${keyPath}.\n` +
      `In production, create this file (mode 0600) with a 64-char hex key.\n` +
      `Example: node -e "require('crypto').randomBytes(32).toString('hex')" > ${keyPath} && chmod 0600 ${keyPath}`
    );
  }

  // Dev auto-generation.
  const dir = path.dirname(keyPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const newKey = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(keyPath, newKey, { mode: 0o600, encoding: 'utf8' });
  info(`Auto-generated master key at ${keyPath}`);
  return newKey;
}

// ─── Session signing secret ───────────────────────────────────────────────────
// Falls back to .env at repo root in dev. Never written in production.

function bootstrapSessionSecret(): string {
  if (process.env.SESSION_SIGNING_SECRET) {
    return process.env.SESSION_SIGNING_SECRET;
  }

  // Look in .env at repo root (works in both dev and prod). Run.zsh writes
  // one there on first install; users can also set it manually.
  const repoRoot = path.resolve(
    new URL(import.meta.url).pathname,
    '../../../..'
  );
  const envPath = path.join(repoRoot, '.env');

  let envContents = '';
  if (fs.existsSync(envPath)) {
    envContents = fs.readFileSync(envPath, 'utf8');
    const match = envContents.match(/^SESSION_SIGNING_SECRET\s*=\s*(.+)$/m);
    if (match) {
      const secret = match[1]!.trim();
      process.env.SESSION_SIGNING_SECRET = secret;
      return secret;
    }
  }

  if (!isDev) {
    throw new Error(
      'SESSION_SIGNING_SECRET not set. Run `./run.zsh prod` (auto-generates) ' +
      'or set it manually: node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')" ' +
      '→ paste into .env at repo root.'
    );
  }

  const newSecret = crypto.randomBytes(32).toString('hex');
  const line = `\nSESSION_SIGNING_SECRET=${newSecret}\n`;
  fs.appendFileSync(envPath, line, 'utf8');
  process.env.SESSION_SIGNING_SECRET = newSecret;
  warn(`Auto-generated SESSION_SIGNING_SECRET and appended it to ${envPath}`);
  return newSecret;
}

const masterEncryptionKey = bootstrapMasterKey();
// Expose to crypto/aes.ts which reads process.env directly (per architecture snippet).
process.env.MASTER_ENCRYPTION_KEY = masterEncryptionKey;

const sessionSigningSecret = bootstrapSessionSecret();

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: NODE_ENV,
  isDev,
  sessionSigningSecret,
  masterEncryptionKey,
} as const;
