/**
 * Typed endpoint wrappers for the Kitchen Rush REST API (architecture §3).
 *
 * Uses shared DTOs from @kitchen-rush/shared where available.
 */

import { apiFetch } from './client';
import type {
  PublicUser,
  AuthResponse,
  MeResponse,
  CleanResponse,
  StartDayResponse,
  PauseDayResponse,
  EndDayResponse,
  WorkersResponse,
  HireCandidatesResponse,
  HireResponse,
  AssignResponse,
  CoachPresetResponse,
  OneOnOneResponse,
  MenuResponse,
  UnlockMenuResponse,
  PatchMenuItemResponse,
  ReviewsResponse,
  LeaderboardResponse,
  GetApiKeyResponse,
  PutApiKeyResponse,
  DeleteApiKeyResponse,
  SettingsResponse,
  PutSettingResponse,
  StateResponse,
} from '@kitchen-rush/shared/api';

// Re-export useful shared types for UI consumption
export type { PublicUser };
export type UserDTO = PublicUser;

// Re-export domain types used by UI components
export type {
  Worker as WorkerDTO,
  Order as OpenOrderDTO,
  Review as ReviewDTO,
  MenuItem as MenuItemDTO,
  Recipe as RecipeDTO,
  LeaderboardRow as LeaderboardRowDTO,
  HireCandidate as HireCandidateDTO,
  CoachingSession as CoachingSessionDTO,
  RestaurantState as RestaurantStateDTO,
} from '@kitchen-rush/shared/domain';

export type { EndDayResponse as DaySummaryDTO };

// ─── Auth ─────────────────────────────────────────────────────────────────

export async function register(username: string, displayName: string) {
  return apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, displayName }),
  });
}

export async function login(username: string) {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function logout() {
  return apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export async function me() {
  return apiFetch<MeResponse>('/api/auth/me');
}

// ─── Restaurant state ────────────────────────────────────────────────────

export async function getState(opts?: { etag?: string }) {
  return apiFetch<StateResponse>('/api/restaurant/state', {
    method: 'GET',
    etag: opts?.etag,
  });
}

export async function clean(target?: 'floor' | 'tables' | 'all') {
  return apiFetch<CleanResponse>('/api/restaurant/clean', {
    method: 'POST',
    body: JSON.stringify({ target }),
  });
}

// ─── Day ─────────────────────────────────────────────────────────────────

export async function startDay() {
  return apiFetch<StartDayResponse>('/api/day/start', {
    method: 'POST',
  });
}

export async function pauseDay() {
  return apiFetch<PauseDayResponse>('/api/day/pause', { method: 'POST' });
}

export async function endDay() {
  return apiFetch<EndDayResponse>('/api/day/end', {
    method: 'POST',
  });
}

// ─── Workers ─────────────────────────────────────────────────────────────

export async function listWorkers() {
  return apiFetch<WorkersResponse>('/api/workers');
}

export async function getHireCandidates() {
  return apiFetch<HireCandidatesResponse>('/api/workers/candidates');
}

export async function hireWorker(candidateId: string, station: string) {
  return apiFetch<HireResponse>('/api/workers/hire', {
    method: 'POST',
    body: JSON.stringify({ candidate_id: candidateId, station }),
  });
}

export async function assignWorker(workerId: number, station: string) {
  return apiFetch<AssignResponse>(`/api/workers/${workerId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ station }),
  });
}

export async function coachPreset(
  workerId: number,
  presetKey:
    | 'praise'
    | 'take_time'
    | 'try_again'
    | 'watch_heat'
    | 'check_ticket'
    | 'cleanup_when_can',
) {
  return apiFetch<CoachPresetResponse>(`/api/workers/${workerId}/coach`, {
    method: 'POST',
    body: JSON.stringify({ presetKey }),
  });
}

export async function oneOnOne(workerId: number, choice: 1 | 2 | 3) {
  return apiFetch<OneOnOneResponse>(`/api/workers/${workerId}/one-on-one`, {
    method: 'POST',
    body: JSON.stringify({ choice }),
  });
}

// ─── Menu ────────────────────────────────────────────────────────────────

export async function listMenu() {
  return apiFetch<MenuResponse>('/api/menu');
}

export async function unlockMenuItem(recipeId: number, price?: number) {
  return apiFetch<UnlockMenuResponse>('/api/menu/unlock', {
    method: 'POST',
    body: JSON.stringify({ recipeId, price }),
  });
}

export async function patchMenuItem(
  menuItemId: number,
  patch: { price?: number; is_available?: 0 | 1 },
) {
  return apiFetch<PatchMenuItemResponse>(`/api/menu/${menuItemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// ─── Reviews ─────────────────────────────────────────────────────────────

export async function listReviews(opts?: { limit?: number; cursor?: string }) {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.cursor) params.set('cursor', opts.cursor);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<ReviewsResponse>(`/api/reviews${qs}`);
}

// ─── Leaderboard ─────────────────────────────────────────────────────────

export async function getLeaderboard() {
  return apiFetch<LeaderboardResponse>('/api/leaderboard?limit=10');
}

// ─── Settings: API key ────────────────────────────────────────────────────

export async function getApiKey() {
  return apiFetch<GetApiKeyResponse>('/api/settings/api-key');
}

export async function putApiKey(apiKey: string) {
  return apiFetch<PutApiKeyResponse>('/api/settings/api-key', {
    method: 'PUT',
    body: JSON.stringify({ apiKey }),
  });
}

export async function deleteApiKey() {
  return apiFetch<DeleteApiKeyResponse>('/api/settings/api-key', {
    method: 'DELETE',
  });
}

// ─── Settings: key-value store ────────────────────────────────────────────

export async function getSettings() {
  return apiFetch<SettingsResponse>('/api/settings');
}

export async function putSetting(key: string, value: string) {
  return apiFetch<PutSettingResponse>(`/api/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}
