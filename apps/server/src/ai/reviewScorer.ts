// reviewScorer.ts — heuristic review scorer (no AI in this path).
// Per user direction: AI is opt-in via Settings but reviews default to heuristic.
// This file is the only path actually executed in the current build.
//
// Design goals (kid-friendly cozy game):
//  - Scores skew positive. Good days hit 75–90, average days 55–75, bad days 35–55.
//  - Timing is forgiving: cozy game has no walkouts. Waits of 30 in-game min are still
//    great, 120 min is okay, 300+ min is the floor.
//  - Mistakes hurt taste but not catastrophically.
//  - Cleanliness/vibe scores track the live restaurant state.

import type { ReviewInput, ScoredReview } from '@kitchen-rush/shared';

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(val)));
}

function jitter(spread: number): number {
  return Math.floor(Math.random() * (spread * 2 + 1)) - spread;
}

const IMPROVEMENT_DIMENSIONS = ['taste', 'cleanliness', 'seating', 'service', 'vibe', 'timing'] as const;
type Dim = (typeof IMPROVEMENT_DIMENSIONS)[number];

const HINTS: Record<Dim, string> = {
  taste:       'Maybe the cooks need more practice.',
  cleanliness: 'A bit of cleaning would help.',
  seating:     'The seating could be cozier.',
  service:     'A friendlier vibe at the counter helps.',
  vibe:        'Tune the music or lighting a touch.',
  timing:      'Things felt a bit slow today.',
};

/**
 * Forgiving timing curve. Returns 0..100.
 *  wait =   0 →  95
 *  wait =  30 →  88
 *  wait =  60 →  80
 *  wait = 120 →  65
 *  wait = 240 →  45
 *  wait = 480 →  25  (floor)
 */
function timingScore(waitInGameMin: number): number {
  const w = Math.max(0, waitInGameMin);
  // Exponential decay toward a floor of 25.
  const decayed = 70 * Math.exp(-w / 180);
  return clamp(25 + decayed, 0, 100);
}

export async function scoreReview(_userId: number, input: ReviewInput): Promise<ScoredReview> {
  const workerLevel = input.worker?.level ?? 1;
  const workerMood = input.worker?.mood ?? 50;
  const wasMistake = input.order.wasMistake;

  // Taste: level matters, mistake hurts but doesn't destroy.
  const taste = clamp(
    55 + workerLevel * 6 + (wasMistake ? -18 : 0) + jitter(4),
    20, 100,
  );

  // Cleanliness/vibe/seating reflect the live restaurant.
  const cleanliness = clamp(input.restaurantSnapshot.cleanliness + jitter(5), 25, 100);
  const seating     = clamp(input.restaurantSnapshot.vibe + jitter(5), 30, 100);
  const vibe        = clamp(input.restaurantSnapshot.vibe + jitter(4), 30, 100);

  // Service: dominated by worker mood.
  const service = clamp(50 + workerMood * 0.4 + jitter(5), 25, 100);

  // Timing: forgiving curve.
  const timing = clamp(timingScore(input.order.waitMinutesInGame) + jitter(4), 20, 100);

  const scores = { taste, cleanliness, seating, service, vibe, timing };

  // Improvement hint: pick the lowest dimension and use a friendly phrase.
  const entries = Object.entries(scores) as [Dim, number][];
  const [lowestDim, lowestVal] = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  // If everything is fine (lowest ≥ 70), keep the hint cheerful.
  const improvementHint =
    lowestVal >= 70 ? 'Everything felt just right today.' : HINTS[lowestDim];

  // Raw comment is generated upstream by reviewTemplates.ts; this scorer doesn't
  // overwrite it. We pass an empty rawComment and let the caller use the template.
  return {
    rawComment: '',
    scores,
    improvementHint,
    claudeUsed: false,
    fallbackReason: 'no_key',
  };
}
