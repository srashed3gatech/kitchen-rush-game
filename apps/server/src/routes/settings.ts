// Settings routes: API key management + key/value store.

import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import { encrypt, decrypt } from '../crypto/aes.js';
import { warn } from '../util/logger.js';
import type {
  GetApiKeyResponse,
  PutApiKeyBody,
  PutApiKeyResponse,
  DeleteApiKeyResponse,
  SettingsResponse,
  PutSettingBody,
  PutSettingResponse,
  FallbackReason,
} from '@kitchen-rush/shared';

const router = Router();

interface UserKeyRow {
  claude_api_key_ciphertext: Buffer | null;
  claude_api_key_iv: Buffer | null;
}

interface SettingRow {
  key: string;
  value: string;
}

const selectUserKey = db.prepare<[number], UserKeyRow>(`
  SELECT claude_api_key_ciphertext, claude_api_key_iv FROM users WHERE id = ?
`);

const updateUserKey = db.prepare(`
  UPDATE users
  SET claude_api_key_ciphertext = ?, claude_api_key_iv = ?
  WHERE id = ?
`);

const clearUserKey = db.prepare(`
  UPDATE users SET claude_api_key_ciphertext = NULL, claude_api_key_iv = NULL WHERE id = ?
`);

const selectAllSettings = db.prepare<[number], SettingRow>(`
  SELECT key, value FROM settings WHERE user_id = ?
`);

const upsertSetting = db.prepare(`
  INSERT INTO settings (user_id, key, value, updated_at)
  VALUES (?, ?, ?, datetime('now'))
  ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
`);

// ─── GET /api/settings/api-key ────────────────────────────────────────────────

router.get('/api-key', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const row = selectUserKey.get(userId);

  if (!row || !row.claude_api_key_ciphertext || !row.claude_api_key_iv) {
    const response: GetApiKeyResponse = { hasKey: false };
    res.json(response);
    return;
  }

  let lastFour: string | undefined;
  let lastFallback: FallbackReason | null = null;

  try {
    const plaintext = decrypt(row.claude_api_key_ciphertext, row.claude_api_key_iv);
    lastFour = plaintext.slice(-4);
  } catch (err) {
    warn(`Failed to decrypt API key for user ${userId}: ${String(err)}`);
    lastFallback = 'parse_error';
    const response: GetApiKeyResponse = { hasKey: true, lastFallback };
    res.json(response);
    return;
  }

  const response: GetApiKeyResponse = { hasKey: true, lastFour, lastFallback };
  res.json(response);
});

// ─── PUT /api/settings/api-key ────────────────────────────────────────────────

router.put('/api-key', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const { apiKey } = req.body as PutApiKeyBody;

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new HttpError(400, 'invalid_input', 'apiKey must be a non-empty string.');
  }

  const { ciphertext, iv } = encrypt(apiKey.trim());
  updateUserKey.run(ciphertext, iv, userId);

  const lastFour = apiKey.trim().slice(-4);
  const response: PutApiKeyResponse = { hasKey: true, lastFour };
  res.json(response);
});

// ─── DELETE /api/settings/api-key ─────────────────────────────────────────────

router.delete('/api-key', requireAuth, (req, res) => {
  const userId = req.user!.id;
  clearUserKey.run(userId);
  const response: DeleteApiKeyResponse = { hasKey: false };
  res.json(response);
});

// ─── GET /api/settings ────────────────────────────────────────────────────────

router.get('/', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const rows = selectAllSettings.all(userId);
  const kv: Record<string, string> = {};
  for (const row of rows) {
    kv[row.key] = row.value;
  }
  const response: SettingsResponse = { kv };
  res.json(response);
});

// ─── PUT /api/settings/:key ───────────────────────────────────────────────────

router.put('/:key', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const key = req.params.key;
  const { value } = req.body as PutSettingBody;

  if (!key || key.length > 64) {
    throw new HttpError(400, 'invalid_input', 'key must be 1-64 characters.');
  }
  if (value === undefined || value === null || typeof value !== 'string') {
    throw new HttpError(400, 'invalid_input', 'value must be a string.');
  }

  upsertSetting.run(userId, key, value);
  const response: PutSettingResponse = { key, value };
  res.json(response);
});

export default router;
