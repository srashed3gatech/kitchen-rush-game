// Auth routes: register, login, logout, me.
// SECURITY: username-only auth — anyone who knows your username can log in.

import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/connection.js';
import { signValue } from '../auth/cookie.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import type { RegisterBody, LoginBody, AuthResponse, MeResponse, PublicUser } from '@kitchen-rush/shared';

const router = Router();

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
}

interface RestaurantRow {
  id: number;
}

const insertUser = db.prepare(`
  INSERT INTO users (username, display_name) VALUES (LOWER(?), ?)
`);

const selectUserByUsername = db.prepare<[string], UserRow>(`
  SELECT id, username, display_name, created_at, last_login_at
  FROM users WHERE LOWER(username) = LOWER(?)
`);

const selectUserById = db.prepare<[number], UserRow>(`
  SELECT id, username, display_name, created_at, last_login_at
  FROM users WHERE id = ?
`);

const upsertSession = db.prepare(`
  INSERT OR REPLACE INTO auth_sessions (user_id, secret) VALUES (?, ?)
`);

const deleteSession = db.prepare(`
  DELETE FROM auth_sessions WHERE user_id = ?
`);

const updateLastLogin = db.prepare(`
  UPDATE users SET last_login_at = datetime('now') WHERE id = ?
`);

const insertRestaurant = db.prepare(`
  INSERT INTO restaurants (owner_id, name) VALUES (?, ?)
`);

const selectRestaurant = db.prepare<[number], RestaurantRow>(`
  SELECT id FROM restaurants WHERE owner_id = ?
`);

const insertStarterMenuItems = db.prepare(`
  INSERT OR IGNORE INTO menu_items (restaurant_id, recipe_id, price)
  SELECT ?, r.id, r.default_price FROM recipes r WHERE r.slug IN ('classic_burger','french_fries','cola')
`);

const insertStarterWorker = db.prepare(`
  INSERT INTO workers (restaurant_id, name, portrait_id, xp, mood, station, wage_per_day, hired_on_day)
  VALUES (?, 'Alex', 'worker_chef_blond_idle', 0, 70, 'grill', 40, 1)
`);

function setSessionCookie(res: import('express').Response, userId: number, secret: string): void {
  res.cookie(
    'kr_session',
    signValue(`${userId}:${secret}`),
    {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS,
      // NOT secure — local dev over HTTP (architecture §7)
    }
  );
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, displayName } = req.body as RegisterBody;
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    throw new HttpError(400, 'invalid_input', 'username must be at least 2 characters.');
  }
  if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 1) {
    throw new HttpError(400, 'invalid_input', 'displayName is required.');
  }

  const existing = selectUserByUsername.get(username.trim());
  if (existing) {
    throw new HttpError(409, 'username_taken', 'That username is already taken.');
  }

  const registerAndSetup = db.transaction(() => {
    const result = insertUser.run(username.trim(), displayName.trim());
    const userId = result.lastInsertRowid as number;

    const restResult = insertRestaurant.run(userId, `${displayName.trim()}'s Kitchen`);
    const restaurantId = restResult.lastInsertRowid as number;

    insertStarterMenuItems.run(restaurantId);
    insertStarterWorker.run(restaurantId);

    const secret = crypto.randomBytes(8).toString('hex'); // 16 hex chars
    upsertSession.run(userId, secret);
    updateLastLogin.run(userId);

    return { userId, restaurantId, secret };
  });

  const { userId, restaurantId, secret } = registerAndSetup();
  const user = selectUserById.get(userId)!;

  const publicUser: PublicUser = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
  };

  // @ts-ignore — cookie helper
  setSessionCookie(res, userId, secret);

  const response: AuthResponse = { user: publicUser, restaurantId };
  res.status(201).json(response);
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  // SECURITY: no password — username is the only credential (DECISIONS §7).
  const { username } = req.body as LoginBody;
  if (!username || typeof username !== 'string') {
    throw new HttpError(400, 'invalid_input', 'username is required.');
  }

  const user = selectUserByUsername.get(username.trim());
  if (!user) {
    throw new HttpError(404, 'user_not_found', 'No account with that username.');
  }

  const secret = crypto.randomBytes(8).toString('hex');
  db.transaction(() => {
    deleteSession.run(user.id);
    upsertSession.run(user.id, secret);
    updateLastLogin.run(user.id);
  })();

  const restaurant = selectRestaurant.get(user.id);
  const publicUser: PublicUser = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
  };

  // @ts-ignore — cookie helper
  setSessionCookie(res, user.id, secret);

  const response: AuthResponse = { user: publicUser, restaurantId: restaurant?.id ?? 0 };
  res.json(response);
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  deleteSession.run(req.user!.id);
  res.clearCookie('kr_session', { path: '/' });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = selectUserById.get(req.user!.id);
  if (!user) {
    throw new HttpError(404, 'user_not_found', 'User not found.');
  }
  const restaurant = selectRestaurant.get(user.id);
  const publicUser: PublicUser = {
    id: user.id,
    username: user.username,
    display_name: user.display_name,
  };
  const response: MeResponse = { user: publicUser, restaurantId: restaurant?.id ?? 0 };
  res.json(response);
});

export default router;
