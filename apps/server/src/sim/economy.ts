// Economy helpers: end-of-day wage settlement, cash delta application.
// Per architecture §9.2: cash is clamped at 0, never negative.

import { db } from '../db/connection.js';
import { debug } from '../util/logger.js';

/** Pay wages for all active workers. $40/day each. Clamps cash at 0. */
export function settleEndOfDay(restId: number): void {
  const workers = db.prepare<[number], { wage_per_day: number }>(
    `SELECT wage_per_day FROM workers WHERE restaurant_id = ? AND is_active = 1`
  ).all(restId);

  const totalWages = workers.reduce((sum, w) => sum + w.wage_per_day, 0);

  db.prepare(`
    UPDATE restaurants
    SET cash = MAX(0, cash - ?), updated_at = datetime('now')
    WHERE id = ?
  `).run(totalWages, restId);

  debug(`Restaurant ${restId}: paid wages $${totalWages}`);
}

/**
 * Apply a cash delta (positive = gain, negative = spend) clamped at 0.
 * Caller should not let cash go below 0 per design constraints.
 */
export function applyCashDelta(restId: number, delta: number): void {
  if (delta >= 0) {
    db.prepare(`
      UPDATE restaurants SET cash = cash + ?, updated_at = datetime('now') WHERE id = ?
    `).run(delta, restId);
  } else {
    // Debit: clamp at 0
    db.prepare(`
      UPDATE restaurants SET cash = MAX(0, cash + ?), updated_at = datetime('now') WHERE id = ?
    `).run(delta, restId);
  }
}
