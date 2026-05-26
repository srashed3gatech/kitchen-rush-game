import { useStore, store } from '../state/store';
import { startDay } from '../api/endpoints';
import type { DaySummary } from '@kitchen-rush/shared/api';

/**
 * DaySummaryModal — appears at 5 AM (quiet hours start).
 *
 * Shows:
 *   - Customers served, sales, avg score per dimension (six small radial gauges 0–100)
 *   - Tips, mistakes
 *   - "Open Tomorrow" button — manual only, NEVER auto-advance (design §9)
 *
 * Data: daySummaryData from the store (set by App on day-end event).
 *
 * Wiring note: The actual day-end detection and store.setDaySummary() call
 * will be refined once the full server day-end payload flow is in place.
 * The modal renders whatever is placed in store.daySummaryData.
 */

function RadialGauge({ label, value }: { label: string; value: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * (value / 100);
  const empty = circumference - filled;

  const color =
    value >= 70 ? '#4ade80' : // green-400
    value >= 40 ? '#facc15' : // yellow-400
    '#f87171'; // red-400

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-12 h-12">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
          {/* Track */}
          <circle cx="22" cy="22" r={radius} strokeWidth="4" stroke="#f5e8c7" fill="none" />
          {/* Progress */}
          <circle
            cx="22" cy="22" r={radius}
            strokeWidth="4"
            stroke={color}
            fill="none"
            strokeDasharray={`${filled} ${empty}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-cozy-dim">
          {value}
        </span>
      </div>
      <span className="text-[10px] text-cozy-dim/50 text-center leading-tight">{label}</span>
    </div>
  );
}

export default function DaySummaryModal() {
  const uiState = useStore();
  const open = uiState.openModal === 'day-summary';
  const data = uiState.daySummaryData as DaySummary | null;

  async function handleOpenTomorrow() {
    try {
      await startDay();
    } catch {
      // ignore; next poll will reflect server truth
    }
    store.closeModal();
  }

  if (!open) return null;

  // Derive rounded avg scores from DaySummary.avg_scores (SixScores)
  const avgScores = data?.avg_scores;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-dim/40 backdrop-blur-sm">
      <div
        className="
          bg-cozy-warm rounded-2xl shadow-xl border border-beach-sand/60
          p-6 w-[420px] max-w-[92vw] max-h-[90vh] overflow-y-auto
        "
      >
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🌅</div>
          <h2 className="font-bold text-cozy-dim text-lg">
            Day {data?.day_number ?? '—'} Done
          </h2>
          <p className="text-xs text-cozy-dim/50 mt-1">
            Quiet hours. Take your time.
          </p>
        </div>

        {/* Stats row */}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white/50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-cozy-dim tabular-nums">
                  {data.customers_served}
                </p>
                <p className="text-xs text-cozy-dim/50">Customers</p>
              </div>
              <div className="bg-white/50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-beach-ocean tabular-nums">
                  ${data.gross_sales}
                </p>
                <p className="text-xs text-cozy-dim/50">Sales</p>
              </div>
              <div className="bg-white/50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-cozy-dim tabular-nums">
                  +${data.tips_total}
                </p>
                <p className="text-xs text-cozy-dim/50">Tips</p>
              </div>
            </div>

            {/* Score gauges */}
            {avgScores && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-cozy-dim/50 uppercase tracking-wider text-center mb-3">
                  Average Scores
                </p>
                <div className="grid grid-cols-6 gap-2">
                  <RadialGauge label="Taste" value={Math.round(avgScores.taste)} />
                  <RadialGauge label="Clean" value={Math.round(avgScores.cleanliness)} />
                  <RadialGauge label="Seating" value={Math.round(avgScores.seating)} />
                  <RadialGauge label="Service" value={Math.round(avgScores.service)} />
                  <RadialGauge label="Vibe" value={Math.round(avgScores.vibe)} />
                  <RadialGauge label="Timing" value={Math.round(avgScores.timing)} />
                </div>
              </div>
            )}

            {/* Mistakes — gentle framing */}
            {data.mistakes > 0 && (
              <p className="text-xs text-cozy-dim/50 text-center mb-4">
                {data.mistakes} {data.mistakes === 1 ? 'mistake' : 'mistakes'} today — that's how you learn.
              </p>
            )}
          </>
        )}

        {/* Open Tomorrow — manual only, NEVER auto-advance (design §9) */}
        <button
          onClick={handleOpenTomorrow}
          className="
            w-full py-3 rounded-xl font-semibold text-sm
            bg-beach-ocean text-white
            hover:bg-beach-ocean/90 active:bg-beach-ocean/80
            transition-colors
          "
        >
          Open Tomorrow 🌞
        </button>

        <p className="text-xs text-cozy-dim/30 text-center mt-2">
          Take your time — the shop waits for you.
        </p>
      </div>
    </div>
  );
}
