import { useEffect, useState } from 'react';
import { useStore, store } from '../state/store';
import { useRestaurantState } from '../App';
import { listMenu } from '../api/endpoints';
import { playSfx } from '../audio/sfx';
import type {
  CustomerInScene,
  Order,
  Persona,
  MenuItem,
  Recipe,
} from '@kitchen-rush/shared/domain';

/**
 * InspectCustomerModal — pure local-delight UX.
 *
 * Triggered from the canvas when a kid taps a customer. Resolves
 * customer + order via store.inspectCustomerOrderId, then offers:
 *   - A look at who the customer is + what they ordered
 *   - A status / mood readout
 *   - One of 6 deterministically-picked questions
 *   - Three big "answer" buttons that all lead to a friendly thank-you
 *     and auto-close after 1.5s.
 *
 * No server round-trip — this is a sticker-book moment, not a mechanic.
 */

const PERSONA_EMOJI: Record<Persona, string> = {
  beach_bum: '🏄',
  tourist_family: '📷',
  date_couple: '💑',
  foodie_critic: '🤓',
  night_owl: '🦉',
  hangry_surfer: '🍔',
};

const PERSONA_LABEL: Record<Persona, string> = {
  beach_bum: 'Beach Bum',
  tourist_family: 'Tourist Family',
  date_couple: 'Date Couple',
  foodie_critic: 'Foodie Critic',
  night_owl: 'Night Owl',
  hangry_surfer: 'Hangry Surfer',
};

const QUESTIONS = [
  'Do you have hot sauce? 🌶️',
  "What's your favorite drink here? 🥤",
  'Is this place always so cozy? ✨',
  'Will my food be much longer? 🤔',
  'Can I get extra napkins please? 🧻',
  'Do you make the food yourself? 👨‍🍳',
] as const;

const THANK_YOUS = [
  'Customer: Aww, thanks! 💖',
  "Customer: You're the best! 🌟",
  'Customer: Cool! ☀️',
] as const;

function moodFace(mood: number): string {
  if (mood >= 65) return '😊';
  if (mood >= 35) return '😐';
  return '😟';
}

function customerMoodFromWait(waitMinutes: number): number {
  if (waitMinutes <= 60) return 70;
  if (waitMinutes <= 180) return 50;
  return 30;
}

function waitInWords(waitMinutes: number): string {
  if (waitMinutes <= 30) return 'Just arrived';
  if (waitMinutes <= 120) return 'Settled in';
  if (waitMinutes <= 240) return 'Been here a while';
  return 'Patient one!';
}

function statusLine(status: Order['status']): string {
  switch (status) {
    case 'queued':
      return 'Waiting to order ⏳';
    case 'cooking':
      return 'Cooking now 🔥';
    case 'served':
      return 'Enjoying their food 😋';
    case 'reviewed':
      // Filtered out at resolution time, but keep exhaustive for TS.
      return 'All done!';
  }
}

export default function InspectCustomerModal() {
  const uiState = useStore();
  const { state } = useRestaurantState();
  const open = uiState.openModal === 'inspect-customer';
  const orderId = uiState.inspectCustomerOrderId;

  // Cache menu lookup once per open so we can resolve the order's item name.
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [answered, setAnswered] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAnswered(null); // reset every time we re-open
    let cancelled = false;
    listMenu()
      .then((res) => {
        if (cancelled || !res) return;
        setMenuItems(res.items);
        setRecipes(res.available_recipes);
      })
      .catch(() => {
        // Falls back to "their meal".
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  if (!open || orderId == null) return null;

  const customers: CustomerInScene[] = state?.customers_in_scene ?? [];
  const orders: Order[] = state?.open_orders ?? [];

  const customer = customers.find((c) => c.ephemeral_id === `order-${orderId}`);
  const order = orders.find((o) => o.id === orderId);

  // If either's gone (customer left, order reviewed, etc.), render nothing.
  if (!customer || !order) return null;

  const currentMinute = state?.restaurant.in_game_minute ?? 0;
  const wait = Math.max(0, currentMinute - customer.arrival_at_minute);
  const mood = customerMoodFromWait(wait);

  // Resolve item name via menu cache.
  const menuItem = menuItems.find((m) => m.id === order.menu_item_id);
  const recipe = menuItem ? recipes.find((r) => r.id === menuItem.recipe_id) : undefined;
  const itemLabel = recipe
    ? `${recipe.display_name} · $${order.price_paid}`
    : 'their meal';

  const personaEmoji = PERSONA_EMOJI[customer.archetype] ?? '🙂';
  const personaLabel = PERSONA_LABEL[customer.archetype] ?? customer.archetype;

  // Pick a question deterministically so kids see the same one as long as
  // the modal is for the same order.
  const question = QUESTIONS[orderId % QUESTIONS.length];

  function handleAnswer() {
    const thanks = THANK_YOUS[Math.floor(Math.random() * THANK_YOUS.length)] ?? THANK_YOUS[0];
    setAnswered(thanks);
    playSfx('thanks');
    setTimeout(() => store.closeModal(), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-cozy-dim/30 backdrop-blur-sm"
      onClick={() => store.closeModal()}
    >
      <div
        className="
          relative bg-cozy-warm rounded-t-2xl sm:rounded-2xl shadow-xl border border-beach-sand/60
          w-full sm:w-[480px] max-h-[90vh] flex flex-col
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — absolute top-right so it doesn't fight the portrait */}
        <button
          onClick={() => store.closeModal()}
          className="absolute right-3 top-3 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-cozy-dim/50 hover:text-cozy-dim hover:bg-beach-sand/60 active:scale-95 transition-all z-10"
          aria-label="Close"
        >
          <span className="text-2xl leading-none" aria-hidden="true">✕</span>
        </button>

        {answered ? (
          /* ── Thank-you screen ────────────────────────────────────────── */
          <div className="px-8 py-12 flex flex-col items-center text-center">
            <div className="text-7xl mb-4 select-none" aria-hidden="true">
              {personaEmoji}
            </div>
            <p className="text-xl font-bold text-cozy-dim">{answered}</p>
          </div>
        ) : (
          /* ── Main inspect view ───────────────────────────────────────── */
          <div className="px-6 pt-6 pb-5 flex flex-col gap-4">
            {/* Portrait + name */}
            <div className="flex flex-col items-center text-center">
              <div
                className="text-7xl mb-2 select-none leading-none"
                aria-hidden="true"
              >
                {personaEmoji}
              </div>
              <h2 className="text-2xl font-bold text-cozy-dim">
                {customer.display_name}
              </h2>
              <p className="text-sm text-cozy-dim/60 mt-0.5">{personaLabel}</p>
            </div>

            {/* Mood face + bar */}
            <div className="flex items-center gap-3">
              <span
                className="text-4xl leading-none flex-shrink-0"
                title={`Mood ~${mood}/100`}
                aria-label={`Mood ${mood} out of 100`}
              >
                {moodFace(mood)}
              </span>
              <div className="flex-1 h-3 rounded-full bg-beach-sand/60 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    mood >= 65
                      ? 'bg-green-500'
                      : mood >= 35
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${mood}%` }}
                />
              </div>
            </div>

            {/* Status line */}
            <div className="text-center text-base font-medium text-cozy-dim">
              {statusLine(order.status)}
            </div>

            {/* Order item + wait */}
            <div className="rounded-xl bg-white/60 border border-beach-sand/50 px-4 py-3 text-center">
              <div className="text-base text-cozy-dim font-medium">{itemLabel}</div>
              <div className="text-sm text-cozy-dim/60 mt-0.5">{waitInWords(wait)}</div>
            </div>

            {/* Question */}
            <div className="rounded-xl bg-beach-sunset/10 border border-beach-sunset/30 px-4 py-3 text-center">
              <p className="text-xs uppercase tracking-wide text-beach-sunset/80 font-semibold mb-1">
                {customer.display_name} asks
              </p>
              <p className="text-lg text-cozy-dim font-medium">{question}</p>
            </div>

            {/* Three answer buttons */}
            <div className="flex flex-col gap-2 mt-1">
              <button
                onClick={handleAnswer}
                className="min-h-[56px] rounded-xl bg-beach-ocean text-white text-lg font-semibold hover:bg-beach-ocean/90 active:scale-[0.98] transition-all"
              >
                Yes! Of course 😊
              </button>
              <button
                onClick={handleAnswer}
                className="min-h-[56px] rounded-xl bg-white/70 border border-beach-sand text-cozy-dim text-lg font-semibold hover:bg-white active:scale-[0.98] transition-all"
              >
                Let me check...
              </button>
              <button
                onClick={handleAnswer}
                className="min-h-[56px] rounded-xl bg-beach-sunset text-white text-lg font-semibold hover:bg-beach-sunset/90 active:scale-[0.98] transition-all"
              >
                I'll surprise you 🎁
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
