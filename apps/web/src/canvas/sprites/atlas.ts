/**
 * Sprite Atlas — maps every SpriteKey to a source file + crop rect.
 *
 * All source paths are relative to /sprites/ (Vite serves apps/web/public
 * statically at /). For MVP these point at procedural placeholder PNGs in
 * apps/web/public/sprites/. Swap in real Kenney PNGs by replacing the files —
 * the atlas keys and rects stay the same.
 *
 * Worker portraits: 64×64 circle-with-chef-hat placeholders.
 * Customer portraits: 64×64 persona-coloured circle placeholders.
 * Stations: 96×96 coloured square placeholders.
 * Furniture: brown circle/square placeholders.
 */

export interface SpriteRect {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ATLAS: Record<string, SpriteRect> = {
  // ── Workers ────────────────────────────────────────────────────────────────
  worker_chef_blond_idle:      { src: 'toon-characters/chef_blond.png',      x: 0, y: 0, w: 64, h: 64 },
  worker_chef_brown_idle:      { src: 'toon-characters/chef_brown.png',      x: 0, y: 0, w: 64, h: 64 },
  worker_chef_redhead_idle:    { src: 'toon-characters/chef_redhead.png',    x: 0, y: 0, w: 64, h: 64 },
  worker_chef_short_idle:      { src: 'toon-characters/chef_short.png',      x: 0, y: 0, w: 64, h: 64 },

  // ── Customers (persona-keyed, matches orders.customer_portrait_id) ─────────
  customer_beach_bum:          { src: 'toon-characters/beach_bum.png',       x: 0, y: 0, w: 64, h: 64 },
  customer_tourist_family_dad: { src: 'toon-characters/tourist_dad.png',     x: 0, y: 0, w: 64, h: 64 },
  customer_tourist_family_mom: { src: 'toon-characters/tourist_mom.png',     x: 0, y: 0, w: 64, h: 64 },
  customer_tourist_family_kid: { src: 'toon-characters/tourist_kid.png',     x: 0, y: 0, w: 64, h: 64 },
  customer_date_couple_a:      { src: 'toon-characters/date_a.png',          x: 0, y: 0, w: 64, h: 64 },
  customer_date_couple_b:      { src: 'toon-characters/date_b.png',          x: 0, y: 0, w: 64, h: 64 },
  customer_foodie_critic:      { src: 'toon-characters/foodie.png',          x: 0, y: 0, w: 64, h: 64 },
  customer_night_owl:          { src: 'toon-characters/night_owl.png',       x: 0, y: 0, w: 64, h: 64 },
  customer_hangry_surfer:      { src: 'toon-characters/hangry_surfer.png',   x: 0, y: 0, w: 64, h: 64 },

  // ── Kitchen stations ───────────────────────────────────────────────────────
  station_grill:               { src: 'restaurant-kit/grill.png',            x: 0, y: 0, w: 96, h: 96 },
  station_fryer:               { src: 'restaurant-kit/fryer.png',            x: 0, y: 0, w: 96, h: 96 },
  station_drink:               { src: 'restaurant-kit/drink.png',            x: 0, y: 0, w: 96, h: 96 },
  station_dessert:             { src: 'restaurant-kit/dessert.png',          x: 0, y: 0, w: 96, h: 96 },
  station_prep:                { src: 'restaurant-kit/prep.png',             x: 0, y: 0, w: 96, h: 96 },
  station_assembly:            { src: 'restaurant-kit/assembly.png',         x: 0, y: 0, w: 96, h: 96 },
  station_counter:             { src: 'restaurant-kit/counter.png',          x: 0, y: 0, w: 96, h: 96 },

  // ── Furniture ─────────────────────────────────────────────────────────────
  furniture_table_round:       { src: 'restaurant-kit/table.png',            x: 0, y: 0, w: 64, h: 64 },
  furniture_chair:             { src: 'restaurant-kit/chair.png',            x: 0, y: 0, w: 32, h: 32 },
} as const;

export type SpriteKey = keyof typeof ATLAS;
