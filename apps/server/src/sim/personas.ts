// Persona constants and helpers for NPC customer generation.
// See design §5.2 and §5.4.

import type { Persona, Station } from '@kitchen-rush/shared';

export interface PersonaConfig {
  id: Persona;
  display_name_template: string;
  tipPct: number;
  patience_baseline: number;  // informational only — never causes walkouts
  preferred_items: string[];  // recipe slugs
  portrait_pool: string[];    // sprite atlas keys
  name_pool: string[];
}

export const PERSONAS: Record<Persona, PersonaConfig> = {
  beach_bum: {
    id: 'beach_bum',
    display_name_template: 'Beach Bum local',
    tipPct: 0.08,
    patience_baseline: 5,
    preferred_items: ['classic_burger', 'french_fries', 'cola'],
    portrait_pool: ['customer_beach_bum_idle'],
    name_pool: ['Sandy', 'Cody', 'Mia', 'Reef', 'Kai', 'Luna', 'Zeke', 'Dani'],
  },
  tourist_family: {
    id: 'tourist_family',
    display_name_template: 'Tourist family',
    tipPct: 0.12,
    patience_baseline: 3,
    preferred_items: ['kids_snack_box', 'chicken_nuggets', 'strawberry_lemonade', 'french_fries'],
    portrait_pool: ['customer_tourist_idle'],
    name_pool: ['The Johnsons', 'The Garcias', 'The Nguyens', 'The Smiths', 'The Kims', 'The Müllers'],
  },
  date_couple: {
    id: 'date_couple',
    display_name_template: 'Date couple',
    tipPct: 0.18,
    patience_baseline: 4,
    preferred_items: ['pizza_margherita', 'pizza_pepperoni', 'cake', 'dragon_fruit', 'strawberry_lemonade'],
    portrait_pool: ['customer_date_couple_idle'],
    name_pool: ['Marco & Priya', 'Taylor & Morgan', 'Sam & Riley', 'Jordan & Casey', 'Alex & Quinn', 'Lee & Avery'],
  },
  foodie_critic: {
    id: 'foodie_critic',
    display_name_template: 'Foodie critic',
    tipPct: 0.10,
    patience_baseline: 3,
    preferred_items: ['cheeseburger', 'spicy_fries', 'strawberry_lemonade', 'pizza_margherita'],
    portrait_pool: ['customer_foodie_idle'],
    name_pool: ['Nico', 'Celeste', 'Hugo', 'Ingrid', 'Pham', 'Élise', 'Kai', 'Soren'],
  },
  night_owl: {
    id: 'night_owl',
    display_name_template: 'Night owl student',
    tipPct: 0.06,
    patience_baseline: 4,
    preferred_items: ['double_burger', 'cola', 'ice_cream', 'french_fries'],
    portrait_pool: ['customer_night_owl_idle'],
    name_pool: ['Dev', 'Lex', 'Cam', 'Skye', 'Milo', 'Rue', 'Finn', 'Zara'],
  },
  hangry_surfer: {
    id: 'hangry_surfer',
    display_name_template: 'Hangry surfer',
    tipPct: 0.09,
    patience_baseline: 2,
    preferred_items: ['double_burger', 'french_fries', 'cola', 'cola'],
    portrait_pool: ['customer_surfer_idle'],
    name_pool: ['Beau', 'Tyde', 'Jax', 'Rip', 'Cruz', 'Ace', 'Tide', 'Dash'],
  },
};

// ─── Spawn weights by hour bucket (design §5.4) ─────────────────────────────

interface SpawnWeights {
  beach_bum: number;
  tourist_family: number;
  date_couple: number;
  foodie_critic: number;
  night_owl: number;
  hangry_surfer: number;
}

const SPAWN_WEIGHTS_BY_HOUR: [hourMin: number, hourMax: number, weights: SpawnWeights][] = [
  [8,  11, { beach_bum: 40, tourist_family: 25, date_couple: 0,  foodie_critic: 10, night_owl: 0,  hangry_surfer: 25 }],
  [12, 14, { beach_bum: 20, tourist_family: 40, date_couple: 5,  foodie_critic: 15, night_owl: 0,  hangry_surfer: 20 }],
  [15, 17, { beach_bum: 30, tourist_family: 25, date_couple: 10, foodie_critic: 15, night_owl: 0,  hangry_surfer: 20 }],
  [18, 21, { beach_bum: 15, tourist_family: 20, date_couple: 40, foodie_critic: 20, night_owl: 0,  hangry_surfer: 5  }],
  [22, 24, { beach_bum: 25, tourist_family: 0,  date_couple: 25, foodie_critic: 15, night_owl: 25, hangry_surfer: 10 }],
  [1,  4,  { beach_bum: 20, tourist_family: 0,  date_couple: 5,  foodie_critic: 10, night_owl: 60, hangry_surfer: 5  }],
];

function getWeightsForHour(hour: number): SpawnWeights {
  // hour is 0–23 (in-game)
  for (const [min, max, weights] of SPAWN_WEIGHTS_BY_HOUR) {
    const h = hour < min && hour <= 4 ? hour + 24 : hour; // handle wrap
    if (h >= min && h <= max) return weights;
    if (hour >= min && hour <= max) return weights;
  }
  // Default to morning weights
  return SPAWN_WEIGHTS_BY_HOUR[0]![2]!;
}

function weightedPickPersona(weights: SpawnWeights): Persona {
  const entries = Object.entries(weights) as [Persona, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [persona, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return persona;
  }
  return 'beach_bum';
}

export function pickPersona(in_game_hour: number): Persona {
  const weights = getWeightsForHour(in_game_hour);
  return weightedPickPersona(weights);
}

export function generateCustomerName(persona: Persona): string {
  const pool = PERSONAS[persona].name_pool;
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? 'Guest';
}

export function getCustomerPortrait(persona: Persona): string {
  const pool = PERSONAS[persona].portrait_pool;
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? 'customer_beach_bum_idle';
}

// ─── Arrival rate per hour from design §5.1 ─────────────────────────────────

const LAMBDA_BY_HOUR: Record<number, number> = {
  8: 0.5, 9: 1.0, 10: 1.5, 11: 3.0, 12: 5.0, 13: 5.0, 14: 3.5,
  15: 1.5, 16: 2.0, 17: 3.0, 18: 4.0, 19: 4.5, 20: 4.5, 21: 3.0,
  22: 2.5, 23: 1.5, 0: 1.0, 1: 1.0, 2: 0.7, 3: 0.4, 4: 0.3,
};

/** Base λ for given in-game hour (0–23). */
export function getLambdaForHour(hour: number): number {
  return LAMBDA_BY_HOUR[hour] ?? 0;
}

/**
 * Reputation multiplier: m = clamp(0.6 + 0.7 * rep/100, 0.6, 1.3)
 * per design §5.1 / architecture §10 Q1.
 */
export function reputationMultiplier(reputation: number): number {
  return Math.min(1.3, Math.max(0.6, 0.6 + 0.7 * reputation / 100));
}

/**
 * Sample a Poisson random variable with expected value lambda.
 * Uses the standard Knuth algorithm.
 */
export function samplePoisson(lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1.0;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}
