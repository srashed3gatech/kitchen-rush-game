// seed.ts — seeds the global recipes catalog from design §3.
// Uses INSERT OR IGNORE with slug as unique key — safe to re-run.

import { runMigrations } from './migrate.js';
import { db } from './connection.js';
import { info } from '../util/logger.js';

// Import config to ensure master key is bootstrapped before DB ops.
import '../config.js';

interface RecipeSeed {
  slug: string;
  display_name: string;
  category: 'main' | 'drink' | 'dessert' | 'side';
  base_cost: number;
  default_price: number;
  unlock_cost: number;
  prep_time_seconds: number;
  station: 'grill' | 'fryer' | 'prep' | 'drink' | 'dessert' | 'assembly';
}

const RECIPES: RecipeSeed[] = [
  // ── Mains ──────────────────────────────────────────────────────────────
  { slug: 'classic_burger',    display_name: 'Classic Burger',   category: 'main',    base_cost: 2, default_price: 8,  unlock_cost: 0,   prep_time_seconds: 60,  station: 'grill'    },
  { slug: 'cheeseburger',      display_name: 'Cheeseburger',     category: 'main',    base_cost: 3, default_price: 10, unlock_cost: 80,  prep_time_seconds: 70,  station: 'grill'    },
  { slug: 'double_burger',     display_name: 'Double Burger',    category: 'main',    base_cost: 5, default_price: 14, unlock_cost: 150, prep_time_seconds: 95,  station: 'grill'    },
  { slug: 'veggie_burger',     display_name: 'Veggie Burger',    category: 'main',    base_cost: 4, default_price: 11, unlock_cost: 120, prep_time_seconds: 65,  station: 'grill'    },
  { slug: 'french_fries',      display_name: 'French Fries',     category: 'side',    base_cost: 1, default_price: 4,  unlock_cost: 0,   prep_time_seconds: 50,  station: 'fryer'    },
  { slug: 'spicy_fries',       display_name: 'Spicy Fries',      category: 'side',    base_cost: 1, default_price: 5,  unlock_cost: 50,  prep_time_seconds: 60,  station: 'fryer'    },
  { slug: 'chicken_nuggets',   display_name: 'Chicken Nuggets',  category: 'main',    base_cost: 2, default_price: 6,  unlock_cost: 70,  prep_time_seconds: 55,  station: 'fryer'    },
  { slug: 'pizza_margherita',  display_name: 'Pizza Margherita', category: 'main',    base_cost: 4, default_price: 14, unlock_cost: 250, prep_time_seconds: 110, station: 'grill'    },
  { slug: 'pizza_pepperoni',   display_name: 'Pizza Pepperoni',  category: 'main',    base_cost: 4, default_price: 16, unlock_cost: 180, prep_time_seconds: 115, station: 'grill'    },

  // ── Drinks ─────────────────────────────────────────────────────────────
  { slug: 'cola',                display_name: 'Cola',                  category: 'drink',   base_cost: 0, default_price: 3,  unlock_cost: 0,   prep_time_seconds: 20,  station: 'drink'   },
  { slug: 'pepsi',               display_name: 'Pepsi',                 category: 'drink',   base_cost: 0, default_price: 3,  unlock_cost: 30,  prep_time_seconds: 20,  station: 'drink'   },
  { slug: 'fanta',               display_name: 'Fanta',                 category: 'drink',   base_cost: 0, default_price: 3,  unlock_cost: 30,  prep_time_seconds: 20,  station: 'drink'   },
  { slug: 'strawberry_lemonade', display_name: 'Strawberry Lemonade',   category: 'drink',   base_cost: 1, default_price: 5,  unlock_cost: 60,  prep_time_seconds: 35,  station: 'drink'   },
  { slug: 'dragon_fruit',        display_name: 'Dragon Fruit Drink',    category: 'drink',   base_cost: 1, default_price: 6,  unlock_cost: 90,  prep_time_seconds: 40,  station: 'drink'   },

  // ── Desserts ───────────────────────────────────────────────────────────
  { slug: 'ice_cream',      display_name: 'Ice Cream',      category: 'dessert', base_cost: 1, default_price: 4,  unlock_cost: 40,  prep_time_seconds: 25,  station: 'dessert' },
  { slug: 'ice_pop',        display_name: 'Ice Pop',         category: 'dessert', base_cost: 0, default_price: 3,  unlock_cost: 25,  prep_time_seconds: 10,  station: 'dessert' },
  { slug: 'cupcake',        display_name: 'Cupcake',         category: 'dessert', base_cost: 1, default_price: 5,  unlock_cost: 80,  prep_time_seconds: 60,  station: 'dessert' },
  { slug: 'cake',           display_name: 'Cake',            category: 'dessert', base_cost: 2, default_price: 7,  unlock_cost: 130, prep_time_seconds: 90,  station: 'dessert' },
  { slug: 'rice_pudding',   display_name: 'Rice Pudding',    category: 'dessert', base_cost: 1, default_price: 6,  unlock_cost: 90,  prep_time_seconds: 75,  station: 'dessert' },
  { slug: 'kids_snack_box', display_name: 'Kids Snack Box',  category: 'side',    base_cost: 2, default_price: 7,  unlock_cost: 100, prep_time_seconds: 40,  station: 'assembly'},
];

function seedRecipes(): void {
  // Prepare inside the function so it runs AFTER migrations have created the table.
  const insertRecipe = db.prepare(`
    INSERT OR IGNORE INTO recipes
      (slug, display_name, category, base_cost, default_price, unlock_cost, prep_time_seconds, station)
    VALUES
      (@slug, @display_name, @category, @base_cost, @default_price, @unlock_cost, @prep_time_seconds, @station)
  `);
  const seedAll = db.transaction(() => {
    for (const recipe of RECIPES) {
      insertRecipe.run(recipe);
    }
  });
  seedAll();
  info(`Seeded ${RECIPES.length} recipes (INSERT OR IGNORE).`);
}

// ── Starter menu items: seed for existing restaurants that have none ──────────
// Called after seedRecipes so recipe IDs exist.
function seedStarterMenuItems(): void {
  const restaurants = db.prepare(`SELECT id, day_number FROM restaurants`).all() as { id: number; day_number: number }[];

  const getRecipeId = db.prepare(`SELECT id FROM recipes WHERE slug = ?`);
  const starterSlugs = ['classic_burger', 'french_fries', 'cola'];

  const insertMenuItem = db.prepare(`
    INSERT OR IGNORE INTO menu_items (restaurant_id, recipe_id, price)
    VALUES (?, ?, ?)
  `);

  const getRecipePrice = db.prepare(`SELECT default_price FROM recipes WHERE id = ?`);

  const seedMenus = db.transaction(() => {
    for (const rest of restaurants) {
      const existing = db.prepare(`SELECT COUNT(*) as cnt FROM menu_items WHERE restaurant_id = ?`).get(rest.id) as { cnt: number };
      if (existing.cnt > 0) continue;

      for (const slug of starterSlugs) {
        const recipe = getRecipeId.get(slug) as { id: number } | undefined;
        if (!recipe) continue;
        const priceRow = getRecipePrice.get(recipe.id) as { default_price: number };
        insertMenuItem.run(rest.id, recipe.id, priceRow.default_price);
      }
    }
  });

  seedMenus();
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function runSeed(): void {
  runMigrations();
  seedRecipes();
  seedStarterMenuItems();
  info('Seed complete.');
}

// Allow direct execution: tsx src/db/seed.ts
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed();
}
