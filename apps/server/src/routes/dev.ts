// Dev routes — ONLY mounted when NODE_ENV !== 'production'.
// POST /api/dev/seed, /api/dev/reset, /api/dev/advance-days

import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import { runSeed } from '../db/seed.js';
import { computeDayEnd } from '../sim/leaderboard.js';
import { settleEndOfDay } from '../sim/economy.js';
import { xpToLevel } from '@kitchen-rush/shared';
import type { AdvanceDaysBody, AdvanceDaysResponse, Worker } from '@kitchen-rush/shared';

const router = Router();

// POST /api/dev/seed — re-run seed (INSERT OR IGNORE so safe)
router.post('/seed', requireAuth, (_req, res) => {
  runSeed();
  res.json({ ok: true });
});

// POST /api/dev/reset — wipe all user data for the authed restaurant and re-seed
router.post('/reset', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  db.transaction(() => {
    db.prepare(`DELETE FROM reviews WHERE restaurant_id = ?`).run(restId);
    db.prepare(`DELETE FROM orders WHERE restaurant_id = ?`).run(restId);
    db.prepare(`DELETE FROM coaching_sessions WHERE restaurant_id = ?`).run(restId);
    db.prepare(`DELETE FROM daily_scores WHERE restaurant_id = ?`).run(restId);
    db.prepare(`DELETE FROM menu_items WHERE restaurant_id = ?`).run(restId);
    db.prepare(`DELETE FROM workers WHERE restaurant_id = ?`).run(restId);
    db.prepare(`
      UPDATE restaurants SET cash = 150, day_number = 1, in_game_minute = 480,
             is_paused = 0, cleanliness = 80, vibe = 70, reputation = 60,
             updated_at = datetime('now')
      WHERE id = ?
    `).run(restId);

    // Re-seed starter menu + first worker
    db.prepare(`
      INSERT OR IGNORE INTO menu_items (restaurant_id, recipe_id, price)
      SELECT ?, r.id, r.default_price FROM recipes r
      WHERE r.slug IN ('classic_burger','french_fries','cola')
    `).run(restId);

    db.prepare(`
      INSERT INTO workers (restaurant_id, name, portrait_id, xp, mood, station, wage_per_day, hired_on_day)
      VALUES (?, 'Alex', 'worker_chef_blond_idle', 0, 70, 'grill', 40, 1)
    `).run(restId);
  })();

  res.json({ ok: true });
});

// POST /api/dev/advance-days — fast-forward N in-game days
router.post('/advance-days', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const { count, withReviews = false } = req.body as AdvanceDaysBody;
  if (!count || typeof count !== 'number' || count < 1 || count > 100) {
    throw new HttpError(400, 'invalid_input', 'count must be between 1 and 100.');
  }

  interface RestRow { day_number: number; reputation: number; id: number }
  const rest = db.prepare<[number], RestRow>(
    `SELECT id, day_number, reputation FROM restaurants WHERE id = ?`
  ).get(restId)!;

  let currentDay = rest.day_number;

  for (let i = 0; i < count; i++) {
    if (withReviews) {
      // Generate synthetic reviews for the day
      generateSyntheticReviews(restId, currentDay);
    }

    computeDayEnd(restId, currentDay);
    settleEndOfDay(restId);

    // Advance workers XP (simulate ~30 orders/day per worker)
    const workers = db.prepare<[number], Worker>(
      `SELECT id, xp FROM workers WHERE restaurant_id = ? AND is_active = 1`
    ).all(restId);

    db.transaction(() => {
      for (const w of workers) {
        const xpGain = 25 + Math.floor(Math.random() * 10); // ~25–35 XP/day
        db.prepare(`UPDATE workers SET xp = xp + ? WHERE id = ?`).run(xpGain, w.id);
      }
    })();

    currentDay += 1;
    db.prepare(`
      UPDATE restaurants SET day_number = ?, in_game_minute = 480, updated_at = datetime('now')
      WHERE id = ?
    `).run(currentDay, restId);
  }

  const response: AdvanceDaysResponse = { day_number: currentDay };
  res.json(response);
});

function generateSyntheticReviews(restId: number, dayNum: number): void {
  // Get a menu item to reference
  const menuItem = db.prepare<[number], { id: number; price: number }>(
    `SELECT id, price FROM menu_items WHERE restaurant_id = ? LIMIT 1`
  ).get(restId);
  if (!menuItem) return;

  const personae = ['beach_bum', 'tourist_family', 'date_couple', 'foodie_critic', 'night_owl', 'hangry_surfer'] as const;
  const portraits = ['customer_beach_bum_idle', 'customer_tourist_idle', 'customer_date_couple_idle'];
  const names = ['Sandy', 'Marco', 'Priya', 'Lee', 'Zoe', 'Cam'];

  const ordersToGenerate = 8 + Math.floor(Math.random() * 5); // 8-12 synthetic orders

  db.transaction(() => {
    for (let i = 0; i < ordersToGenerate; i++) {
      const persona = personae[Math.floor(Math.random() * personae.length)]!;
      const name = names[Math.floor(Math.random() * names.length)] ?? 'Guest';
      const portrait = portraits[Math.floor(Math.random() * portraits.length)] ?? 'customer_beach_bum_idle';

      const orderResult = db.prepare(`
        INSERT INTO orders
          (restaurant_id, customer_display_name, customer_archetype, customer_portrait_id,
           menu_item_id, day_number, placed_at_min, served_at_min, price_paid, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reviewed')
      `).run(
        restId, name, persona, portrait,
        menuItem.id, dayNum,
        480 + Math.floor(Math.random() * 600),
        480 + Math.floor(Math.random() * 600) + 30,
        menuItem.price
      );

      const orderId = orderResult.lastInsertRowid;
      const base = 55 + Math.floor(Math.random() * 25);
      const jitter = () => Math.floor(Math.random() * 11) - 5;

      db.prepare(`
        INSERT INTO reviews
          (order_id, restaurant_id, raw_comment,
           score_taste, score_cleanliness, score_seating, score_service, score_vibe, score_timing,
           claude_used, fallback_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'no_key')
      `).run(
        orderId, restId,
        `${name} had a ${persona.replace('_', ' ')} experience.`,
        Math.min(100, Math.max(0, base + jitter())),
        Math.min(100, Math.max(0, base + jitter())),
        Math.min(100, Math.max(0, base + jitter())),
        Math.min(100, Math.max(0, base + jitter())),
        Math.min(100, Math.max(0, base + jitter())),
        Math.min(100, Math.max(0, base + jitter()))
      );
    }
  })();
}

export default router;
