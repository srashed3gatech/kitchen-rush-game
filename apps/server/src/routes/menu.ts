// Menu routes: list, unlock, patch.

import { Router } from 'express';
import { db } from '../db/connection.js';
import { requireAuth } from '../auth/middleware.js';
import { HttpError } from '../app.js';
import type {
  MenuItem,
  Recipe,
  MenuResponse,
  UnlockMenuBody,
  UnlockMenuResponse,
  PatchMenuItemBody,
  PatchMenuItemResponse,
} from '@kitchen-rush/shared';

const router = Router();

interface MenuItemRow extends MenuItem {
  recipe_slug?: string;
}

// Includes recipe_display_name, recipe_category, recipe_station so the client
// can render unlocked items without an extra fetch. These extra fields are
// outside the shared MenuItem type — clients that don't care can ignore them.
const selectMenuItems = db.prepare<[number], MenuItem & {
  recipe_display_name: string;
  recipe_category: string;
  recipe_station: string;
}>(`
  SELECT mi.id, mi.restaurant_id, mi.recipe_id, mi.price, mi.is_available, mi.unlocked_at,
         r.display_name as recipe_display_name,
         r.category    as recipe_category,
         r.station     as recipe_station
  FROM menu_items mi
  JOIN recipes r ON r.id = mi.recipe_id
  WHERE mi.restaurant_id = ?
`);

const selectAvailableRecipes = db.prepare<[number], Recipe>(`
  SELECT r.id, r.slug, r.display_name, r.category, r.base_cost, r.default_price,
         r.unlock_cost, r.prep_time_seconds, r.station
  FROM recipes r
  WHERE r.id NOT IN (
    SELECT recipe_id FROM menu_items WHERE restaurant_id = ?
  )
  ORDER BY r.category, r.unlock_cost
`);

const selectRecipeById = db.prepare<[number], Recipe>(`
  SELECT id, slug, display_name, category, base_cost, default_price, unlock_cost, prep_time_seconds, station
  FROM recipes WHERE id = ?
`);

const selectMenuItemById = db.prepare<[number, number], MenuItem>(`
  SELECT id, restaurant_id, recipe_id, price, is_available, unlocked_at
  FROM menu_items WHERE id = ? AND restaurant_id = ?
`);

const insertMenuItem = db.prepare(`
  INSERT INTO menu_items (restaurant_id, recipe_id, price) VALUES (?, ?, ?)
`);

const updateRestaurantCash = db.prepare(`
  UPDATE restaurants SET cash = MAX(0, cash - ?), updated_at = datetime('now') WHERE id = ?
`);

const selectRestaurantCash = db.prepare<[number], { cash: number }>(`
  SELECT cash FROM restaurants WHERE id = ?
`);

const updateMenuItem = db.prepare(`
  UPDATE menu_items SET price = COALESCE(?, price), is_available = COALESCE(?, is_available)
  WHERE id = ? AND restaurant_id = ?
`);

// GET /api/menu
router.get('/', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const items = selectMenuItems.all(restId);
  const available_recipes = selectAvailableRecipes.all(restId);

  const response: MenuResponse = { items, available_recipes };
  res.json(response);
});

// POST /api/menu/unlock
router.post('/unlock', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const { recipeId, price } = req.body as UnlockMenuBody;
  if (!recipeId || typeof recipeId !== 'number') {
    throw new HttpError(400, 'invalid_input', 'recipeId is required.');
  }

  const recipe = selectRecipeById.get(recipeId);
  if (!recipe) throw new HttpError(404, 'recipe_not_found', 'Recipe not found.');

  // Check not already unlocked
  const existing = db.prepare<[number, number], { id: number }>(
    `SELECT id FROM menu_items WHERE restaurant_id = ? AND recipe_id = ?`
  ).get(restId, recipeId);
  if (existing) throw new HttpError(409, 'already_unlocked', 'This recipe is already on your menu.');

  const rest = selectRestaurantCash.get(restId)!;
  const cost = recipe.unlock_cost;

  if (rest.cash < cost) {
    // Informational, not punitive (architecture §9.14)
    throw new HttpError(400, 'cannot_afford', `Earn $${cost - rest.cash} more to unlock.`);
  }

  const itemPrice = price ?? recipe.default_price;

  const unlock = db.transaction(() => {
    updateRestaurantCash.run(cost, restId);
    const r = insertMenuItem.run(restId, recipeId, itemPrice);
    return r.lastInsertRowid as number;
  });

  const itemId = unlock();
  const item = selectMenuItemById.get(itemId, restId)!;
  const updatedRest = selectRestaurantCash.get(restId)!;

  const response: UnlockMenuResponse = { item, cash: updatedRest.cash };
  res.status(201).json(response);
});

// PATCH /api/menu/:id
router.patch('/:id', requireAuth, (req, res) => {
  const restId = req.restaurantId;
  if (!restId) throw new HttpError(404, 'no_restaurant', 'No restaurant found.');

  const itemId = parseInt(req.params['id'] ?? '', 10);
  if (isNaN(itemId)) throw new HttpError(400, 'invalid_input', 'Invalid menu item id.');

  const item = selectMenuItemById.get(itemId, restId);
  if (!item) throw new HttpError(404, 'item_not_found', 'Menu item not found.');

  const { price, is_available } = req.body as PatchMenuItemBody;
  if (price !== undefined && (typeof price !== 'number' || price < 0)) {
    throw new HttpError(400, 'invalid_input', 'price must be a non-negative number.');
  }
  if (is_available !== undefined && is_available !== 0 && is_available !== 1) {
    throw new HttpError(400, 'invalid_input', 'is_available must be 0 or 1.');
  }

  updateMenuItem.run(price ?? null, is_available ?? null, itemId, restId);
  const updated = selectMenuItemById.get(itemId, restId)!;

  const response: PatchMenuItemResponse = { item: updated };
  res.json(response);
});

export default router;
