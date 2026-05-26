// AES-256-GCM encryption/decryption. Verbatim per architecture §5.
// Master key read via process.env.MASTER_ENCRYPTION_KEY (set by config.ts).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function masterKey(): Buffer {
  const hex = process.env.MASTER_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    // SECURITY: bootstrap path handles auto-generation in dev (see config.ts).
    throw new Error('MASTER_ENCRYPTION_KEY missing or wrong length');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): { ciphertext: Buffer; iv: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();          // 16 bytes
  return { ciphertext: Buffer.concat([enc, tag]), iv };
}

export function decrypt(ciphertext: Buffer, iv: Buffer): string {
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
  const body = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
