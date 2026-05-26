import { useEffect, useState } from 'react';
import { useStore, store } from '../state/store';
import { listReviews } from '../api/endpoints';
import type { Review } from '@kitchen-rush/shared/domain';

/**
 * ReviewsPanel — shows recent customer reviews.
 *
 * Each review shows:
 *   - Customer name + archetype emoji (from orders denormalized data in the review endpoint)
 *   - raw_comment
 *   - 6 scores as small bars (0–100 scale)
 *   - improvement_hint
 *   - claude_used badge
 *
 * Architecture §3 endpoint #18. Server returns newest first.
 */

const ARCHETYPE_EMOJI: Record<string, string> = {
  beach_bum: '🏄',
  tourist_family: '👨‍👩‍👧',
  date_couple: '💑',
  foodie_critic: '🧐',
  night_owl: '🦉',
  hangry_surfer: '🌊',
};

const ARCHETYPE_LABEL: Record<string, string> = {
  beach_bum: 'Beach Bum',
  tourist_family: 'Tourist Family',
  date_couple: 'Date Couple',
  foodie_critic: 'Foodie Critic',
  night_owl: 'Night Owl',
  hangry_surfer: 'Hangry Surfer',
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? 'bg-green-400' : value >= 40 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-cozy-dim/50 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-beach-sand/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] text-cozy-dim/40 w-6 text-right tabular-nums">{value}</span>
    </div>
  );
}

interface ReviewWithMeta extends Review {
  // The backend endpoint enriches reviews with customer info from the joined order
  customer_display_name?: string;
  customer_archetype?: string;
}

function ReviewCard({ review }: { review: ReviewWithMeta }) {
  const archetype = review.customer_archetype ?? 'beach_bum';
  const emoji = ARCHETYPE_EMOJI[archetype] ?? '👤';
  const archetypeLabel = ARCHETYPE_LABEL[archetype] ?? archetype;
  const name = review.customer_display_name ?? 'Customer';

  const date = new Date(review.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-white/60 rounded-xl border border-beach-sand/50 p-4 space-y-3">
      {/* Customer header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">{emoji}</span>
            <span className="text-sm font-medium text-cozy-dim">{name}</span>
            <span className="text-xs text-cozy-dim/40">{archetypeLabel}</span>
          </div>
          <p className="text-xs text-cozy-dim/30 mt-0.5">{date}</p>
        </div>
        {review.claude_used === 1 && (
          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 font-medium">
            AI scored
          </span>
        )}
      </div>

      {/* Raw comment */}
      <p className="text-sm text-cozy-dim/80 leading-relaxed italic">"{review.raw_comment}"</p>

      {/* Score bars */}
      <div className="space-y-1.5">
        <ScoreBar label="Taste" value={review.score_taste} />
        <ScoreBar label="Cleanliness" value={review.score_cleanliness} />
        <ScoreBar label="Seating" value={review.score_seating} />
        <ScoreBar label="Service" value={review.score_service} />
        <ScoreBar label="Vibe" value={review.score_vibe} />
        <ScoreBar label="Timing" value={review.score_timing} />
      </div>

      {/* Improvement hint */}
      {review.improvement_hint && (
        <p className="text-xs text-beach-ocean bg-beach-ocean/10 rounded-lg px-3 py-2">
          💡 {review.improvement_hint}
        </p>
      )}
    </div>
  );
}

export default function ReviewsPanel() {
  const uiState = useStore();
  const open = uiState.openModal === 'reviews';

  const [reviews, setReviews] = useState<ReviewWithMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    listReviews({ limit: 20 })
      .then((res) => {
        if (res) setReviews(res.reviews as ReviewWithMeta[]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reviews'))
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
          w-full sm:w-[480px] max-h-[85vh] flex flex-col
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <h2 className="font-semibold text-cozy-dim text-base">Customer Reviews</h2>
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
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
          {loading && (
            <p className="text-sm text-cozy-dim/40 text-center py-8 animate-pulse">
              Loading reviews…
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center py-4">{error}</p>
          )}
          {!loading && !error && reviews.length === 0 && (
            <p className="text-sm text-cozy-dim/40 text-center py-8">
              No reviews yet. Your first customers will share their thoughts tonight.
            </p>
          )}
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
