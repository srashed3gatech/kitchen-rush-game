// requireAuth middleware — validates the signed kr_session cookie.
// SECURITY: username-only auth (DECISIONS §7) — anyone who knows your username
// can log in as you. This is intentional and documented. Do not add passwords
// without first updating DECISIONS.md.

import type { Request, Response, NextFunction } from 'express';
import { verifyValue } from './cookie.js';
import { db } from '../db/connection.js';

interface AuthSession {
  user_id: number;
  secret: string;
}

interface RestaurantRow {
  id: number;
}

// Augment Express Request to carry authenticated user context.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: number };
      restaurantId?: number;
    }
  }
}

const selectSession = db.prepare<[number, string], AuthSession>(
  `SELECT user_id, secret FROM auth_sessions WHERE user_id = ? AND secret = ?`
);

const selectRestaurant = db.prepare<[number], RestaurantRow>(
  `SELECT id FROM restaurants WHERE owner_id = ?`
);

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const rawCookie: string | undefined = req.cookies?.kr_session;
  if (!rawCookie) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'No session cookie.' } });
    return;
  }

  const value = verifyValue(rawCookie);
  if (!value) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'Invalid session signature.' } });
    return;
  }

  const colonIdx = value.indexOf(':');
  if (colonIdx === -1) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'Malformed session value.' } });
    return;
  }

  const userId = parseInt(value.slice(0, colonIdx), 10);
  const secret = value.slice(colonIdx + 1);

  if (isNaN(userId)) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'Malformed user id.' } });
    return;
  }

  const session = selectSession.get(userId, secret);
  if (!session) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'Session not found or expired.' } });
    return;
  }

  const restaurant = selectRestaurant.get(userId);
  req.user = { id: userId };
  req.restaurantId = restaurant?.id;
  next();
}
