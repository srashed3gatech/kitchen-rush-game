// HMAC-based cookie value signing/verification.
// Sign/verify the kr_session cookie value using SESSION_SIGNING_SECRET.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

function hmac(value: string): string {
  return createHmac('sha256', config.sessionSigningSecret)
    .update(value)
    .digest('hex');
}

/** Returns `${value}.${hmacHex}` */
export function signValue(value: string): string {
  return `${value}.${hmac(value)}`;
}

/** Returns the original value if valid, null if tampered. */
export function verifyValue(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signed.slice(0, lastDot);
  const providedHmac = signed.slice(lastDot + 1);
  const expectedHmac = hmac(value);

  try {
    const a = Buffer.from(providedHmac, 'hex');
    const b = Buffer.from(expectedHmac, 'hex');
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    return value;
  } catch {
    return null;
  }
}
