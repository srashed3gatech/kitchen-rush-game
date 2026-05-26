import { useState, useEffect, useRef } from 'react';
import { useStore, store } from '../state/store';
import { useRestaurantState } from '../App';
import { coachPreset } from '../api/endpoints';
import { playSfx } from '../audio/sfx';
import { xpToLevel } from '@kitchen-rush/shared/domain';
import type { PresetKey } from '@kitchen-rush/shared/domain';

/**
 * CoachingModal — radial menu with the 6 preset coaching phrases (design §4.3).
 *
 * Rules:
 *   - Cooldown UI: faded button + "Just praised — let it land 🌱" tooltip on hover.
 *     NO numeric countdown (design §4.3, critique §2.1).
 *   - Posts POST /api/workers/:id/coach with { presetKey }
 *   - Zero Claude calls — preset coaching is server-side only (critique §1.5)
 */

interface Preset {
  key: PresetKey;
  label: string;
  summary: string;
  cooldownMs: number;
  emoji: string;
}

const PRESETS: Preset[] = [
  {
    key: 'praise',
    label: 'Nice work, keep it up!',
    summary: 'Friendly praise',
    cooldownMs: 8_000,
    emoji: '⭐',
  },
  {
    key: 'take_time',
    label: 'Take your time.',
    summary: 'Reassurance',
    cooldownMs: 8_000,
    emoji: '🌊',
  },
  {
    key: 'try_again',
    label: 'Try the recipe again.',
    summary: 'Gentle correction',
    cooldownMs: 12_000,
    emoji: '🔁',
  },
  {
    key: 'watch_heat',
    label: "Watch your station's heat.",
    summary: 'Technique tip',
    cooldownMs: 12_000,
    emoji: '🔥',
  },
  {
    key: 'check_ticket',
    label: 'Check your order ticket.',
    summary: 'Focus reminder',
    cooldownMs: 12_000,
    emoji: '🎫',
  },
  {
    key: 'cleanup_when_can',
    label: 'Cleanup when you can.',
    summary: 'Behavior nudge',
    cooldownMs: 15_000,
    emoji: '🧹',
  },
];

export default function CoachingModal() {
  const uiState = useStore();
  const { state: restaurantState } = useRestaurantState();

  const open = uiState.openModal === 'coaching';
  const workerId = uiState.coachingTargetId;

  // Per-phrase cooldown end times (ms since epoch)
  const [cooldowns, setCooldowns] = useState<Partial<Record<PresetKey, number>>>({});
  const [submitting, setSubmitting] = useState<PresetKey | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find worker from restaurant state
  const worker = restaurantState?.workers.find((w) => w.id === workerId) ?? null;
  const level = worker ? xpToLevel(worker.xp) : null;

  function isOnCooldown(key: PresetKey): boolean {
    const end = cooldowns[key];
    return end != null && Date.now() < end;
  }

  async function handlePreset(preset: Preset) {
    if (!workerId) return;
    if (isOnCooldown(preset.key)) return;
    if (submitting) return;

    setSubmitting(preset.key);
    setFeedback(null);
    try {
      await coachPreset(workerId, preset.key);
      playSfx('praise');

      // Notify Scene so the speech bubble uses the real preset (not 'praise')
      window.dispatchEvent(
        new CustomEvent('kr:coach', { detail: { workerId, presetKey: preset.key } }),
      );

      // Set cooldown
      setCooldowns((prev) => ({
        ...prev,
        [preset.key]: Date.now() + preset.cooldownMs,
      }));

      setFeedback(`${preset.summary} — ${worker?.name ?? 'worker'} heard you.`);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback('Could not reach the server. Try again.');
    } finally {
      setSubmitting(null);
    }
  }

  // Clear cooldowns when we open for a different worker
  useEffect(() => {
    if (open) {
      setCooldowns({});
      setFeedback(null);
    }
  }, [workerId, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-dim/30 backdrop-blur-sm"
      onClick={() => store.closeModal()}
    >
      <div
        className="
          bg-cozy-warm rounded-2xl shadow-xl border border-beach-sand/60
          p-6 w-80 max-w-[92vw]
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-cozy-dim text-base">
              Coach {worker?.name ?? 'Worker'}
            </h2>
            {worker && (
              <p className="text-xs text-cozy-dim/50 mt-0.5">
                Level {level} · Mood {worker.mood}/100
              </p>
            )}
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

        {/* Feedback line */}
        {feedback && (
          <p className="mb-3 text-xs text-beach-ocean text-center animate-pulse">{feedback}</p>
        )}

        {/* 6 preset coaching phrases in a 2-col grid */}
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => {
            const onCooldown = isOnCooldown(preset.key);
            const isSubmitting = submitting === preset.key;

            return (
              <div key={preset.key} className="relative group">
                <button
                  onClick={() => handlePreset(preset)}
                  disabled={onCooldown || !!submitting}
                  className={`
                    w-full flex flex-col items-center gap-1 px-2 py-3
                    rounded-xl border text-center
                    transition-all duration-150
                    ${onCooldown
                      ? 'opacity-40 cursor-default border-beach-sand/40 bg-white/30'
                      : 'border-beach-sand hover:bg-beach-sand/40 hover:border-beach-ocean/30 active:bg-beach-sand/60 bg-white/50 cursor-pointer'
                    }
                    ${isSubmitting ? 'animate-pulse' : ''}
                  `}
                >
                  <span className="text-xl leading-none">{preset.emoji}</span>
                  <span className="text-xs font-medium text-cozy-dim leading-snug">
                    "{preset.label}"
                  </span>
                  <span className="text-[10px] text-cozy-dim/50">{preset.summary}</span>
                </button>

                {/* Cooldown tooltip — no numeric countdown */}
                {onCooldown && (
                  <div className="
                    absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1
                    bg-cozy-dim/80 text-white text-[10px] rounded-lg
                    whitespace-nowrap pointer-events-none
                    opacity-0 group-hover:opacity-100 transition-opacity
                    z-10
                  ">
                    Just praised — let it land 🌱
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-cozy-dim/80" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
