import { useContext, useEffect, useRef, useState } from 'react';
import { useRestaurantState, AuthContext } from '../App';
import { store } from '../state/store';
import { pauseDay, startDay, clean } from '../api/endpoints';
import { playSfx } from '../audio/sfx';

/**
 * TopBar — sticky top-of-screen HUD for iPad-toting kids.
 *
 * Design goals (per UXR pass #2):
 *   - ICONS-ONLY action buttons (text labels read as "noise" to kids).
 *   - Emoji icons render reliably across iPad Safari versions and read as
 *     friendly + kid-coded at a glance.
 *   - Hit targets ≥ 44×44 (Apple HIG) — these are little fingers.
 *   - Status chips bump to 16px so the dad next to the kid can read them too.
 *
 * Hierarchy (left → right):
 *   - Branding + Day + clock                              (orientation)
 *   - Cash + 🧼 cleanliness + 🍽 diner-log                (status chips)
 *   - Action group: 🧹 Clean · 👤+ Hire · 📖 Menu ·
 *                   ⭐ Reviews · 🏆 Top10 · 📊 Stats · ⏸/▶️ Pause
 *   - Separator
 *   - Chrome group: ❓ Help · ⚙️ Settings · 🚪 Logout(confirm)
 *
 * Preserved from prior version:
 *   - Cash-delta floating "+$N" animation on cash increase (juice).
 *   - Diner Log counter with bounce on each new review (juice).
 *   - Logout 2-tap confirmation pattern.
 */

function inGameMinuteToClockString(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function cleanlinessColor(c: number): string {
  if (c >= 70) return 'text-green-700';
  if (c >= 40) return 'text-yellow-700';
  return 'text-red-600';
}

interface FloatingDelta {
  id: number;
  amount: number;
  spawnedAt: number;
}

export default function TopBar() {
  const { state, refresh } = useRestaurantState();
  const { logout, user } = useContext(AuthContext);
  const [cleaning, setCleaning] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // Cash-delta floats (juice #1)
  const lastCashRef = useRef<number | null>(null);
  const [floatingDeltas, setFloatingDeltas] = useState<FloatingDelta[]>([]);
  const [cashPulse, setCashPulse] = useState(false);

  // Diner Log counter (juice #3) — derived from review IDs growth
  const lastReviewIdsRef = useRef<Set<number>>(new Set());
  const [dinerCount, setDinerCount] = useState(0);
  const [dinerBounce, setDinerBounce] = useState(false);
  const lastDayRef = useRef<number | null>(null);

  const r = state?.restaurant ?? null;
  const clock = r ? inGameMinuteToClockString(r.in_game_minute) : '--:--';
  const cash = r?.cash ?? null;
  const day = r?.day_number ?? null;
  const paused = r?.is_paused === 1;
  const cleanliness = r?.cleanliness ?? null;

  // Watch cash for +N deltas
  useEffect(() => {
    if (cash == null) return;
    const prev = lastCashRef.current;
    if (prev != null && cash > prev) {
      const delta = cash - prev;
      setFloatingDeltas((list) => [
        ...list,
        { id: Date.now() + Math.random(), amount: delta, spawnedAt: Date.now() },
      ]);
      setCashPulse(true);
      setTimeout(() => setCashPulse(false), 500);
      playSfx('coin');
    }
    lastCashRef.current = cash;
  }, [cash]);

  // Watch last_review_ids for new reviews (diner count)
  useEffect(() => {
    const ids = state?.last_review_ids ?? [];
    if (day !== lastDayRef.current) {
      lastReviewIdsRef.current = new Set(ids);
      setDinerCount(0);
      lastDayRef.current = day;
      return;
    }
    let added = 0;
    const seen = lastReviewIdsRef.current;
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        added++;
      }
    }
    if (added > 0) {
      setDinerCount((c) => c + added);
      setDinerBounce(true);
      setTimeout(() => setDinerBounce(false), 450);
      playSfx('bell');
    }
  }, [state?.last_review_ids, day]);

  // Garbage-collect old floats
  useEffect(() => {
    if (floatingDeltas.length === 0) return;
    const t = setTimeout(() => {
      const now = Date.now();
      setFloatingDeltas((list) => list.filter((f) => now - f.spawnedAt < 1500));
    }, 1600);
    return () => clearTimeout(t);
  }, [floatingDeltas]);

  async function handlePauseToggle() {
    if (!r) return;
    try {
      if (paused) {
        await startDay();
      } else {
        await pauseDay();
      }
      refresh();
    } catch {
      // ignore
    }
  }

  async function handleClean() {
    if (cleaning) return;
    setCleaning(true);
    try {
      await clean('all');
      refresh();
    } catch {
      // ignore
    } finally {
      setCleaning(false);
    }
  }

  function handleLogoutClick() {
    if (!confirmingLogout) {
      setConfirmingLogout(true);
      setTimeout(() => setConfirmingLogout(false), 3000);
      return;
    }
    logout();
  }

  // ── Sub-components ─────────────────────────────────────────────────────

  /**
   * EmojiBtn — icon-only, kid-sized (≥44×44), no text label.
   * Uses a span around the emoji so we can scale it without breaking the
   * button's hit target.
   */
  const EmojiBtn = ({
    emoji,
    title,
    ariaLabel,
    onClick,
    disabled,
    active,
  }: {
    emoji: string;
    title: string;
    ariaLabel: string;
    onClick: () => void;
    disabled?: boolean;
    active?: boolean;
  }) => (
    <button
      onClick={() => {
        playSfx('click');
        onClick();
      }}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`
        min-w-[44px] min-h-[44px] flex items-center justify-center
        rounded-xl text-2xl leading-none select-none
        transition-all duration-100
        ${active
          ? 'bg-beach-sunset/25 ring-2 ring-beach-sunset/40 scale-105'
          : 'hover:bg-beach-sand/60 active:bg-beach-sand/80 active:scale-95'}
        disabled:opacity-50 disabled:cursor-not-allowed
      `}
    >
      <span aria-hidden="true">{emoji}</span>
    </button>
  );

  return (
    <header className="
      sticky top-0 z-40
      flex items-center justify-between gap-1
      px-2 sm:px-4 h-14 sm:h-16
      bg-cozy-warm/95 backdrop-blur
      border-b border-beach-sand/60
      shadow-sm
    ">
      {/* ── Left: branding + day info ──────────────────────────────────── */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
        <span className="font-bold text-beach-ocean text-base tracking-tight hidden md:inline">
          Kitchen Rush
        </span>
        <span className="text-sm sm:text-base text-cozy-dim/70 tabular-nums font-medium">
          {day != null ? `D${day}` : '—'}
        </span>
        <span className="text-sm sm:text-base text-cozy-dim/80 font-mono tabular-nums">{clock}</span>
        {user && (
          <span className="text-xs text-cozy-dim/40 hidden lg:inline">· {user.display_name}</span>
        )}
      </div>

      {/* ── Center: status chips ──────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
        {/* Cash chip with delta animation */}
        <div className="relative">
          <span
            className={`
              inline-block text-sm sm:text-base font-semibold tabular-nums
              px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg
              transition-colors
              ${cashPulse ? 'bg-yellow-200/80 text-yellow-900' : 'text-cozy-dim'}
            `}
          >
            {cash != null ? `$${cash}` : '—'}
          </span>
          {/* Floating deltas */}
          <div className="pointer-events-none absolute inset-x-0 -top-1 flex justify-center">
            {floatingDeltas.map((f) => (
              <span
                key={f.id}
                className="absolute text-green-600 font-bold text-base tabular-nums animate-floatUp"
                style={{ animationDuration: '1500ms' }}
              >
                +${f.amount}
              </span>
            ))}
          </div>
        </div>

        {/* Cleanliness */}
        {cleanliness != null && (
          <span
            className={`text-base tabular-nums font-medium ${cleanlinessColor(cleanliness)} hidden sm:inline`}
            title="Cleanliness — falls during open hours, tap 🧹 to refresh"
          >
            🧼 {cleanliness}
          </span>
        )}

        {/* Diner Log */}
        {state && (
          <span
            className={`
              text-base tabular-nums text-cozy-dim/75 font-medium hidden sm:inline
              transition-transform
              ${dinerBounce ? 'scale-125' : 'scale-100'}
            `}
            title="Customers served today"
          >
            🍽 {dinerCount} today
          </span>
        )}
      </div>

      {/* ── Right: actions (scroll horizontally if overflowing) ──────────── */}
      <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0">
        {/* Action group — the player's verbs */}
        <EmojiBtn
          emoji="🧹"
          title="Clean restaurant"
          ariaLabel="Clean restaurant"
          onClick={handleClean}
          disabled={cleaning}
        />
        <EmojiBtn
          emoji="👤➕"
          title="Hire a cook"
          ariaLabel="Open hire panel"
          onClick={() => store.openModal('hire')}
        />
        <EmojiBtn
          emoji="📖"
          title="Menu & recipes"
          ariaLabel="Open menu"
          onClick={() => store.openModal('menu')}
        />
        <EmojiBtn
          emoji="⭐"
          title="Customer reviews"
          ariaLabel="Open reviews"
          onClick={() => store.openModal('reviews')}
        />
        {/* Top10 — hidden on phone (kids don't need leaderboard at a glance) */}
        <div className="hidden sm:contents">
          <EmojiBtn
            emoji="🏆"
            title="Top 10 leaderboard"
            ariaLabel="Open leaderboard"
            onClick={() => store.openModal('leaderboard')}
          />
        </div>
        <EmojiBtn
          emoji="📊"
          title="Shop stats — your team & tables"
          ariaLabel="Open stats panel"
          onClick={() => store.openModal('stats')}
        />
        <EmojiBtn
          emoji={paused ? '▶️' : '⏸'}
          title={paused ? 'Resume day' : 'Pause day'}
          ariaLabel={paused ? 'Resume day' : 'Pause day'}
          onClick={handlePauseToggle}
          active={paused}
        />

        {/* Visual separator between action and chrome groups */}
        <div className="w-px h-8 sm:h-10 bg-beach-sand/70 mx-1 sm:mx-2 flex-shrink-0" aria-hidden="true" />

        {/* Chrome group — Help hidden on phone (Welcome auto-opens once anyway) */}
        <div className="hidden sm:contents">
          <EmojiBtn
            emoji="❓"
            title="What is this game? (Help)"
            ariaLabel="Open help"
            onClick={() => store.openModal('welcome')}
          />
        </div>
        <EmojiBtn
          emoji="⚙️"
          title="Settings"
          ariaLabel="Settings"
          onClick={() => store.openModal('settings')}
        />

        {/* Logout — keeps the 2-tap "Sure?" confirmation pattern */}
        <button
          onClick={handleLogoutClick}
          title={confirmingLogout ? 'Tap again to confirm' : 'Logout'}
          aria-label={confirmingLogout ? 'Confirm logout' : 'Logout'}
          className={`
            min-w-[44px] min-h-[44px] flex items-center justify-center
            rounded-xl text-2xl leading-none select-none
            transition-all duration-100 active:scale-95
            ${confirmingLogout
              ? 'bg-red-100 ring-2 ring-red-300 animate-pulse'
              : 'hover:bg-beach-sand/60 active:bg-beach-sand/80'}
          `}
        >
          {confirmingLogout ? (
            <span className="text-sm font-semibold text-red-700">Sure?</span>
          ) : (
            <span aria-hidden="true">🚪</span>
          )}
        </button>
      </div>
    </header>
  );
}
