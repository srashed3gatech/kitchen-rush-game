// DTOs for every REST endpoint in docs/architecture.md §3.
// Naming: <Verb><Resource>Body / <Verb><Resource>Response.
import type {
  Restaurant,
  Worker,
  Order,
  Review,
  MenuItem,
  Recipe,
  HireCandidate,
  LeaderboardRow,
  RestaurantState,
  PresetKey,
  Station,
  CoachingSession,
} from './domain.js';

// ─── Health ──────────────────────────────────────────────────────────
export interface HealthResponse { ok: true; version: string; }

// ─── Auth ────────────────────────────────────────────────────────────
export interface RegisterBody { username: string; displayName: string; }
export interface LoginBody    { username: string; }
export interface AuthResponse { user: PublicUser; restaurantId: number; }
export interface MeResponse   { user: PublicUser; restaurantId: number; }
export interface PublicUser   { id: number; username: string; display_name: string; }

// ─── Restaurant ──────────────────────────────────────────────────────
export interface CleanBody { target?: 'floor' | 'tables' | 'all'; }
export interface CleanResponse { cleanliness: number; }

// ─── Day control ─────────────────────────────────────────────────────
export interface StartDayResponse { day_number: number; in_game_minute: number; }
export interface PauseDayResponse { is_paused: 1; }
export interface EndDayResponse   { day_number: number; summary: DaySummary; }

export interface DaySummary {
  day_number: number;
  customers_served: number;
  gross_sales: number;
  tips_total: number;
  mistakes: number;
  avg_scores: import('./scoring.js').SixScores;
  daily_score: number;
  rolling_score: number;
}

// ─── Workers ─────────────────────────────────────────────────────────
export interface WorkersResponse           { workers: Worker[]; }
export interface HireCandidatesResponse    { candidates: HireCandidate[]; }
export interface HireBody                  { candidate_id: string; station: Station; }
export interface HireResponse              { worker: Worker; cash: number; }
export interface AssignBody                { station: Station; }
export interface AssignResponse            { worker: Worker; }
export interface CoachPresetBody           { presetKey: PresetKey; }
export interface CoachPresetResponse       { session: CoachingSession; worker: Worker; }
export interface OneOnOneBody              { choice: 1 | 2 | 3; }
export interface OneOnOneResponse          { session: CoachingSession; worker: Worker; }

// ─── Menu ────────────────────────────────────────────────────────────
export interface MenuResponse              { items: MenuItem[]; available_recipes: Recipe[]; }
export interface UnlockMenuBody            { recipeId: number; price?: number; }
export interface UnlockMenuResponse        { item: MenuItem; cash: number; }
export interface PatchMenuItemBody         { price?: number; is_available?: 0 | 1; }
export interface PatchMenuItemResponse     { item: MenuItem; }

// ─── Reviews ─────────────────────────────────────────────────────────
export interface ReviewsResponse           { reviews: Review[]; nextCursor: string | null; }

// ─── Leaderboard ─────────────────────────────────────────────────────
export interface LeaderboardResponse       { rows: LeaderboardRow[]; }

// ─── Settings ────────────────────────────────────────────────────────
export interface GetApiKeyResponse         { hasKey: boolean; lastFour?: string; lastFallback?: import('./domain.js').FallbackReason | null; }
export interface PutApiKeyBody             { apiKey: string; }
export interface PutApiKeyResponse         { hasKey: true; lastFour: string; }
export interface DeleteApiKeyResponse      { hasKey: false; }
export interface SettingsResponse          { kv: Record<string, string>; }
export interface PutSettingBody            { value: string; }
export interface PutSettingResponse        { key: string; value: string; }

// ─── Dev (NODE_ENV=development only) ─────────────────────────────────
export interface AdvanceDaysBody           { count: number; withReviews?: boolean; }
export interface AdvanceDaysResponse       { day_number: number; }

// ─── Polling state ───────────────────────────────────────────────────
export type StateResponse = RestaurantState;

// ─── Error envelope ──────────────────────────────────────────────────
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
