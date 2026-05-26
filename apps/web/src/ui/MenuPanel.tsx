import { useEffect, useState, useCallback } from 'react';
import { useStore, store } from '../state/store';
import { useRestaurantState } from '../App';
import { listMenu, unlockMenuItem, patchMenuItem } from '../api/endpoints';
import type { MenuItem, Recipe } from '@kitchen-rush/shared/domain';

/**
 * MenuPanel — unlocked items with inline price editing,
 * plus "Available to unlock" section.
 *
 * Unlock cost: disabled if cash insufficient — shows "Earn $X more" (informational,
 * not punitive — architecture §9.14).
 */

const CATEGORY_EMOJI: Record<string, string> = {
  main: '🍔',
  drink: '🥤',
  dessert: '🍦',
  side: '🍟',
};

function UnlockedItem({
  item,
  recipeName,
  recipeCategory,
  onPriceChange,
}: {
  item: MenuItem;
  recipeName: string;
  recipeCategory: string;
  onPriceChange: (id: number, price: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [priceInput, setPriceInput] = useState(String(item.price));

  function handlePriceBlur() {
    const parsed = parseInt(priceInput, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed !== item.price) {
      onPriceChange(item.id, parsed);
    } else {
      setPriceInput(String(item.price));
    }
    setEditing(false);
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-beach-sand/40 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base leading-none flex-shrink-0">
          {CATEGORY_EMOJI[recipeCategory] ?? '🍽️'}
        </span>
        <span className="text-sm text-cozy-dim truncate">{recipeName}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <span className="text-sm text-cozy-dim/60">$</span>
            <input
              type="number"
              min={1}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onBlur={handlePriceBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePriceBlur(); }}
              className="
                w-16 px-2 py-0.5 rounded-lg border border-beach-ocean/50
                text-sm text-cozy-dim text-right bg-white/80
                focus:outline-none focus:ring-1 focus:ring-beach-ocean
              "
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-cozy-dim tabular-nums px-2 py-0.5 rounded-lg hover:bg-beach-sand/50"
            title="Click to edit price"
          >
            ${item.price}
          </button>
        )}
      </div>
    </div>
  );
}

function UnlockableRecipe({
  recipe,
  cash,
  onUnlock,
  unlocking,
}: {
  recipe: Recipe;
  cash: number;
  onUnlock: (recipe: Recipe) => void;
  unlocking: boolean;
}) {
  const canAfford = cash >= recipe.unlock_cost;
  const shortfall = recipe.unlock_cost - cash;

  return (
    <div className="flex items-center justify-between py-2 border-b border-beach-sand/40 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base leading-none flex-shrink-0">
          {CATEGORY_EMOJI[recipe.category] ?? '🍽️'}
        </span>
        <div className="min-w-0">
          <p className="text-sm text-cozy-dim truncate">{recipe.display_name}</p>
          <p className="text-xs text-cozy-dim/40">Unlock for ${recipe.unlock_cost}</p>
        </div>
      </div>
      <div className="flex-shrink-0 ml-2">
        {canAfford ? (
          <button
            onClick={() => onUnlock(recipe)}
            disabled={unlocking}
            className="
              text-xs px-3 py-1.5 rounded-lg font-medium
              bg-beach-ocean text-white
              hover:bg-beach-ocean/90 disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          >
            {unlocking ? '…' : 'Buy'}
          </button>
        ) : (
          <span className="text-xs text-cozy-dim/40 italic">
            Earn ${shortfall} more
          </span>
        )}
      </div>
    </div>
  );
}

interface MenuPanelState {
  items: MenuItem[];
  // Map recipe_id → recipe for display
  recipeMap: Map<number, Recipe>;
  availableRecipes: Recipe[];
}

export default function MenuPanel() {
  const uiState = useStore();
  const { state: restaurantState, refresh } = useRestaurantState();
  const open = uiState.openModal === 'menu';

  const [data, setData] = useState<MenuPanelState>({
    items: [],
    recipeMap: new Map(),
    availableRecipes: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<number | null>(null);

  const cash = restaurantState?.restaurant.cash ?? 0;

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMenu();
      if (res) {
        const recipeMap = new Map<number, Recipe>();
        // Available (unlockable) recipes come with full Recipe info
        for (const recipe of res.available_recipes) {
          recipeMap.set(recipe.id, recipe);
        }
        // Already-unlocked items have recipe info inlined as extra fields
        // by the server (recipe_display_name, recipe_category, recipe_station).
        for (const item of res.items as Array<MenuItem & {
          recipe_display_name?: string;
          recipe_category?: string;
          recipe_station?: string;
        }>) {
          if (item.recipe_display_name && !recipeMap.has(item.recipe_id)) {
            recipeMap.set(item.recipe_id, {
              id: item.recipe_id,
              slug: '',
              display_name: item.recipe_display_name,
              category: (item.recipe_category ?? 'main') as Recipe['category'],
              base_cost: 0,
              default_price: item.price,
              unlock_cost: 0,
              prep_time_seconds: 0,
              station: (item.recipe_station ?? 'grill') as Recipe['station'],
            });
          }
        }
        setData({
          items: res.items,
          recipeMap,
          availableRecipes: res.available_recipes,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchMenu();
  }, [open, fetchMenu]);

  async function handlePriceChange(id: number, price: number) {
    try {
      const res = await patchMenuItem(id, { price });
      if (res) {
        setData((prev) => ({
          ...prev,
          items: prev.items.map((i) => (i.id === id ? res.item : i)),
        }));
      }
    } catch {
      fetchMenu();
    }
  }

  async function handleUnlock(recipe: Recipe) {
    setUnlocking(recipe.id);
    try {
      const res = await unlockMenuItem(recipe.id, recipe.default_price);
      if (res) {
        setData((prev) => ({
          ...prev,
          items: [...prev.items, res.item],
          availableRecipes: prev.availableRecipes.filter((r) => r.id !== recipe.id),
        }));
        refresh(); // update cash in state
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setUnlocking(null);
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
            <h2 className="font-semibold text-cozy-dim text-base">Menu</h2>
            <p className="text-xs text-cozy-dim/50 mt-0.5">Cash on hand: ${cash}</p>
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

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading && (
            <p className="text-sm text-cozy-dim/40 text-center py-8 animate-pulse">Loading…</p>
          )}
          {error && <p className="text-sm text-red-600 text-center py-4">{error}</p>}

          {!loading && (
            <>
              {/* Unlocked items */}
              {data.items.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-cozy-dim/50 uppercase tracking-wider mb-2">
                    Your Menu
                  </h3>
                  <div className="bg-white/50 rounded-xl border border-beach-sand/50 px-3">
                    {data.items.map((item) => {
                      // Get recipe info from the map or fall back to minimal display
                      const recipe = data.recipeMap.get(item.recipe_id);
                      return (
                        <UnlockedItem
                          key={item.id}
                          item={item}
                          recipeName={recipe?.display_name ?? `Item #${item.recipe_id}`}
                          recipeCategory={recipe?.category ?? 'main'}
                          onPriceChange={handlePriceChange}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available to unlock */}
              {data.availableRecipes.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-cozy-dim/50 uppercase tracking-wider mb-2">
                    Available to Unlock
                  </h3>
                  <div className="bg-white/50 rounded-xl border border-beach-sand/50 px-3">
                    {data.availableRecipes.map((recipe) => (
                      <UnlockableRecipe
                        key={recipe.id}
                        recipe={recipe}
                        cash={cash}
                        onUnlock={handleUnlock}
                        unlocking={unlocking === recipe.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
