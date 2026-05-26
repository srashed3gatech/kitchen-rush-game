// Worker simulation helpers.
// Mood decay: applied only during active cook ticks (design §4.1).
// XP and level helpers imported from @kitchen-rush/shared.

import { db } from '../db/connection.js';
import { xpToLevel, levelPrepMultiplier, levelMistakeProb } from '@kitchen-rush/shared';
import type { Worker } from '@kitchen-rush/shared';

export { xpToLevel, levelPrepMultiplier, levelMistakeProb };

// Mood decay per in-game hour while actively cooking.
// Tuned for kid-friendly cozy play: a chef left alone for a full day shouldn't
// crater to 0. With these rates, an L1 chef drops ~24 mood across a 24-hr day
// (from morning floor of 65 → ~41 by evening), L2 drops ~16, etc.
const MOOD_DECAY_PER_HOUR_COOKING: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: -1.2,
  2: -0.8,
  3: -0.4,
  4: 0,
  5: 0.4,
};

/** Apply fractional mood decay to a worker for a single in-game tick.
 *  Only called when the worker IS actively cooking (never idle).
 *  Delta per tick = decay_per_hour / (ticks_per_in_game_hour)
 *  1 in-game hour = 1440/24 = 60 in-game minutes; at 4.8 min/tick → ~12.5 ticks/hour.
 */
const TICKS_PER_INGAME_HOUR = 12.5; // 300 ticks/day ÷ 24 hours

// We accumulate fractional mood changes to avoid drift.
const moodAccumulator = new Map<number, number>();

export function applyMoodDecayTick(worker: Worker): void {
  const level = xpToLevel(worker.xp);
  const decayPerHour = MOOD_DECAY_PER_HOUR_COOKING[level];
  const decayPerTick = decayPerHour / TICKS_PER_INGAME_HOUR;

  const current = moodAccumulator.get(worker.id) ?? 0;
  const newAccum = current + decayPerTick;
  const integerDelta = Math.trunc(newAccum);

  if (integerDelta !== 0) {
    moodAccumulator.set(worker.id, newAccum - integerDelta);
    db.prepare(`
      UPDATE workers SET mood = MAX(0, MIN(100, mood + ?)) WHERE id = ?
    `).run(integerDelta, worker.id);
  } else {
    moodAccumulator.set(worker.id, newAccum);
  }
}

/** Morning mood floor: on day rollover, every worker's mood = max(current, 65). */
export function applyMorningMoodFloor(restId: number): void {
  db.prepare(`
    UPDATE workers SET mood = MAX(mood, 65) WHERE restaurant_id = ? AND is_active = 1
  `).run(restId);
}

/** Award XP for completing an order. */
export function awardOrderXp(workerId: number): void {
  db.prepare(`
    UPDATE workers SET xp = xp + 1 WHERE id = ?
  `).run(workerId);
}
