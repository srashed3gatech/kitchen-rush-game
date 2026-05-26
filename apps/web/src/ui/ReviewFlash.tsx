import { useEffect, useRef, useState } from 'react';
import { useRestaurantState } from '../App';
import { listReviews } from '../api/endpoints';
import type { Review } from '@kitchen-rush/shared/domain';

/**
 * ReviewFlash — celebratory feedback when a new review lands.
 *
 * Detects new IDs in restaurant.state.last_review_ids, fetches the latest
 * review row, computes its average score, and flashes a tiered halo:
 *   ≥80 → gold
 *   ≥60 → silver/sage
 *    <60 → blue (still positive — cozy genre never shames)
 *
 * Plays a short tone via WebAudio (no asset required). User can mute by
 * dismissing the welcome modal — Phase 2 will add a setting for it.
 */

type Tier = 'gold' | 'silver' | 'blue';

function tierFor(avg: number): Tier {
  if (avg >= 80) return 'gold';
  if (avg >= 60) return 'silver';
  return 'blue';
}

function tierColor(tier: Tier): string {
  switch (tier) {
    case 'gold':   return 'from-yellow-300/40 via-yellow-200/20 to-transparent';
    case 'silver': return 'from-emerald-300/40 via-emerald-200/20 to-transparent';
    case 'blue':   return 'from-sky-300/40 via-sky-200/20 to-transparent';
  }
}

import { playSfx } from '../audio/sfx';

function tierSfx(tier: Tier): 'cheer' | 'chime' | 'sad' {
  switch (tier) {
    case 'gold':   return 'cheer';
    case 'silver': return 'chime';
    case 'blue':   return 'sad';
  }
}

function avgScore(r: Review): number {
  return (
    (r.score_taste +
      r.score_cleanliness +
      r.score_seating +
      r.score_service +
      r.score_vibe +
      r.score_timing) /
    6
  );
}

// Audio now flows through the central WebAudio module (sfx.ts).

interface Flash {
  id: number;
  tier: Tier;
  customerName: string;
  avg: number;
  spawnedAt: number;
}

export default function ReviewFlash() {
  const { state } = useRestaurantState();
  const seenIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);
  const [flashes, setFlashes] = useState<Flash[]>([]);

  useEffect(() => {
    const ids = state?.last_review_ids ?? [];
    if (!initializedRef.current) {
      // First mount: ignore the IDs that were already there (don't flash on page load)
      for (const id of ids) seenIdsRef.current.add(id);
      initializedRef.current = true;
      return;
    }

    const newIds = ids.filter((id) => !seenIdsRef.current.has(id));
    if (newIds.length === 0) return;
    for (const id of newIds) seenIdsRef.current.add(id);

    // Fetch the latest reviews and find the new ones
    listReviews({ limit: 5 })
      .then((res) => {
        if (!res) return;
        const newReviews = res.reviews.filter((r) => newIds.includes(r.id));
        for (const review of newReviews.slice(0, 3)) {
          const avg = avgScore(review);
          const tier = tierFor(avg);
          const customerName =
            // Order doesn't ship with the review row, but raw_comment usually leads with the name —
            // safe fallback to "Customer" otherwise.
            review.raw_comment.split(/[\s,.]/, 1)[0] ?? 'Customer';
          setFlashes((list) => [
            ...list,
            {
              id: review.id,
              tier,
              customerName: customerName.length > 18 ? 'Customer' : customerName,
              avg: Math.round(avg),
              spawnedAt: Date.now(),
            },
          ]);
          playSfx(tierSfx(tier));
        }
      })
      .catch(() => {});
  }, [state?.last_review_ids]);

  // GC old flashes
  useEffect(() => {
    if (flashes.length === 0) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setFlashes((list) => list.filter((f) => now - f.spawnedAt < 1800));
    }, 2000);
    return () => clearTimeout(t);
  }, [flashes]);

  if (flashes.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {flashes.map((f, i) => (
        <div
          key={f.id}
          className={`
            absolute inset-0 bg-gradient-radial-soft
            bg-gradient-to-b ${tierColor(f.tier)}
            animate-fadeInDown
          `}
          style={{ animationDuration: '300ms', opacity: 0.75 - i * 0.15 }}
        >
          <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
            <div className={`
              text-3xl font-bold tabular-nums
              ${f.tier === 'gold' ? 'text-yellow-700' : f.tier === 'silver' ? 'text-emerald-700' : 'text-sky-700'}
            `}>
              {f.tier === 'gold' ? '✨' : f.tier === 'silver' ? '🌿' : '🌊'} {f.avg}
            </div>
            <div className="text-xs text-cozy-dim/70 bg-cozy-warm/80 rounded-full px-3 py-0.5">
              New review from {f.customerName}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
