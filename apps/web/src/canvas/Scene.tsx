/**
 * Scene — the HTML5 Canvas restaurant scene.
 *
 * ## Prop contract
 * Accepts a single `state: RestaurantState | null` prop.
 *
 * The Frontend SWE should either:
 *   a) Pass state directly: <Scene state={restaurantState} />
 *   b) Pull state from a React Context and wrap Scene — either works.
 *
 * If state is null (loading / not yet authenticated), the Scene renders
 * the beach empty-state animation (ocean shimmer, no workers, no customers).
 *
 * ## Canvas size
 * Fixed 960×600. `rounded-lg shadow-lg` styling per spec.
 *
 * ## RAF loop
 * Starts on mount, stops on unmount. Never simulates game logic —
 * purely visual render of the server-authoritative state snapshot.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { RestaurantState } from '@kitchen-rush/shared';
import { preloadAll } from './sprites/loader.js';
import { drawBeach } from './render/drawBeach.js';
import { drawShop } from './render/drawShop.js';
import { drawWorkers, STATION_POSITIONS } from './render/drawWorkers.js';
import type { CoachingEvent } from './render/drawWorkers.js';
import { drawCustomers, getSeatIndexForId } from './render/drawCustomers.js';
import { SHOP_LAYOUT } from './render/drawShop.js';
import { drawDayNightOverlay } from './render/drawDayNightOverlay.js';
import { store } from '../state/store.js';

export interface SceneProps {
  state: RestaurantState | null;
}

const CANVAS_W = 960;
const CANVAS_H = 600;

export function Scene({ state }: SceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  /**
   * Coaching events received since last render.
   * Populated externally via the imperative addCoachingEvent() handle
   * OR by detecting new coaching sessions in state (see effect below).
   */
  const coachingEventsRef = useRef<CoachingEvent[]>([]);

  // Track last seen coaching session count per worker to detect new sessions
  const lastCoachingCountRef = useRef<Map<number, number>>(new Map());

  // Buffer recent coach posts (workerId → presetKey) keyed by ms timestamp.
  // CoachingModal dispatches 'kr:coach' with these so we know the REAL preset
  // when the polling diff next reveals a coaching_count bump.
  const pendingCoachRef = useRef<Map<number, { presetKey: string; ts: number }>>(new Map());

  useEffect(() => {
    function onCoach(e: Event) {
      const detail = (e as CustomEvent).detail as { workerId: number; presetKey: string };
      if (!detail) return;
      pendingCoachRef.current.set(detail.workerId, {
        presetKey: detail.presetKey,
        ts: performance.now(),
      });
    }
    window.addEventListener('kr:coach', onCoach as EventListener);
    return () => window.removeEventListener('kr:coach', onCoach as EventListener);
  }, []);

  // Detect new coaching sessions from state and push bubble events
  useEffect(() => {
    if (!state?.workers) return;
    for (const worker of state.workers) {
      const prev = lastCoachingCountRef.current.get(worker.id);
      if (prev !== undefined && worker.coaching_count > prev) {
        // Look for a recent local 'kr:coach' event to learn the actual preset.
        const pending = pendingCoachRef.current.get(worker.id);
        const presetKey =
          pending && performance.now() - pending.ts < 4000 ? pending.presetKey : 'praise';
        if (pending) pendingCoachRef.current.delete(worker.id);
        coachingEventsRef.current = [
          ...coachingEventsRef.current.filter((e) => e.workerId !== worker.id),
          { workerId: worker.id, presetKey, receivedAt: performance.now() },
        ];
      }
      lastCoachingCountRef.current.set(worker.id, worker.coaching_count);
    }
  }, [state]);

  // ── Canvas click → coach the worker under the cursor ─────────────────
  // UXR fix: design assigned the canvas as primary interaction surface but
  // no click handler was wired. Hit-test the click position against worker
  // station positions.
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!state) return;
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      // Scale click coords to canvas internal resolution (in case of CSS scaling)
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      // Worker hit radius: bumped to 48 for fat fingers on iPad.
      // (Worker sprite anchors are top-left of station rect, so test against center.)
      const HIT_RADIUS = 48;
      let bestId: number | null = null;
      let bestDist = Infinity;
      if (state.workers) {
        for (const worker of state.workers) {
          const pos = STATION_POSITIONS[worker.station] ?? STATION_POSITIONS['floor'];
          if (!pos) continue;
          // Station rects render at pos.x..pos.x+64, so center ≈ pos.x+32, pos.y+32
          const cx = pos.x + 32;
          const cy = pos.y + 32;
          const d = Math.hypot(x - cx, y - cy);
          if (d < HIT_RADIUS && d < bestDist) {
            bestDist = d;
            bestId = worker.id;
          }
        }
      }
      // Worker hit-test takes precedence over table hit-test.
      if (bestId !== null) {
        store.openCoaching(bestId);
        return;
      }

      // Table hit-test: 90×70 bounding box centered on each tableCenters entry.
      // Each table N owns seats [N*2] and [N*2+1]. Match a customer to a table
      // via the stable seat-index hash on their ephemeral_id.
      const TABLE_HIT_W = 90;
      const TABLE_HIT_H = 70;
      for (let i = 0; i < SHOP_LAYOUT.tableCenters.length; i++) {
        const t = SHOP_LAYOUT.tableCenters[i]!;
        if (
          x >= t.cx - TABLE_HIT_W / 2 &&
          x <= t.cx + TABLE_HIT_W / 2 &&
          y >= t.cy - TABLE_HIT_H / 2 &&
          y <= t.cy + TABLE_HIT_H / 2
        ) {
          const tableSeats = [i * 2, i * 2 + 1];
          const customer = (state.customers_in_scene ?? []).find((c) =>
            tableSeats.includes(getSeatIndexForId(c.ephemeral_id)),
          );
          if (customer) {
            // ephemeral_id format: "order-<N>"
            const match = /^order-(\d+)$/.exec(customer.ephemeral_id);
            if (match) {
              const orderId = Number(match[1]);
              store.setState({
                openModal: 'inspect-customer',
                inspectCustomerOrderId: orderId,
              });
            }
          }
          return;
        }
      }
    },
    [state],
  );

  const draw = useCallback((ctx: CanvasRenderingContext2D, timeMs: number) => {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // 1. Beach background (procedural — always rendered)
    drawBeach({ ctx, timeMs, width: CANVAS_W, height: CANVAS_H });

    // 2. Restaurant interior (stations, furniture)
    drawShop(ctx, timeMs);

    // 3. Workers
    if (state?.workers) {
      // Purge expired coaching events (> 5 seconds old)
      const now = performance.now();
      coachingEventsRef.current = coachingEventsRef.current.filter(
        (e) => now - e.receivedAt < 5000,
      );
      drawWorkers(ctx, state.workers, timeMs, coachingEventsRef.current);
    }

    // 4. Customers in scene
    if (state?.customers_in_scene) {
      drawCustomers(
        ctx,
        state.customers_in_scene,
        timeMs,
        state?.restaurant?.in_game_minute ?? 480,
      );
    }

    // 5. Day-night overlay (topmost layer)
    const minute = state?.restaurant?.in_game_minute ?? 480; // default 8 AM
    drawDayNightOverlay(ctx, minute, CANVAS_W, CANVAS_H);

    // 6. Empty-state animation cue (only when truly empty: no workers yet,
    //    OR during quiet hours when both empty). UXR fix: previous code fired
    //    whenever customers OR workers was empty — which is often during play.
    const minuteForCue = state?.restaurant?.in_game_minute ?? 480;
    const isQuietHours = minuteForCue >= 300 && minuteForCue < 480;
    const noWorkers = state?.workers?.length === 0;
    if (!state || (noWorkers && isQuietHours)) {
      drawEmptyStateCue(ctx, timeMs, CANVAS_W, CANVAS_H);
    }
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Preload all sprites (non-blocking — draw loop handles missing sprites gracefully)
    void preloadAll();

    let running = true;
    function loop(timeMs: number) {
      if (!running) return;
      draw(ctx!, timeMs);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onClick={handleCanvasClick}
      className="rounded-lg shadow-lg cursor-pointer max-w-full h-auto"
      style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
      aria-label="Kitchen Rush restaurant scene — tap a cook to coach, tap a customer to chat"
    />
  );
}

// ── Empty-state cue (design §1) ───────────────────────────────────────────────
// Shown when no state yet or no workers/customers. Draws a gentle "loading" vibe.

function drawEmptyStateCue(
  ctx: CanvasRenderingContext2D,
  timeMs: number,
  width: number,
  height: number,
): void {
  const t = timeMs / 1000;

  // Two silhouette NPCs walking on the beach path (parallax)
  for (let i = 0; i < 2; i++) {
    const speed = 0.04 + i * 0.015;
    const startDelay = i === 0 ? 3 : 8; // appear at T+3s and T+8s
    const elapsed = t - startDelay;
    if (elapsed < 0) continue;

    const xOffset = (elapsed * speed * width) % (width + 80);
    const nx = xOffset - 40;
    const ny = height * 0.72 + i * 6;
    const bob = Math.sin(t * 3.5 + i * 2.1) * 2;

    ctx.save();
    ctx.globalAlpha = 0.45;
    // Silhouette blob
    ctx.fillStyle = '#4A3820';
    ctx.beginPath();
    ctx.ellipse(nx, ny + bob, 10, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.arc(nx, ny + bob - 16, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // "Opening soon..." hint while truly empty
  if (t > 1) {
    const pulse = (Math.sin(t * 1.2) + 1) / 2;
    ctx.save();
    ctx.globalAlpha = 0.3 + pulse * 0.3;
    ctx.fillStyle = '#7A5C30';
    ctx.font = 'italic 14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('The shop is quiet...', width / 2, height * 0.42);
    ctx.restore();
  }
}
