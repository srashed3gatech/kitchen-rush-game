// Restaurant routes: state (polling endpoint), clean.

import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db/connection.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import type {
  RestaurantState,
  Restaurant,
  Worker,
  Order,
  CustomerInScene,
  CleanBody,
  CleanResponse,
} from '@kitchen-rush/shared';

const router = Router();

// ─── Prepared statements ───────────────────────────────────────────────────────

const selectRestaurant = db.prepare<[number], Restaurant>(`
  SELECT id, owner_id, name, cash, day_number, in_game_minute, is_paused,
         cleanliness, vibe, reputation, created_at, updated_at
  FROM restaurants WHERE id = ?
`);

const selectWorkers = db.prepare<[number], Worker>(`
  SELECT id, restaurant_id, name, portrait_id, xp, mood, station,
         wage_per_day, hired_on_day, hire_date, coaching_count, is_active
  FROM workers WHERE restaurant_id = ? AND is_active = 1
`);

const selectOpenOrders = db.prepare<[number], Order>(`
  SELECT id, restaurant_id, customer_display_name, customer_archetype,
         customer_portrait_id, worker_id, menu_item_id, day_number,
         placed_at_min, served_at_min, price_paid, tip_amount,
         was_mistake, mistake_kind, status, created_at
  FROM orders
  WHERE restaurant_id = ? AND status IN ('queued','cooking','served')
  ORDER BY created_at ASC
`);

// Recently-reviewed orders, used to show customers "leaving" the scene after the
// review fires. We join through reviews.created_at to pick only ones within ~30s.
interface RecentReviewedRow {
  id: number;
  customer_display_name: string;
  customer_archetype: string;
  customer_portrait_id: string;
  placed_at_min: number;
  review_age_seconds: number;
}
const selectRecentlyReviewed = db.prepare<[number], RecentReviewedRow>(`
  SELECT o.id, o.customer_display_name, o.customer_archetype, o.customer_portrait_id,
         o.placed_at_min,
         CAST((julianday('now') - julianday(r.created_at)) * 86400 AS INTEGER) as review_age_seconds
  FROM orders o
  JOIN reviews r ON r.order_id = o.id
  WHERE o.restaurant_id = ? AND o.status = 'reviewed'
    AND (julianday('now') - julianday(r.created_at)) * 86400 < 6
  ORDER BY r.created_at DESC
  LIMIT 8
`);

const selectLastReviewIds = db.prepare<[number], { id: number }>(`
  SELECT id FROM reviews WHERE restaurant_id = ?
  ORDER BY created_at DESC LIMIT 3
`);

const selectLatestDailyScore = db.prepare<[number], { rolling_score: number }>(`
  SELECT rolling_score FROM daily_scores
  WHERE restaurant_id = ?
  ORDER BY day_number DESC LIMIT 1
`);

const updateCleanliness = db.prepare(`
  UPDATE restaurants SET cleanliness = MIN(100, cleanliness + ?), updated_at = datetime('now')
  WHERE id = ?
`);

// ─── GET /api/restaurant/state ─────────────────────────────────────────────────

router.get('/state', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) {
    throw new HttpError(404, 'no_restaurant', 'No restaurant found for this user.');
  }

  const restaurant = selectRestaurant.get(restId);
  if (!restaurant) {
    throw new HttpError(404, 'no_restaurant', 'Restaurant not found.');
  }

  const workers = selectWorkers.all(restId);
  const openOrders = selectOpenOrders.all(restId);
  const lastReviewRows = selectLastReviewIds.all(restId);
  const latestScore = selectLatestDailyScore.get(restId);

  // Quiet hours: 5 AM = minute 300, 8 AM = minute 480
  const is_quiet_hours =
    restaurant.in_game_minute >= 300 && restaurant.in_game_minute < 480;

  // customers_in_scene: built from open orders + recently-reviewed orders.
  // Visual lifecycle: walking_in → seated → eating → leaving.
  //   queued → walking_in
  //   cooking → seated
  //   served → eating
  //   reviewed (within ~6 real seconds) → leaving
  const customers_in_scene: CustomerInScene[] = openOrders.map(o => {
    let phase: CustomerInScene['phase'];
    if (o.status === 'queued') phase = 'walking_in';
    else if (o.status === 'cooking') phase = 'seated';
    else phase = 'eating'; // served
    return {
      ephemeral_id: `order-${o.id}`,
      display_name: o.customer_display_name,
      archetype: o.customer_archetype,
      portrait_id: o.customer_portrait_id,
      phase,
      arrival_at_minute: o.placed_at_min,
    };
  });

  // Add recently-reviewed customers as 'leaving' for a brief window so the
  // canvas can animate them exiting rather than popping out instantly.
  const recentlyReviewed = selectRecentlyReviewed.all(restId);
  for (const r of recentlyReviewed) {
    customers_in_scene.push({
      ephemeral_id: `order-${r.id}`,
      display_name: r.customer_display_name,
      archetype: r.customer_archetype as CustomerInScene['archetype'],
      portrait_id: r.customer_portrait_id,
      phase: 'leaving',
      arrival_at_minute: r.placed_at_min,
    });
  }

  const state: RestaurantState = {
    restaurant,
    workers,
    open_orders: openOrders,
    customers_in_scene,
    last_review_ids: lastReviewRows.map(r => r.id),
    current_score: latestScore?.rolling_score ?? null,
    is_quiet_hours,
  };

  // ETag — cheap hash of volatile fields (per architecture §4.2 critique §3.1).
  const workerMaxUpdatedAt = workers.length > 0 ? workers.length : 0;
  const etagSource = `${restaurant.in_game_minute}:${restaurant.day_number}:${openOrders.length}:${workerMaxUpdatedAt}:${restaurant.cash}:${restaurant.cleanliness}`;
  const etag = `"${crypto.createHash('md5').update(etagSource).digest('hex')}"`;

  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader('ETag', etag);
  res.json(state);
});

// ─── POST /api/restaurant/clean ───────────────────────────────────────────────

router.post('/clean', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const { target = 'floor' } = req.body as CleanBody;

  let delta = 15;
  if (target === 'tables') delta = 20;
  if (target === 'all') delta = 30;

  updateCleanliness.run(delta, restId);

  const restaurant = selectRestaurant.get(restId)!;
  const response: CleanResponse = { cleanliness: restaurant.cleanliness };
  res.json(response);
});

export default router;
