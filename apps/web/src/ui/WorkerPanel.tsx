import { useState } from 'react';
import { useRestaurantState } from '../App';
import { store } from '../state/store';
import type { Worker } from '@kitchen-rush/shared/domain';
import { xpToLevel } from '@kitchen-rush/shared/domain';

/**
 * WorkerPanel — collapsible right-side panel listing all workers.
 *
 * Each row shows:
 *   - Portrait placeholder (rect until Canvas SWE assets load)
 *   - Name
 *   - Level (derived from XP via xpToLevel — design §4.2)
 *   - Mood bar (no numeric value, just a visual bar — design §4.3)
 *   - Station
 *
 * Click a worker row → opens CoachingModal for that worker.
 */

function stationLabel(station: string): string {
  const map: Record<string, string> = {
    grill: 'Grill',
    fryer: 'Fryer',
    prep: 'Prep',
    drink: 'Drinks',
    dessert: 'Desserts',
    assembly: 'Assembly',
    floor: 'Floor',
  };
  return map[station] ?? station;
}

function moodBarColor(mood: number): string {
  if (mood >= 70) return 'bg-green-400';
  if (mood >= 40) return 'bg-yellow-400';
  return 'bg-red-400';
}

function WorkerRow({ worker }: { worker: Worker }) {
  const level = xpToLevel(worker.xp);

  function handleClick() {
    store.openCoaching(worker.id);
  }

  return (
    <button
      onClick={handleClick}
      className="
        w-full flex items-center gap-3 px-3 py-2.5
        hover:bg-beach-sand/40 active:bg-beach-sand/60
        rounded-xl transition-colors text-left group
      "
      aria-label={`Coach ${worker.name}`}
    >
      {/* Portrait placeholder — emoji until sprite assets load */}
      <div className="w-9 h-9 rounded-lg bg-beach-sand/70 flex-shrink-0 flex items-center justify-center text-lg select-none">
        🧑‍🍳
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-sm font-medium text-cozy-dim truncate">{worker.name}</span>
          <span className="text-xs text-cozy-dim/50 flex-shrink-0">L{level}</span>
        </div>

        {/* Mood bar — no numeric value shown */}
        <div className="mt-1 h-1 w-full rounded-full bg-beach-sand/60 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${moodBarColor(worker.mood)}`}
            style={{ width: `${worker.mood}%` }}
          />
        </div>

        <div className="mt-0.5 text-xs text-cozy-dim/40">{stationLabel(worker.station)}</div>
      </div>

      {/* Chevron hint */}
      <svg
        className="w-3.5 h-3.5 text-cozy-dim/30 group-hover:text-cozy-dim/60 flex-shrink-0 transition-colors"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

export default function WorkerPanel() {
  const { state } = useRestaurantState();
  // Start collapsed on phone-sized viewports so the canvas has full width.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640;
  });
  const workers = state?.workers ?? [];

  return (
    <aside
      className={`
        flex sm:flex-col flex-row
        sm:border-l border-t sm:border-t-0 border-beach-sand/60
        bg-cozy-warm/95 backdrop-blur
        transition-all duration-200
        ${collapsed ? 'sm:w-10 h-10 sm:h-auto' : 'sm:w-52 h-auto max-h-[40vh] sm:max-h-none'}
        overflow-hidden flex-shrink-0
      `}
    >
      {/* Collapse toggle — chevron on tablet+, "Team" pill on phone */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="
          flex items-center justify-center sm:h-10 h-10 sm:w-auto flex-shrink-0
          gap-1 px-3 sm:px-0
          text-cozy-dim/60 hover:text-cozy-dim
          hover:bg-beach-sand/40 active:bg-beach-sand/60 transition-colors
        "
        aria-label={collapsed ? 'Expand team panel' : 'Collapse team panel'}
      >
        <span className="sm:hidden text-sm font-medium">
          👥 Team ({workers.length})
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${collapsed ? 'sm:rotate-180 -rotate-90' : 'rotate-90 sm:rotate-0'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="flex-1 flex flex-col min-w-0 sm:min-w-[208px]">
          <div className="px-3 pb-1 pt-1 hidden sm:block">
            <h2 className="text-xs font-semibold text-cozy-dim/50 uppercase tracking-wider">
              Team
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto px-1 pb-3 space-y-0.5">
            {workers.length === 0 ? (
              <p className="text-xs text-cozy-dim/40 px-3 py-4 text-center">
                No workers yet
              </p>
            ) : (
              workers.map((w) => <WorkerRow key={w.id} worker={w} />)
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
