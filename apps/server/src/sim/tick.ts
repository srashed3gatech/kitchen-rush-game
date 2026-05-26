// Server tick loop — 1 Hz world simulation.
// Architecture §4.1: setInterval(tick, 1000), fractional in-game-minute accumulator.
// Time mapping: 1 tick = 4.8 in-game minutes (1440 min / 300 ticks).

import { db } from '../db/connection.js';
import { info, debug, warn } from '../util/logger.js';
import { scheduleHourlyArrivals, cancelPendingArrivals } from './customers.js';
import { assignPendingOrders, completeCookedOrders } from './orders.js';
import { applyMorningMoodFloor } from './workers.js';
import { computeDayEnd } from './leaderboard.js';
import { settleEndOfDay } from './economy.js';

const INGAME_MINUTES_PER_TICK = 4.8; // 1440 / 300
const OPEN_HOUR_START = 480;   // minute 480 = 8 AM
const CLOSE_HOUR = 300;        // minute 300 = 5 AM (quiet hours start)
const DAY_MINUTES = 1440;
const TICKS_PER_FLUSH = 5;     // flush soft state every 5 ticks

// In-memory per-restaurant accumulator (avoids drift from integer truncation)
const minuteAccumulators = new Map<number, number>();
// Track which in-game hour we already scheduled arrivals for
const lastScheduledHour = new Map<number, number>();
// Tick counter per restaurant for flush cadence
let tickCount = 0;

// Dirty set — restaurants that need flushed
const dirty = new Set<number>();

// In-memory state for dirty restaurants (in_game_minute advances here, then flushed)
const dirtyState = new Map<number, { in_game_minute: number; isOpenHours: boolean }>();

interface RestaurantRow {
  id: number;
  in_game_minute: number;
  day_number: number;
  is_paused: 0 | 1;
  cleanliness: number;
  cash: number;
}

let tickInterval: ReturnType<typeof setInterval> | null = null;

export function startTickLoop(): void {
  if (tickInterval) return;
  tickInterval = setInterval(tick, 1000);
  info('Tick loop started (1 Hz)');
}

export function stopTickLoop(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    info('Tick loop stopped');
  }
}

function tick(): void {
  tickCount++;

  try {
    const restaurants = db.prepare<[], RestaurantRow>(
      `SELECT id, in_game_minute, day_number, is_paused, cleanliness, cash FROM restaurants WHERE is_paused = 0`
    ).all();

    for (const rest of restaurants) {
      tickRestaurant(rest);
    }

    // Flush dirty restaurants every 5 ticks
    if (tickCount % TICKS_PER_FLUSH === 0 && dirty.size > 0) {
      flushDirtyRestaurants();
    }
  } catch (err) {
    warn(`Tick error: ${String(err)}`);
  }
}

function tickRestaurant(rest: RestaurantRow): void {
  const restId = rest.id;

  // ── 1. Accumulate fractional in-game minutes ─────────────────────────────
  const accum = (minuteAccumulators.get(restId) ?? 0) + INGAME_MINUTES_PER_TICK;
  const intDelta = Math.floor(accum);
  minuteAccumulators.set(restId, accum - intDelta);

  if (intDelta === 0) return;

  let newMinute = rest.in_game_minute + intDelta;
  let dayNumber = rest.day_number;
  let dayRolled = false;

  // ── 2. Day rollover ───────────────────────────────────────────────────────
  if (newMinute >= DAY_MINUTES) {
    newMinute = newMinute % DAY_MINUTES;
    dayNumber += 1;
    dayRolled = true;

    // Run end-of-day: leaderboard + wages + mood floor
    try {
      computeDayEnd(restId, rest.day_number);
      settleEndOfDay(restId);
      applyMorningMoodFloor(restId);
      cancelPendingArrivals(restId);
      lastScheduledHour.delete(restId);

      // Write day rollover immediately (discrete event)
      db.prepare(`
        UPDATE restaurants
        SET day_number = ?, in_game_minute = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(dayNumber, newMinute, restId);

      info(`Restaurant ${restId}: day ${rest.day_number} → ${dayNumber}`);
    } catch (err) {
      warn(`Day rollover failed for restaurant ${restId}: ${String(err)}`);
    }
  }

  // ── 3. Hourly arrivals ────────────────────────────────────────────────────
  // Check lastScheduledHour regardless of whether the hour changed — this ensures
  // the very first tick schedules arrivals for the current hour (e.g. 8 AM at boot).
  const newHour = Math.floor(newMinute / 60);
  const lastHour = lastScheduledHour.get(restId) ?? -1;

  if (newHour !== lastHour) {
    lastScheduledHour.set(restId, newHour);
    try {
      scheduleHourlyArrivals(restId, newHour);
    } catch (err) {
      warn(`scheduleHourlyArrivals failed for restaurant ${restId} hour ${newHour}: ${String(err)}`);
    }
  }

  // ── 4. Cleanliness decay (open hours only: 8 AM–5 AM = min 480 or min < 300) ─
  // "2 points per in-game hour" = 2 / 60 per in-game minute
  // Per tick (4.8 in-game min): 2/60 * 4.8 = 0.16 per tick
  // We accumulate fractionally and apply integer decrements.
  const isOpenHours = newMinute >= OPEN_HOUR_START || newMinute < CLOSE_HOUR;

  // ── 5. Worker order advancement ───────────────────────────────────────────
  try {
    assignPendingOrders(restId);
    completeCookedOrders(restId, newMinute);
  } catch (err) {
    warn(`Order processing failed for restaurant ${restId}: ${String(err)}`);
  }

  // Mark dirty for batch flush (only soft state: minute, cleanliness)
  if (!dayRolled) {
    dirty.add(restId);
    dirtyState.set(restId, { in_game_minute: newMinute, isOpenHours });
  }

  // Store current state in memory representation (used by flush)
  rest.in_game_minute = newMinute;
  rest.day_number = dayNumber;
}

const flushMinuteStmt = db.prepare(`
  UPDATE restaurants SET in_game_minute = ?, updated_at = datetime('now') WHERE id = ?
`);
const flushCleanlinessStmt = db.prepare(`
  UPDATE restaurants SET cleanliness = MAX(0, cleanliness - ?), updated_at = datetime('now') WHERE id = ?
`);

function flushDirtyRestaurants(): void {
  if (dirty.size === 0) return;
  const count = dirty.size;

  // Decay per flush cycle: 2 pts/hr × (4.8 min/tick × TICKS_PER_FLUSH) / 60 min/hr
  const cleanlinessDecay = Math.round((2 / 60) * INGAME_MINUTES_PER_TICK * TICKS_PER_FLUSH);

  db.transaction(() => {
    for (const restId of dirty) {
      const state = dirtyState.get(restId);
      if (!state) continue;

      // Flush the advanced in_game_minute (use in-memory value, not re-queried DB value)
      flushMinuteStmt.run(state.in_game_minute, restId);

      // Apply cleanliness decay during open hours
      if (state.isOpenHours && cleanlinessDecay > 0) {
        flushCleanlinessStmt.run(cleanlinessDecay, restId);
      }
    }
  })();

  dirty.clear();
  dirtyState.clear();
  debug(`Flushed ${count} restaurant(s)`);
}
