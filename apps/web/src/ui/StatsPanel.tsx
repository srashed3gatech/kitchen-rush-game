import { useEffect, useState } from 'react';
import { useStore, store } from '../state/store';
import { useRestaurantState } from '../App';
import { listMenu } from '../api/endpoints';
import type {
  Worker,
  CustomerInScene,
  Order,
  Persona,
  Station,
  MenuItem,
  Recipe,
} from '@kitchen-rush/shared/domain';
import { xpToLevel } from '@kitchen-rush/shared/domain';

/**
 * StatsPanel — the player's shop-dashboard modal.
 *
 * Two big sections that mirror the canvas the kid is staring at:
 *   1. Team — every worker, with current task derived from open orders.
 *   2. Tables — every customer currently in the scene, with wait-derived
 *      mood and human-readable wait time.
 *
 * Triggered by store.openModal('stats') from TopBar 📊 button.
 * Modal scaffolding follows the same pattern as HirePanel.
 */

const PERSONA_EMOJI: Record<Persona, string> = {
  beach_bum: '🏄',
  tourist_family: '📷',
  date_couple: '💑',
  foodie_critic: '🤓',
  night_owl: '🦉',
  hangry_surfer: '🍔',
};

const STATION_EMOJI: Record<Station, string> = {
  grill: '🔥',
  fryer: '🍟',
  drink: '🥤',
  dessert: '🍦',
  prep: '🥬',
  assembly: '🥪',
  floor: '🧹',
};

/** Mood face from a 0–100 mood score. */
function moodFace(mood: number): string {
  if (mood >= 65) return '😊';
  if (mood >= 35) return '😐';
  return '😟';
}

/** Customer mood heuristic derived from minutes-waiting. */
function customerMoodFromWait(waitMinutes: number): number {
  if (waitMinutes <= 60) return 70;
  if (waitMinutes <= 180) return 50;
  return 30;
}

/** Customer wait in plain kid-friendly words. */
function waitInWords(waitMinutes: number): string {
  if (waitMinutes <= 30) return 'Just arrived';
  if (waitMinutes <= 120) return 'Settled in';
  if (waitMinutes <= 240) return 'Been here a while';
  return 'Patient one!';
}

/** Phase → kid-readable status badge text. */
function phaseBadge(phase: CustomerInScene['phase']): string {
  switch (phase) {
    case 'walking_in':
      return 'Walking in';
    case 'seated':
      return 'Waiting';
    case 'eating':
      return 'Eating';
    case 'leaving':
      return 'Leaving';
  }
}

function phaseBadgeClass(phase: CustomerInScene['phase']): string {
  switch (phase) {
    case 'walking_in':
      return 'bg-blue-100 text-blue-800';
    case 'seated':
      return 'bg-yellow-100 text-yellow-800';
    case 'eating':
      return 'bg-green-100 text-green-800';
    case 'leaving':
      return 'bg-gray-100 text-gray-700';
  }
}

// ─── Sub-rows ──────────────────────────────────────────────────────────────

function WorkerRow({
  worker,
  order,
  itemName,
}: {
  worker: Worker;
  order: Order | undefined;
  itemName: string | null;
}) {
  const level = xpToLevel(worker.xp);
  const stationEmoji = STATION_EMOJI[worker.station] ?? '👨‍🍳';

  let task: string;
  if (order) {
    const item = itemName ?? 'an order';
    task = `Cooking ${item} for ${order.customer_display_name}`;
  } else {
    task = 'Idle — tap on canvas to coach';
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/70 border border-beach-sand/60 p-3">
      <div className="w-12 h-12 rounded-full bg-beach-sand flex items-center justify-center text-2xl select-none flex-shrink-0">
        🧑‍🍳
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-bold text-cozy-dim truncate">{worker.name}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-beach-ocean/15 text-beach-ocean">
            L{level}
          </span>
          <span className="text-lg leading-none" title={`Station: ${worker.station}`}>
            {stationEmoji}
          </span>
        </div>
        <div className="text-sm text-cozy-dim/70 mt-1 truncate">{task}</div>
      </div>
      <div className="text-3xl leading-none flex-shrink-0" title={`Mood ${worker.mood}/100`}>
        {moodFace(worker.mood)}
      </div>
    </div>
  );
}

function CustomerRow({
  customer,
  itemName,
  currentMinute,
}: {
  customer: CustomerInScene;
  itemName: string | null;
  currentMinute: number;
}) {
  const wait = Math.max(0, currentMinute - customer.arrival_at_minute);
  const mood = customerMoodFromWait(wait);
  const emoji = PERSONA_EMOJI[customer.archetype] ?? '🙂';

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/70 border border-beach-sand/60 p-3">
      <div className="w-12 h-12 rounded-full bg-beach-sand flex items-center justify-center text-2xl select-none flex-shrink-0">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-bold text-cozy-dim truncate">
            {customer.display_name}
          </span>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${phaseBadgeClass(customer.phase)}`}
          >
            {phaseBadge(customer.phase)}
          </span>
        </div>
        <div className="text-sm text-cozy-dim/70 mt-1 truncate">
          Ordered {itemName ?? 'their meal'} · {waitInWords(wait)}
        </div>
      </div>
      <div className="text-3xl leading-none flex-shrink-0" title={`Mood ~${mood}/100`}>
        {moodFace(mood)}
      </div>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export default function StatsPanel() {
  const uiState = useStore();
  const { state } = useRestaurantState();
  const open = uiState.openModal === 'stats';

  // Cache the menu lookup so we can show item names in worker tasks.
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listMenu()
      .then((res) => {
        if (cancelled || !res) return;
        setMenuItems(res.items);
        setRecipes(res.available_recipes);
      })
      .catch(() => {
        // Item names are nice-to-have; degrade silently to "an order".
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const workers = state?.workers ?? [];
  const orders = state?.open_orders ?? [];
  const customers = state?.customers_in_scene ?? [];
  const currentMinute = state?.restaurant.in_game_minute ?? 0;

  /** menu_item_id → recipe display_name, if we can resolve it. */
  function itemNameForOrder(order: Order | undefined): string | null {
    if (!order) return null;
    const mi = menuItems.find((m) => m.id === order.menu_item_id);
    if (!mi) return null;
    const recipe = recipes.find((r) => r.id === mi.recipe_id);
    return recipe?.display_name ?? null;
  }

  /** Best-effort: match customer to their order via the canonical ephemeral_id. */
  function orderForCustomer(c: CustomerInScene): Order | undefined {
    // The convention used elsewhere in the app: ephemeral_id === 'order-' + order.id
    const match = /^order-(\d+)$/.exec(c.ephemeral_id);
    if (!match) return undefined;
    const id = Number(match[1]);
    return orders.find((o) => o.id === id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-cozy-dim/30 backdrop-blur-sm"
      onClick={() => store.closeModal()}
    >
      <div
        className="
          bg-cozy-warm rounded-t-2xl sm:rounded-2xl shadow-xl border border-beach-sand/60
          w-full sm:w-[560px] max-h-[88vh] flex flex-col
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
          <div>
            <h2 className="font-bold text-cozy-dim text-xl flex items-center gap-2">
              <span aria-hidden="true">📊</span> Shop Stats
            </h2>
            <p className="text-sm text-cozy-dim/60 mt-0.5">
              Your team and tables right now
            </p>
          </div>
          <button
            onClick={() => store.closeModal()}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-cozy-dim/50 hover:text-cozy-dim hover:bg-beach-sand/60 active:scale-95 transition-all"
            aria-label="Close stats"
          >
            <span className="text-2xl leading-none" aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          {/* Team section */}
          <section>
            <h3 className="text-base font-semibold text-cozy-dim/80 mb-2 flex items-center gap-2">
              <span aria-hidden="true">👥</span> Team ({workers.length})
            </h3>
            {workers.length === 0 ? (
              <p className="text-sm text-cozy-dim/50 italic py-3 text-center">
                No cooks hired yet — tap 👤➕ to hire your first.
              </p>
            ) : (
              <div className="space-y-2">
                {workers.map((w) => {
                  const order = orders.find((o) => o.worker_id === w.id);
                  return (
                    <WorkerRow
                      key={w.id}
                      worker={w}
                      order={order}
                      itemName={itemNameForOrder(order)}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Tables section */}
          <section>
            <h3 className="text-base font-semibold text-cozy-dim/80 mb-2 flex items-center gap-2">
              <span aria-hidden="true">🪑</span> Tables ({customers.length})
            </h3>
            {customers.length === 0 ? (
              <p className="text-sm text-cozy-dim/50 italic py-3 text-center">
                No customers right now — quiet hours are nice too.
              </p>
            ) : (
              <div className="space-y-2">
                {customers.map((c) => {
                  const order = orderForCustomer(c);
                  return (
                    <CustomerRow
                      key={c.ephemeral_id}
                      customer={c}
                      itemName={itemNameForOrder(order)}
                      currentMinute={currentMinute}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
