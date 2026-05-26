// Order lifecycle: worker assignment, cook timers, completion, review generation.
// Called from tick.ts on every tick.

import { db } from '../db/connection.js';
import { debug, warn } from '../util/logger.js';
import { xpToLevel, levelPrepMultiplier, levelMistakeProb } from '@kitchen-rush/shared';
import type { Worker, Order } from '@kitchen-rush/shared';
import { generateReview } from '../ai/reviewTemplates.js';
import { scoreReview } from '../ai/reviewScorer.js';
import { applyCashDelta } from './economy.js';
import { awardOrderXp, applyMoodDecayTick } from './workers.js';
import { PERSONAS } from './personas.js';

// In-memory cook timer: workerId → busy_until timestamp (ms)
export const cookTimers = new Map<number, number>();

// ─── Assign workers to queued orders ─────────────────────────────────────────

interface OrderWithStation {
  id: number;
  restaurant_id: number;
  menu_item_id: number;
  placed_at_min: number;
  day_number: number;
  customer_archetype: string;
  customer_display_name: string;
  worker_station: string | null;
}

interface WorkerStationRow {
  id: number;
  station: string;
  xp: number;
  mood: number;
}

export function assignPendingOrders(restId: number): void {
  // Get queued orders (no worker assigned yet)
  const queued = db.prepare<[number], OrderWithStation>(`
    SELECT o.id, o.restaurant_id, o.menu_item_id, o.placed_at_min, o.day_number,
           o.customer_archetype, o.customer_display_name,
           r.station as worker_station
    FROM orders o
    JOIN menu_items mi ON mi.id = o.menu_item_id
    JOIN recipes r ON r.id = mi.recipe_id
    WHERE o.restaurant_id = ? AND o.status = 'queued' AND o.worker_id IS NULL
    ORDER BY o.id ASC
    LIMIT 10
  `).all(restId);

  if (queued.length === 0) return;

  // Get free workers (not currently cooking)
  const freeWorkers = db.prepare<[number], WorkerStationRow>(`
    SELECT id, station, xp, mood FROM workers
    WHERE restaurant_id = ? AND is_active = 1
  `).all(restId).filter(w => {
    const busyUntil = cookTimers.get(w.id) ?? 0;
    return Date.now() >= busyUntil;
  });

  for (const order of queued) {
    const station = order.worker_station;
    if (!station) continue;

    // Find a free worker matching the required station
    let worker = freeWorkers.find(w => w.station === station);
    if (!worker) {
      // Fall back to any free worker
      worker = freeWorkers[0];
    }
    if (!worker) continue;

    // Assign worker
    db.prepare(`
      UPDATE orders SET worker_id = ?, status = 'cooking' WHERE id = ?
    `).run(worker.id, order.id);

    // Compute cook time
    const recipeRow = db.prepare<[number], { prep_time_seconds: number }>(
      `SELECT r.prep_time_seconds FROM menu_items mi JOIN recipes r ON r.id = mi.recipe_id WHERE mi.id = ?`
    ).get(order.menu_item_id);

    if (!recipeRow) continue;

    const level = xpToLevel(worker.xp);
    const multiplier = levelPrepMultiplier(level);
    const cookMs = recipeRow.prep_time_seconds * multiplier * 1000;
    cookTimers.set(worker.id, Date.now() + cookMs);

    // Remove worker from free pool for this pass
    const idx = freeWorkers.indexOf(worker);
    if (idx !== -1) freeWorkers.splice(idx, 1);

    debug(`Worker ${worker.id} assigned to order ${order.id} (cook time: ${(cookMs / 1000).toFixed(1)}s)`);
  }
}

// ─── Complete cooked orders ───────────────────────────────────────────────────

interface CookingOrder {
  id: number;
  restaurant_id: number;
  worker_id: number;
  menu_item_id: number;
  placed_at_min: number;
  day_number: number;
  price_paid: number;
  customer_archetype: string;
  customer_display_name: string;
  customer_portrait_id: string;
}

export function completeCookedOrders(restId: number, currentMinute: number): void {
  // Get all cooking orders whose worker's timer has expired
  const cooking = db.prepare<[number], CookingOrder>(`
    SELECT o.id, o.restaurant_id, o.worker_id, o.menu_item_id, o.placed_at_min,
           o.day_number, o.price_paid, o.customer_archetype,
           o.customer_display_name, o.customer_portrait_id
    FROM orders o
    WHERE o.restaurant_id = ? AND o.status = 'cooking' AND o.worker_id IS NOT NULL
  `).all(restId);

  const now = Date.now();

  for (const order of cooking) {
    const busyUntil = cookTimers.get(order.worker_id) ?? 0;
    if (now < busyUntil) {
      // Still cooking — apply mood decay tick
      const worker = db.prepare<[number], Worker>(
        `SELECT * FROM workers WHERE id = ?`
      ).get(order.worker_id);
      if (worker) applyMoodDecayTick(worker);
      continue;
    }

    // Order complete — determine if mistake
    const worker = db.prepare<[number], Worker>(
      `SELECT * FROM workers WHERE id = ?`
    ).get(order.worker_id);
    if (!worker) continue;

    const level = xpToLevel(worker.xp);
    const mistakeProb = levelMistakeProb(level);
    const isMistake = Math.random() < mistakeProb;
    const mistakeKinds = ['burnt', 'wrong_item', 'undercooked', 'slow'] as const;
    const mistakeKind = isMistake ? mistakeKinds[Math.floor(Math.random() * mistakeKinds.length)] : null;

    // Mark order served
    db.prepare(`
      UPDATE orders
      SET status = 'served', served_at_min = ?, was_mistake = ?, mistake_kind = ?
      WHERE id = ?
    `).run(currentMinute, isMistake ? 1 : 0, mistakeKind, order.id);

    // Award XP
    awardOrderXp(order.worker_id);

    // Clear cook timer
    cookTimers.delete(order.worker_id);

    debug(`Order ${order.id} served by worker ${order.worker_id}${isMistake ? ` (${mistakeKind})` : ''}`);

    // Asynchronously generate review (non-blocking)
    generateReviewAsync(order, worker, restId, currentMinute).catch(err => {
      warn(`Review generation failed for order ${order.id}: ${String(err)}`);
    });
  }
}

async function generateReviewAsync(
  order: CookingOrder,
  worker: Worker,
  restId: number,
  currentMinute: number
): Promise<void> {
  try {
    const restSnap = db.prepare<[number], { cleanliness: number; vibe: number; reputation: number }>(
      `SELECT cleanliness, vibe, reputation FROM restaurants WHERE id = ?`
    ).get(restId);
    if (!restSnap) return;

    const menuItemInfo = db.prepare<[number], { display_name: string; price: number }>(
      `SELECT r.display_name, mi.price FROM menu_items mi JOIN recipes r ON r.id = mi.recipe_id WHERE mi.id = ?`
    ).get(order.menu_item_id);
    if (!menuItemInfo) return;

    const level = xpToLevel(worker.xp);
    const persona = PERSONAS[order.customer_archetype as keyof typeof PERSONAS];

    const reviewInput = {
      restaurantSnapshot: {
        cleanliness: restSnap.cleanliness,
        vibe: restSnap.vibe,
        reputation: restSnap.reputation,
      },
      order: {
        menuItemDisplayName: menuItemInfo.display_name,
        priceCharged: order.price_paid,
        waitMinutesInGame: order.placed_at_min > 0
          ? Math.max(0, currentMinute - order.placed_at_min)
          : 5,
        wasMistake: false, // determined after we check order row
      },
      worker: {
        name: worker.name,
        level,
        mood: worker.mood,
      },
      customer: {
        archetype: order.customer_archetype as any,
        displayName: order.customer_display_name,
        tipPct: persona?.tipPct ?? 0.10,
      },
    };

    // Check actual mistake from DB
    const orderRow = db.prepare<[number], { was_mistake: number; served_at_min: number | null }>(
      `SELECT was_mistake, served_at_min FROM orders WHERE id = ?`
    ).get(order.id);

    if (orderRow) {
      reviewInput.order.wasMistake = orderRow.was_mistake === 1;
      if (orderRow.served_at_min !== null && order.placed_at_min) {
        reviewInput.order.waitMinutesInGame = Math.max(0, orderRow.served_at_min - order.placed_at_min);
      }
    }

    // Generate review text (stub in Wave 1)
    const { rawComment } = generateReview(reviewInput);

    // Score the review (stub in Wave 1)
    const userId = db.prepare<[number], { owner_id: number }>(
      `SELECT owner_id FROM restaurants WHERE id = ?`
    ).get(restId)?.owner_id ?? 0;

    const scored = await scoreReview(userId, reviewInput);

    // Compute tip
    const tipPct = persona?.tipPct ?? 0.08;
    const tipAmount = Math.round(order.price_paid * tipPct * scored.scores.service / 100);

    db.transaction(() => {
      db.prepare(`
        INSERT INTO reviews
          (order_id, restaurant_id, raw_comment,
           score_taste, score_cleanliness, score_seating, score_service, score_vibe, score_timing,
           improvement_hint, claude_used, fallback_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        order.id, restId, scored.rawComment || rawComment,
        scored.scores.taste, scored.scores.cleanliness, scored.scores.seating,
        scored.scores.service, scored.scores.vibe, scored.scores.timing,
        scored.improvementHint ?? null,
        scored.claudeUsed ? 1 : 0,
        scored.fallbackReason ?? null
      );

      // Update order with tip and status reviewed
      db.prepare(`
        UPDATE orders SET status = 'reviewed', tip_amount = ? WHERE id = ?
      `).run(tipAmount, order.id);

      // Credit cash: price + tip
      db.prepare(`
        UPDATE restaurants SET cash = cash + ?, updated_at = datetime('now') WHERE id = ?
      `).run(order.price_paid + tipAmount, restId);

      // Update reputation: rolling average of last 20 reviews
      const avgScoreRow = db.prepare<[number], { avg: number }>(
        `SELECT AVG((score_taste + score_cleanliness + score_seating + score_service + score_vibe + score_timing) / 6.0) as avg
         FROM (SELECT * FROM reviews WHERE restaurant_id = ? ORDER BY id DESC LIMIT 20)`
      ).get(restId);
      if (avgScoreRow) {
        db.prepare(`
          UPDATE restaurants SET reputation = ROUND(?) WHERE id = ?
        `).run(Math.min(100, Math.max(0, avgScoreRow.avg)), restId);
      }
    })();

    debug(`Review created for order ${order.id}: service=${scored.scores.service}, tip=$${tipAmount}`);
  } catch (err) {
    warn(`generateReviewAsync failed for order ${order.id}: ${String(err)}`);
  }
}
