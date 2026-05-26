import { useEffect, useState } from 'react';
import { useStore, store } from '../state/store';
import { getLeaderboard } from '../api/endpoints';
import type { LeaderboardRow } from '@kitchen-rush/shared/domain';

/**
 * LeaderboardPanel — top 10 only (design §10.5).
 *
 * Rules:
 *   - Sorted by rolling_score DESC (server side)
 *   - Top 10 only — celebration, not a ladder
 *   - NEVER shows "you are rank #N" — design §10.5
 *   - NEVER highlights the current user's row
 *   - rolling_score is already × 1000 from the server
 */

export default function LeaderboardPanel() {
  const uiState = useStore();
  const open = uiState.openModal === 'leaderboard';

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    getLeaderboard()
      .then((res) => { if (res) setRows(res.rows.slice(0, 10)); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-cozy-dim/30 backdrop-blur-sm"
      onClick={() => store.closeModal()}
    >
      <div
        className="
          bg-cozy-warm rounded-t-2xl sm:rounded-2xl shadow-xl border border-beach-sand/60
          w-full sm:w-[420px] max-h-[75vh] flex flex-col
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-cozy-dim text-base">🏆 Leaderboard</h2>
            <p className="text-xs text-cozy-dim/50 mt-0.5">Top 10 beachfront shops</p>
          </div>
          <button
            onClick={() => store.closeModal()}
            className="text-cozy-dim/40 hover:text-cozy-dim/70 p-1 rounded-lg"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading && (
            <p className="text-sm text-cozy-dim/40 text-center py-8 animate-pulse">Loading…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center py-4">{error}</p>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-cozy-dim/40 text-center py-8">
              No scores yet — play a full day to appear here.
            </p>
          )}

          {rows.length > 0 && (
            <div className="space-y-1.5">
              {rows.map((row, idx) => {
                const medal =
                  idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;

                return (
                  // No special highlight for current user — design §10.5
                  <div
                    key={row.restaurant_id}
                    className="
                      flex items-center gap-3 px-3 py-2.5
                      rounded-xl bg-white/50 border border-beach-sand/40
                    "
                  >
                    {/* Rank */}
                    <div className="w-7 flex-shrink-0 text-center">
                      {medal ? (
                        <span className="text-base leading-none">{medal}</span>
                      ) : (
                        <span className="text-sm font-medium text-cozy-dim/40 tabular-nums">
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    {/* Name info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-cozy-dim truncate">
                        {row.restaurant_name}
                      </p>
                      <p className="text-xs text-cozy-dim/50 truncate">
                        {row.owner_display_name}
                      </p>
                    </div>

                    {/* Score — already × 1000 from server */}
                    <div className="flex-shrink-0">
                      <span className="text-sm font-semibold text-beach-ocean tabular-nums">
                        {Math.round(row.rolling_score)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
