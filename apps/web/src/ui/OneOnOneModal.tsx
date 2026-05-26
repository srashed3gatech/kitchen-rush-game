import { useState } from 'react';
import { useStore, store } from '../state/store';
import { useRestaurantState } from '../App';
import { oneOnOne } from '../api/endpoints';
import type { CoachingSession } from '@kitchen-rush/shared/domain';

/**
 * OneOnOneModal — quiet-hours conversation (design §4.4).
 *
 * Three conversation choices; on click, POSTs to /api/workers/:id/one-on-one
 * and displays the worker's reply (from server response).
 *
 * Worker reply may be Claude-generated (Opus 4.7) or a template fallback.
 * Each conversation: +mood, +XP (per design §4.4 table).
 */

const CHOICES: { num: 1 | 2 | 3; label: string; hint: string }[] = [
  {
    num: 1,
    label: 'Tell me what happened today.',
    hint: 'Let them share. +mood, +XP',
  },
  {
    num: 2,
    label: "Let's go through it together.",
    hint: 'Work through it. +XP boost',
  },
  {
    num: 3,
    label: "You're doing better than you think.",
    hint: 'Encouragement. +mood, no XP',
  },
];

export default function OneOnOneModal() {
  const uiState = useStore();
  const { state: restaurantState } = useRestaurantState();

  const open = uiState.openModal === 'one-on-one';
  const workerId = uiState.oneOnOneTargetId;

  const [session, setSession] = useState<CoachingSession | null>(null);
  const [submitting, setSubmitting] = useState<1 | 2 | 3 | null>(null);
  const [error, setError] = useState<string | null>(null);

  const worker = restaurantState?.workers.find((w) => w.id === workerId) ?? null;

  async function handleChoice(choice: 1 | 2 | 3) {
    if (!workerId || submitting) return;
    setSubmitting(choice);
    setError(null);
    try {
      const res = await oneOnOne(workerId, choice);
      if (res) setSession(res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach server.');
    } finally {
      setSubmitting(null);
    }
  }

  function handleClose() {
    setSession(null);
    setError(null);
    store.closeModal();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-dim/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="
          bg-cozy-warm rounded-2xl shadow-xl border border-beach-sand/60
          p-6 w-96 max-w-[92vw]
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-cozy-dim text-base">
              Chat with {worker?.name ?? 'your worker'}
            </h2>
            <p className="text-xs text-cozy-dim/50 mt-0.5">Quiet hours one-on-one</p>
          </div>
          <button
            onClick={handleClose}
            className="text-cozy-dim/40 hover:text-cozy-dim/70 p-1 rounded-lg"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Worker reply (shown after a choice is made) */}
        {session?.worker_response && (
          <div className="mb-4 p-3 bg-beach-sand/40 rounded-xl">
            <div className="flex items-start gap-2">
              <span className="text-xl leading-none flex-shrink-0">🧑‍🍳</span>
              <p className="text-sm text-cozy-dim leading-relaxed italic">
                "{session.worker_response}"
              </p>
            </div>
            {session.claude_used === 1 && (
              <p className="text-[10px] text-purple-500 mt-1.5 text-right">✨ Claude reply</p>
            )}
          </div>
        )}

        {error && (
          <p className="mb-3 text-sm text-red-600 text-center">{error}</p>
        )}

        {/* Choices — hidden after one is picked */}
        {!session && (
          <div className="space-y-2">
            {CHOICES.map((choice) => (
              <button
                key={choice.num}
                onClick={() => handleChoice(choice.num)}
                disabled={!!submitting}
                className={`
                  w-full text-left px-4 py-3 rounded-xl border transition-all
                  ${submitting === choice.num
                    ? 'border-beach-ocean bg-beach-ocean/10 animate-pulse'
                    : 'border-beach-sand hover:border-beach-ocean/40 hover:bg-beach-sand/40 bg-white/50'
                  }
                  disabled:opacity-60 disabled:cursor-not-allowed
                `}
              >
                <p className="text-sm font-medium text-cozy-dim">"{choice.label}"</p>
                <p className="text-xs text-cozy-dim/40 mt-0.5">{choice.hint}</p>
              </button>
            ))}
          </div>
        )}

        {/* Done — show close after reply received */}
        {session && (
          <div>
            {(session.mood_delta !== 0 || session.xp_delta !== 0) && (
              <p className="text-xs text-cozy-dim/50 text-center mb-3">
                {session.mood_delta > 0 && `Mood +${session.mood_delta} `}
                {session.xp_delta > 0 && `XP +${session.xp_delta}`}
              </p>
            )}
            <button
              onClick={handleClose}
              className="
                w-full py-2.5 rounded-xl font-medium text-sm
                bg-beach-sand hover:bg-beach-sand/70
                text-cozy-dim transition-colors
              "
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
