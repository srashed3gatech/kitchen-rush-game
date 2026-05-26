import { useEffect, useState, useCallback } from 'react';
import { useStore, store } from '../state/store';
import { useRestaurantState } from '../App';
import { getHireCandidates, hireWorker } from '../api/endpoints';
import type { HireCandidate, Station } from '@kitchen-rush/shared/domain';

/**
 * HirePanel — list 3 candidates from /api/workers/candidates and let the
 * player hire one to a chosen station. Backend caps at 4 workers and refuses
 * if cash < cost.
 *
 * UI tone: no urgency, "Earn $X more" if insufficient cash (design §1.16).
 */

const STATIONS: { value: Station; label: string; emoji: string }[] = [
  { value: 'grill', label: 'Grill', emoji: '🔥' },
  { value: 'fryer', label: 'Fryer', emoji: '🍟' },
  { value: 'drink', label: 'Drinks', emoji: '🥤' },
  { value: 'dessert', label: 'Desserts', emoji: '🍦' },
  { value: 'prep', label: 'Prep', emoji: '🥗' },
  { value: 'assembly', label: 'Assembly', emoji: '🥪' },
  { value: 'floor', label: 'Floor', emoji: '🧹' },
];

function CandidateRow({
  candidate,
  cash,
  onHire,
  busy,
}: {
  candidate: HireCandidate;
  cash: number;
  onHire: (id: string, station: Station) => void;
  busy: boolean;
}) {
  const [station, setStation] = useState<Station>(candidate.suggested_station);
  const canAfford = cash >= candidate.cost;
  const shortfall = candidate.cost - cash;

  return (
    <div className="rounded-xl border border-beach-sand/60 bg-white/40 p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-beach-sand/70 flex-shrink-0 flex items-center justify-center text-xl select-none">
          🧑‍🍳
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-cozy-dim truncate">{candidate.name}</p>
          <p className="text-xs text-cozy-dim/50">Mood baseline {candidate.mood_baseline}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-semibold text-cozy-dim tabular-nums">
            ${candidate.cost}
            <span className="text-[10px] text-cozy-dim/50 font-normal"> hire</span>
          </div>
          <div className="text-[10px] text-cozy-dim/50 tabular-nums">+ $40/day wage</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <label className="text-xs text-cozy-dim/60 flex-shrink-0">Station:</label>
        <select
          value={station}
          onChange={(e) => setStation(e.target.value as Station)}
          className="
            flex-1 text-xs px-2 py-1 rounded-lg border border-beach-sand
            bg-white/80 text-cozy-dim
            focus:outline-none focus:ring-1 focus:ring-beach-ocean
          "
        >
          {STATIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.emoji} {s.label}
              {s.value === candidate.suggested_station ? ' (suggested)' : ''}
            </option>
          ))}
        </select>

        {canAfford ? (
          <button
            onClick={() => onHire(candidate.candidate_id, station)}
            disabled={busy}
            className="
              text-xs px-3 py-1.5 rounded-lg font-medium
              bg-beach-ocean text-white
              hover:bg-beach-ocean/90 disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors flex-shrink-0
            "
          >
            {busy ? '…' : 'Hire'}
          </button>
        ) : (
          <span className="text-xs text-cozy-dim/40 italic flex-shrink-0">
            Earn ${shortfall} more
          </span>
        )}
      </div>
    </div>
  );
}

export default function HirePanel() {
  const uiState = useStore();
  const { state: restaurantState, refresh } = useRestaurantState();
  const open = uiState.openModal === 'hire';

  const [candidates, setCandidates] = useState<HireCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiring, setHiring] = useState<string | null>(null);

  const cash = restaurantState?.restaurant.cash ?? 0;
  const workerCount = restaurantState?.workers.length ?? 0;
  const atCap = workerCount >= 4;

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHireCandidates();
      if (res) setCandidates(res.candidates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !atCap) fetchCandidates();
  }, [open, atCap, fetchCandidates]);

  async function handleHire(candidateId: string, station: Station) {
    setHiring(candidateId);
    setError(null);
    try {
      await hireWorker(candidateId, station);
      // Remove hired candidate from list, refresh state.
      setCandidates((prev) => prev.filter((c) => c.candidate_id !== candidateId));
      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hire failed';
      setError(msg);
      // Stale candidate cache after server restart — refetch.
      if (/not_found|expired/.test(msg)) fetchCandidates();
    } finally {
      setHiring(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-cozy-dim/30 backdrop-blur-sm"
      onClick={() => store.closeModal()}
    >
      <div
        className="
          bg-cozy-warm rounded-t-2xl sm:rounded-2xl shadow-xl border border-beach-sand/60
          w-full sm:w-[480px] max-h-[85vh] flex flex-col
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-cozy-dim text-base">Hire a Cook</h2>
            <p className="text-xs text-cozy-dim/50 mt-0.5">
              Cash on hand: ${cash} · Team: {workerCount}/4
            </p>
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

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {atCap && (
            <p className="text-sm text-cozy-dim/60 text-center py-6">
              Your team is full (4 workers). MVP cap.
            </p>
          )}

          {!atCap && loading && (
            <p className="text-sm text-cozy-dim/40 text-center py-8 animate-pulse">Loading candidates…</p>
          )}

          {!atCap && error && (
            <p className="text-sm text-red-600 text-center py-2">{error}</p>
          )}

          {!atCap && !loading && candidates.length === 0 && !error && (
            <p className="text-sm text-cozy-dim/40 text-center py-6">No candidates available.</p>
          )}

          {!atCap && !loading && candidates.map((c) => (
            <CandidateRow
              key={c.candidate_id}
              candidate={c}
              cash={cash}
              onHire={handleHire}
              busy={hiring === c.candidate_id}
            />
          ))}

          {!atCap && !loading && (
            <button
              onClick={fetchCandidates}
              className="
                w-full text-xs text-cozy-dim/60 hover:text-cozy-dim/80
                py-2 mt-2 rounded-lg hover:bg-beach-sand/30 transition-colors
              "
            >
              ↻ Refresh candidates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
