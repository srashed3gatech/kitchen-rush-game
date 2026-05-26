// Leaderboard: compute daily and rolling scores at day-end.
// Formula per design §10.1 and §10.2.

import { db } from '../db/connection.js';
import { debug } from '../util/logger.js';
import { xpToLevel } from '@kitchen-rush/shared';
import type { Worker } from '@kitchen-rush/shared';

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute and persist daily_score + rolling_score for restId on dayNum.
 * Per design §10.1:
 *   DailyScore = 0.30*feedback + 0.25*sales + 0.20*team + 0.15*growth + 0.10*consistency
 * Per design §10.2:
 *   RollingScore = 0.6*avg(last7d) + 0.4*best(last7d)
 * Both stored ×1000 for display.
 */
export function computeDayEnd(restId: number, dayNum: number): void {
  // ── 1. feedback_norm ─────────────────────────────────────────────────────
  interface AvgScoreRow { avg: number }
  const avgFeedback = db.prepare<[number, number], AvgScoreRow>(`
    SELECT AVG((r.score_taste + r.score_cleanliness + r.score_seating +
                r.score_service + r.score_vibe + r.score_timing) / 6.0) as avg
    FROM reviews r
    JOIN orders o ON o.id = r.order_id
    WHERE r.restaurant_id = ? AND o.day_number = ?
  `).get(restId, dayNum);

  const feedbackNorm = clamp((avgFeedback?.avg ?? 60) / 100.0, 0, 1);

  // ── 2. sales_norm ─────────────────────────────────────────────────────────
  interface SalesRow { gross: number }
  const salesRow = db.prepare<[number, number], SalesRow>(`
    SELECT COALESCE(SUM(price_paid + tip_amount), 0) as gross
    FROM orders
    WHERE restaurant_id = ? AND day_number = ? AND status IN ('served','reviewed')
  `).get(restId, dayNum);

  const salesNorm = clamp((salesRow?.gross ?? 0) / 500.0, 0, 1);

  // ── 3. team_norm ──────────────────────────────────────────────────────────
  const workers = db.prepare<[number], Worker>(
    `SELECT * FROM workers WHERE restaurant_id = ? AND is_active = 1`
  ).all(restId);

  let teamNorm = 0;
  if (workers.length > 0) {
    const avgLevel = workers.reduce((sum, w) => sum + xpToLevel(w.xp), 0) / workers.length;
    const avgMood = workers.reduce((sum, w) => sum + w.mood, 0) / workers.length;
    teamNorm = clamp((avgLevel / 5) * (avgMood / 100), 0, 1);
  }

  // ── 4. growth_norm ────────────────────────────────────────────────────────
  interface CountRow { cnt: number }
  const menuCount = db.prepare<[number], CountRow>(
    `SELECT COUNT(*) as cnt FROM menu_items WHERE restaurant_id = ?`
  ).get(restId)?.cnt ?? 0;

  const growthNorm = clamp(menuCount / 20.0, 0, 1);

  // ── 5. consistency_norm ───────────────────────────────────────────────────
  interface DailyAvgRow { day_number: number; daily_avg: number }
  const last7Days = db.prepare<[number, number], DailyAvgRow>(`
    SELECT o.day_number,
           AVG((r.score_taste + r.score_cleanliness + r.score_seating +
                r.score_service + r.score_vibe + r.score_timing) / 6.0) as daily_avg
    FROM reviews r
    JOIN orders o ON o.id = r.order_id
    WHERE r.restaurant_id = ? AND o.day_number > ? - 7
    GROUP BY o.day_number
    ORDER BY o.day_number DESC
  `).all(restId, dayNum);

  const dailyAvgs = last7Days.map(r => r.daily_avg);
  // stddev in 0–100 scale; divide by 25 per design §10.1
  const sd = stddev(dailyAvgs);
  const consistencyNorm = clamp(1 - sd / 25.0, 0, 1);

  // ── DailyScore ────────────────────────────────────────────────────────────
  const dailyScore = (
    0.30 * feedbackNorm +
    0.25 * salesNorm +
    0.20 * teamNorm +
    0.15 * growthNorm +
    0.10 * consistencyNorm
  ) * 1000;

  // ── RollingScore: look at last 7 stored daily_scores + today ─────────────
  interface StoredScoreRow { daily_score: number }
  const storedScores = db.prepare<[number, number], StoredScoreRow>(`
    SELECT daily_score FROM daily_scores
    WHERE restaurant_id = ? AND day_number >= ? - 6
    ORDER BY day_number DESC
  `).all(restId, dayNum);

  const allScores = [dailyScore, ...storedScores.map(r => r.daily_score)];
  const avg7d = allScores.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(allScores.length, 7);
  const best7d = Math.max(...allScores.slice(0, 7));
  const rollingScore = 0.6 * avg7d + 0.4 * best7d;

  // ── Persist ───────────────────────────────────────────────────────────────
  db.prepare(`
    INSERT OR REPLACE INTO daily_scores
      (restaurant_id, day_number, daily_score, rolling_score,
       feedback_norm, sales_norm, team_norm, growth_norm, consistency_norm,
       computed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    restId, dayNum, dailyScore, rollingScore,
    feedbackNorm, salesNorm, teamNorm, growthNorm, consistencyNorm
  );

  debug(
    `Restaurant ${restId} day ${dayNum}: daily=${dailyScore.toFixed(0)} ` +
    `rolling=${rollingScore.toFixed(0)} ` +
    `(f=${feedbackNorm.toFixed(2)} s=${salesNorm.toFixed(2)} t=${teamNorm.toFixed(2)} ` +
    `g=${growthNorm.toFixed(2)} c=${consistencyNorm.toFixed(2)})`
  );
}
