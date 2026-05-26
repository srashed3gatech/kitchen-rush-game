// Scoring contract — per docs/architecture.md §6 and docs/design.md §7.
// Score scale is 0–100 integer everywhere (critique §1.1 lock).
import type { FallbackReason, Persona } from './domain.js';

export interface SixScores {
  taste: number;       // 0..100
  cleanliness: number; // 0..100
  seating: number;     // 0..100
  service: number;     // 0..100
  vibe: number;        // 0..100
  timing: number;      // 0..100
}

export interface ReviewInput {
  restaurantSnapshot: {
    cleanliness: number;
    vibe: number;
    reputation: number;
  };
  order: {
    menuItemDisplayName: string;
    priceCharged: number;
    waitMinutesInGame: number;
    wasMistake: boolean;
  };
  worker: {
    name: string;
    level: 1 | 2 | 3 | 4 | 5;
    mood: number;
  } | null;
  customer: {
    archetype: Persona;
    displayName: string;
    /** Tip percent the persona tends toward (e.g. 0.08 for Beach Bum). */
    tipPct: number;
  };
}

export interface ScoredReview {
  rawComment: string;        // NPC voice, ≤ 280 chars
  scores: SixScores;
  improvementHint: string;   // ≤ 140 chars, owner-facing
  claudeUsed: boolean;
  fallbackReason?: FallbackReason;
}

/** Helper: mean of the six dimensions (0..100). */
export function meanScore(s: SixScores): number {
  return Math.round((s.taste + s.cleanliness + s.seating + s.service + s.vibe + s.timing) / 6);
}
