// Customer arrival generator.
// Per architecture §4.1: arrivals are NOT sampled in the 1Hz tick.
// At the start of each in-game hour we sample a Poisson process and
// queue arrivals with setTimeout at precomputed real-second offsets.
// One in-game hour = 12.5 real seconds.

import { db } from '../db/connection.js';
import { debug, warn } from '../util/logger.js';
import {
  pickPersona,
  generateCustomerName,
  getCustomerPortrait,
  getLambdaForHour,
  reputationMultiplier,
  samplePoisson,
  PERSONAS,
} from './personas.js';

// Real seconds per in-game hour (design §1: 1 day = 300 real sec = 1440 min, so 1 hr = 12.5 real sec)
const REAL_SECONDS_PER_INGAME_HOUR = 12.5;

// Per-restaurant set of pending setTimeout handles so we can cancel on pause.
const pendingArrivals = new Map<number, Set<ReturnType<typeof setTimeout>>>();

export function cancelPendingArrivals(restId: number): void {
  const handles = pendingArrivals.get(restId);
  if (!handles) return;
  for (const h of handles) clearTimeout(h);
  handles.clear();
}

export function scheduleHourlyArrivals(restId: number, in_game_hour: number): void {
  // No arrivals during quiet hours (5 AM–8 AM = hour 5,6,7)
  if (in_game_hour >= 5 && in_game_hour < 8) return;

  const restRow = db.prepare<[number], { reputation: number; day_number: number; in_game_minute: number }>(
    `SELECT reputation, day_number, in_game_minute FROM restaurants WHERE id = ?`
  ).get(restId);
  if (!restRow) return;

  const baseLambda = getLambdaForHour(in_game_hour);
  const modifiedLambda = baseLambda * reputationMultiplier(restRow.reputation);
  const count = samplePoisson(modifiedLambda);

  debug(`Restaurant ${restId} hour ${in_game_hour}: λ=${modifiedLambda.toFixed(2)} → ${count} arrivals`);

  if (!pendingArrivals.has(restId)) {
    pendingArrivals.set(restId, new Set());
  }
  const handles = pendingArrivals.get(restId)!;

  for (let i = 0; i < count; i++) {
    // Random real-second offset within the hour's real-time span
    const offsetMs = Math.random() * REAL_SECONDS_PER_INGAME_HOUR * 1000;

    const handle = setTimeout(() => {
      handles.delete(handle);
      spawnCustomer(restId, restRow.day_number, in_game_hour);
    }, offsetMs);

    handles.add(handle);
  }
}

function spawnCustomer(restId: number, dayNumber: number, in_game_hour: number): void {
  try {
    // Re-check restaurant is still running (not paused or day rolled)
    const rest = db.prepare<[number], { is_paused: number; day_number: number; in_game_minute: number }>(
      `SELECT is_paused, day_number, in_game_minute FROM restaurants WHERE id = ?`
    ).get(restId);
    if (!rest || rest.is_paused === 1) return;

    const persona = pickPersona(in_game_hour);
    const personaConfig = PERSONAS[persona];
    const displayName = generateCustomerName(persona);
    const portrait = getCustomerPortrait(persona);

    // Pick a menu item from persona preferences, filtered to unlocked items.
    const unlockedSlugs = db.prepare<[number], { slug: string; id: number; price: number }>(
      `SELECT r.slug, mi.id, mi.price
       FROM menu_items mi
       JOIN recipes r ON r.id = mi.recipe_id
       WHERE mi.restaurant_id = ? AND mi.is_available = 1`
    ).all(restId);

    if (unlockedSlugs.length === 0) return;

    // 70% prefer from persona's list, 30% random unlocked item
    let chosenItem: { id: number; price: number } | undefined;
    const usePreference = Math.random() < 0.7;

    if (usePreference) {
      const preferred = unlockedSlugs.filter(mi => personaConfig.preferred_items.includes(mi.slug));
      if (preferred.length > 0) {
        chosenItem = preferred[Math.floor(Math.random() * preferred.length)];
      }
    }

    if (!chosenItem) {
      chosenItem = unlockedSlugs[Math.floor(Math.random() * unlockedSlugs.length)];
    }

    if (!chosenItem) return; // safety guard (empty menu edge case)

    const placedAtMin = rest.in_game_minute;

    db.prepare(`
      INSERT INTO orders
        (restaurant_id, customer_display_name, customer_archetype, customer_portrait_id,
         menu_item_id, day_number, placed_at_min, price_paid, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued')
    `).run(
      restId, displayName, persona, portrait,
      chosenItem.id, dayNumber, placedAtMin, chosenItem.price
    );

    debug(`Spawned ${persona} "${displayName}" at restaurant ${restId} (minute ${placedAtMin})`);
  } catch (err) {
    warn(`Failed to spawn customer for restaurant ${restId}: ${String(err)}`);
  }
}
