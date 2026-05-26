// Leaderboard route: top 10 by rolling_score, never "your rank".

import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import type { LeaderboardRow, LeaderboardResponse } from '@kitchen-rush/shared';

const router = Router();

interface LeaderboardDbRow {
  restaurant_id: number;
  owner_display_name: string;
  restaurant_name: string;
  rolling_score: number;
  day_number: number;
}

// Top 10 only (critique §2.8). Latest day per restaurant, sorted by rolling_score DESC.
// Never shows "your rank" — top 10 is a celebration, not a ladder.
const selectLeaderboard = db.prepare<[], LeaderboardDbRow>(`
  SELECT
    ds.restaurant_id,
    u.display_name as owner_display_name,
    r.name as restaurant_name,
    ds.rolling_score,
    ds.day_number
  FROM daily_scores ds
  JOIN restaurants r ON r.id = ds.restaurant_id
  JOIN users u ON u.id = r.owner_id
  WHERE (ds.restaurant_id, ds.day_number) IN (
    SELECT restaurant_id, MAX(day_number)
    FROM daily_scores
    GROUP BY restaurant_id
  )
  ORDER BY ds.rolling_score DESC
  LIMIT 10
`);

// GET /api/leaderboard?limit=10
router.get('/', requireAuth, (req, res) => {
  const rows = selectLeaderboard.all() as LeaderboardRow[];
  const response: LeaderboardResponse = { rows };
  res.json(response);
});

export default router;
