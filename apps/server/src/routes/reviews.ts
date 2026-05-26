// Reviews routes: paginated list.

import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import type { Review, ReviewsResponse } from '@kitchen-rush/shared';

const router = Router();

// GET /api/reviews?limit=20&cursor=<id>
router.get('/', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const limit = Math.min(parseInt(req.query.limit as string ?? '20', 10), 50);
  const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : null;

  let reviews: Review[];
  let nextCursor: string | null = null;

  if (cursor !== null && !isNaN(cursor)) {
    reviews = db.prepare<[number, number, number], Review>(`
      SELECT id, order_id, restaurant_id, raw_comment,
             score_taste, score_cleanliness, score_seating, score_service, score_vibe, score_timing,
             improvement_hint, claude_used, fallback_reason, created_at
      FROM reviews
      WHERE restaurant_id = ? AND id < ?
      ORDER BY id DESC
      LIMIT ?
    `).all(restId, cursor, limit + 1);
  } else {
    reviews = db.prepare<[number, number], Review>(`
      SELECT id, order_id, restaurant_id, raw_comment,
             score_taste, score_cleanliness, score_seating, score_service, score_vibe, score_timing,
             improvement_hint, claude_used, fallback_reason, created_at
      FROM reviews
      WHERE restaurant_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(restId, limit + 1);
  }

  if (reviews.length > limit) {
    reviews = reviews.slice(0, limit);
    nextCursor = String(reviews.at(-1)!.id);
  }

  const response: ReviewsResponse = { reviews, nextCursor };
  res.json(response);
});

export default router;
