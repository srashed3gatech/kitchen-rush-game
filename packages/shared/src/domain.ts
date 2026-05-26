// Domain types — mirror the SQLite schema in docs/architecture.md §2.
// Keep field names snake_case to match raw DB rows (no transformation layer).

// ─── Enums ─────────────────────────────────────────────────────────────
export type Persona =
  | 'beach_bum'
  | 'tourist_family'
  | 'date_couple'
  | 'foodie_critic'
  | 'night_owl'
  | 'hangry_surfer';

export type Station =
  | 'grill'
  | 'fryer'
  | 'prep'
  | 'drink'
  | 'dessert'
  | 'assembly'
  | 'floor';

export type RecipeCategory = 'main' | 'drink' | 'dessert' | 'side';

export type OrderStatus = 'queued' | 'cooking' | 'served' | 'reviewed';

export type MistakeKind = 'burnt' | 'wrong_item' | 'undercooked' | 'slow';

export type CoachingKind = 'preset' | 'one_on_one';

export type PresetKey =
  | 'praise'
  | 'take_time'
  | 'try_again'
  | 'watch_heat'
  | 'check_ticket'
  | 'cleanup_when_can';

export type FallbackReason =
  | 'no_key'
  | 'rate_limit'
  | 'invalid_key'
  | 'timeout'
  | 'parse_error'
  | 'network';

// ─── Domain rows ───────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
  // Encrypted Claude API key — NEVER sent to client in plaintext.
  // Server returns `{ hasKey, lastFour }` only via /api/settings/api-key.
}

export interface Restaurant {
  id: number;
  owner_id: number;
  name: string;
  cash: number;            // whole dollars, clamped at 0
  day_number: number;
  in_game_minute: number;  // 0..1439; 480 = 8:00 AM
  is_paused: 0 | 1;
  cleanliness: number;     // 0..100
  vibe: number;            // 0..100
  reputation: number;      // 0..100
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: number;
  slug: string;
  display_name: string;
  category: RecipeCategory;
  base_cost: number;
  default_price: number;
  unlock_cost: number;
  prep_time_seconds: number;
  station: Station;
}

export interface MenuItem {
  id: number;
  restaurant_id: number;
  recipe_id: number;
  price: number;
  is_available: 0 | 1;
  unlocked_at: string;
}

export interface Worker {
  id: number;
  restaurant_id: number;
  name: string;
  portrait_id: string;
  xp: number;              // canonical; level derived via xpToLevel()
  mood: number;            // 0..100
  station: Station;
  wage_per_day: number;
  hired_on_day: number;
  hire_date: string;
  coaching_count: number;
  is_active: 0 | 1;
}

/** Derive 1..5 level from xp using the table in design §4.2. */
export function xpToLevel(xp: number): 1 | 2 | 3 | 4 | 5 {
  if (xp >= 400) return 5;
  if (xp >= 180) return 4;
  if (xp >= 75) return 3;
  if (xp >= 25) return 2;
  return 1;
}

/** Prep-time multiplier per level (design §4.1). */
export function levelPrepMultiplier(level: 1 | 2 | 3 | 4 | 5): number {
  return { 1: 1.0, 2: 0.85, 3: 0.7, 4: 0.55, 5: 0.45 }[level];
}

/** Mistake probability per level (design §4.1). */
export function levelMistakeProb(level: 1 | 2 | 3 | 4 | 5): number {
  return { 1: 0.12, 2: 0.08, 3: 0.05, 4: 0.03, 5: 0.01 }[level];
}

export interface Order {
  id: number;
  restaurant_id: number;
  customer_display_name: string;
  customer_archetype: Persona;
  customer_portrait_id: string;
  worker_id: number | null;
  menu_item_id: number;
  day_number: number;
  placed_at_min: number;
  served_at_min: number | null;
  price_paid: number;
  tip_amount: number;
  was_mistake: 0 | 1;
  mistake_kind: MistakeKind | null;
  status: OrderStatus;
  created_at: string;
}

export interface Review {
  id: number;
  order_id: number;
  restaurant_id: number;
  raw_comment: string;
  score_taste: number;        // 0..100
  score_cleanliness: number;  // 0..100
  score_seating: number;      // 0..100
  score_service: number;      // 0..100
  score_vibe: number;         // 0..100
  score_timing: number;       // 0..100
  improvement_hint: string | null;  // ≤140 chars
  claude_used: 0 | 1;
  fallback_reason: FallbackReason | null;
  created_at: string;
}

export interface CoachingSession {
  id: number;
  restaurant_id: number;
  worker_id: number;
  day_number: number;
  kind: CoachingKind;
  preset_key: PresetKey | null;
  owner_message: string | null;
  worker_response: string | null;
  xp_delta: number;
  mood_delta: number;
  claude_used: 0 | 1;
  created_at: string;
}

export interface DailyScore {
  restaurant_id: number;
  day_number: number;
  daily_score: number;       // already ×1000
  rolling_score: number;     // already ×1000
  feedback_norm: number;
  sales_norm: number;
  team_norm: number;
  growth_norm: number;
  consistency_norm: number;
  computed_at: string;
}

// ─── Aggregates / view-shaped types ────────────────────────────────────

/** Snapshot returned by GET /api/restaurant/state. */
export interface RestaurantState {
  restaurant: Restaurant;
  workers: Worker[];
  /** Active orders (status in 'queued'|'cooking'|'served' not yet reviewed). */
  open_orders: Order[];
  /** Customers currently in the scene (visual entities; ephemeral). */
  customers_in_scene: CustomerInScene[];
  /** Last 3 review IDs so client can lazy-load full reviews if needed. */
  last_review_ids: number[];
  /** Owner's current displayed score (latest daily_score × rolling_score). */
  current_score: number | null;
  /** Whether quiet hours are in effect (5–8 AM). */
  is_quiet_hours: boolean;
}

/** Lightweight visual entity for canvas — not persisted in DB. */
export interface CustomerInScene {
  ephemeral_id: string;       // client-stable id for animation continuity
  display_name: string;
  archetype: Persona;
  portrait_id: string;
  phase: 'walking_in' | 'seated' | 'eating' | 'leaving';
  arrival_at_minute: number;
}

/** Hire candidate (server proposes 3 per critique §5.8). */
export interface HireCandidate {
  candidate_id: string;       // ephemeral token; consumed by hire
  name: string;
  portrait_id: string;
  mood_baseline: number;
  suggested_station: Station;
  cost: number;               // computed from design §4.5 curve
}

/** Leaderboard row (top 10). */
export interface LeaderboardRow {
  restaurant_id: number;
  owner_display_name: string;
  restaurant_name: string;
  rolling_score: number;      // already ×1000
  day_number: number;
}
