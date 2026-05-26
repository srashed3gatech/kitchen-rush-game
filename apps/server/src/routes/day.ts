// Day control routes: start, pause, end.

import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import { computeDayEnd } from '../sim/leaderboard.js';
import { settleEndOfDay } from '../sim/economy.js';
import type { StartDayResponse, PauseDayResponse, EndDayResponse, DaySummary } from '@kitchen-rush/shared';

const router = Router();

interface RestaurantRow {
  id: number;
  day_number: number;
  in_game_minute: number;
  is_paused: 0 | 1;
  cash: number;
  reputation: number;
}

const selectRestaurant = db.prepare<[number], RestaurantRow>(`
  SELECT id, day_number, in_game_minute, is_paused, cash, reputation
  FROM restaurants WHERE id = ?
`);

const setUnpaused = db.prepare(`
  UPDATE restaurants SET is_paused = 0, updated_at = datetime('now') WHERE id = ?
`);

const setPaused = db.prepare(`
  UPDATE restaurants SET is_paused = 1, updated_at = datetime('now') WHERE id = ?
`);

const advanceDay = db.prepare(`
  UPDATE restaurants
  SET day_number = day_number + 1, in_game_minute = 480, is_paused = 0,
      updated_at = datetime('now')
  WHERE id = ?
`);

// POST /api/day/start — resume if paused, or start from quiet hours.
router.post('/start', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  setUnpaused.run(restId);
  const rest = selectRestaurant.get(restId)!;
  const response: StartDayResponse = { day_number: rest.day_number, in_game_minute: rest.in_game_minute };
  res.json(response);
});

// POST /api/day/pause — owner-controlled pause.
router.post('/pause', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  setPaused.run(restId);
  const response: PauseDayResponse = { is_paused: 1 };
  res.json(response);
});

// POST /api/day/end — force-advance to next day, run end-of-day economy.
router.post('/end', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const rest = selectRestaurant.get(restId)!;
  const dayNum = rest.day_number;

  // Compute leaderboard score for the day.
  computeDayEnd(restId, dayNum);

  // Settle wages and economy.
  settleEndOfDay(restId);

  // Advance to next day.
  advanceDay.run(restId);

  const updated = selectRestaurant.get(restId)!;

  // Build a quick summary.
  interface OrderSummaryRow {
    customers_served: number;
    gross_sales: number;
    tips_total: number;
    mistakes: number;
  }
  const orderSummary = db.prepare<[number, number], OrderSummaryRow>(`
    SELECT
      COUNT(*) as customers_served,
      COALESCE(SUM(price_paid), 0) as gross_sales,
      COALESCE(SUM(tip_amount), 0) as tips_total,
      COALESCE(SUM(was_mistake), 0) as mistakes
    FROM orders
    WHERE restaurant_id = ? AND day_number = ? AND status IN ('served','reviewed')
  `).get(restId, dayNum)!;

  interface AvgScoreRow {
    taste: number; cleanliness: number; seating: number;
    service: number; vibe: number; timing: number;
  }
  const avgScores = db.prepare<[number, number], AvgScoreRow>(`
    SELECT
      COALESCE(AVG(r.score_taste), 60) as taste,
      COALESCE(AVG(r.score_cleanliness), 60) as cleanliness,
      COALESCE(AVG(r.score_seating), 60) as seating,
      COALESCE(AVG(r.score_service), 60) as service,
      COALESCE(AVG(r.score_vibe), 60) as vibe,
      COALESCE(AVG(r.score_timing), 60) as timing
    FROM reviews r
    JOIN orders o ON o.id = r.order_id
    WHERE r.restaurant_id = ? AND o.day_number = ?
  `).get(restId, dayNum)!;

  interface ScoreRow { daily_score: number; rolling_score: number; }
  const scoreRow = db.prepare<[number, number], ScoreRow>(`
    SELECT daily_score, rolling_score FROM daily_scores
    WHERE restaurant_id = ? AND day_number = ?
  `).get(restId, dayNum);

  const summary: DaySummary = {
    day_number: dayNum,
    customers_served: orderSummary.customers_served,
    gross_sales: orderSummary.gross_sales,
    tips_total: orderSummary.tips_total,
    mistakes: orderSummary.mistakes,
    avg_scores: {
      taste: Math.round(avgScores.taste),
      cleanliness: Math.round(avgScores.cleanliness),
      seating: Math.round(avgScores.seating),
      service: Math.round(avgScores.service),
      vibe: Math.round(avgScores.vibe),
      timing: Math.round(avgScores.timing),
    },
    daily_score: scoreRow?.daily_score ?? 0,
    rolling_score: scoreRow?.rolling_score ?? 0,
  };

  const response: EndDayResponse = { day_number: updated.day_number, summary };
  res.json(response);
});

export default router;
