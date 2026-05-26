import { useState, useEffect, useRef, useCallback } from 'react';
import { getState } from '../api/endpoints';
import type { RestaurantState } from '@kitchen-rush/shared/domain';

/**
 * usePollingState — polls GET /api/restaurant/state with ETag support.
 *
 * Poll rate:
 *   - 1 Hz (1000 ms) while the day is running (open hours, unpaused)
 *   - 0.2 Hz (5000 ms) when is_paused=1 OR in_game_minute is in quiet hours
 *     (5 AM–8 AM = minutes 300–480, per design §1)
 *
 * Uses setTimeout chain (never setInterval) to avoid overlapping requests.
 * Pauses polling when the tab is hidden.
 * Returns null on 304; keeps the prior state in that case.
 *
 * Architecture §4.2
 */

const QUIET_HOUR_START = 300; // 5:00 AM in in-game minutes
const QUIET_HOUR_END   = 480; // 8:00 AM in in-game minutes

function isQuietHours(minute: number): boolean {
  return minute >= QUIET_HOUR_START && minute < QUIET_HOUR_END;
}

function pollInterval(state: RestaurantState | null): number {
  if (!state) return 1000;
  if (state.restaurant.is_paused) return 5000;
  if (isQuietHours(state.restaurant.in_game_minute)) return 5000;
  return 1000;
}

interface UsePollingStateResult {
  state: RestaurantState | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePollingState(enabled: boolean): UsePollingStateResult {
  const [restaurantState, setRestaurantState] = useState<RestaurantState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const etagRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const scheduleNext = useCallback(
    (interval: number, doFetch: () => void) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(doFetch, interval);
    },
    [],
  );

  const doFetch = useCallback(async () => {
    // Pause when tab is hidden
    if (document.visibilityState !== 'visible') {
      scheduleNext(2000, doFetch);
      return;
    }

    try {
      const result = await getState({ etag: etagRef.current });

      if (!mountedRef.current) return;

      if (result === null) {
        // 304 Not Modified — keep prior state, schedule next poll
        setRestaurantState((prev) => {
          const interval = pollInterval(prev);
          scheduleNext(interval, doFetch);
          return prev;
        });
        return;
      }

      setRestaurantState(result);
      setError(null);
      setLoading(false);

      const interval = pollInterval(result);
      scheduleNext(interval, doFetch);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Poll failed');
      setLoading(false);
      // Retry in 5s on error
      scheduleNext(5000, doFetch);
    }
  }, [scheduleNext]);

  // Start/stop polling based on `enabled`
  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    setLoading(true);
    doFetch();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, doFetch]);

  // Pause polling when tab goes hidden; resume when it becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        // Cancel any pending slow timer and re-poll immediately
        if (timerRef.current) clearTimeout(timerRef.current);
        doFetch();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, doFetch]);

  // Track unmount to avoid state updates on an unmounted component
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    doFetch();
  }, [doFetch]);

  return { state: restaurantState, loading, error, refresh };
}
