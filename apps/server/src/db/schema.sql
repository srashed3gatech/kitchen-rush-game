-- ============================================================
-- users — owner accounts. One row per registered owner.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  username                    TEXT    NOT NULL UNIQUE,              -- login handle, case-insensitive enforced in code
  display_name                TEXT    NOT NULL,                     -- shown in UI / leaderboard
  created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at               TEXT,
  -- Per DECISIONS §8: encrypted Anthropic key. Both fields NULL = no key set → mock scorer used.
  claude_api_key_ciphertext   BLOB,                                 -- AES-256-GCM ciphertext including auth tag
  claude_api_key_iv           BLOB                                  -- 12-byte IV used to encrypt
  -- SECURITY: no password column on purpose (DECISIONS §7).
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (LOWER(username));

-- ============================================================
-- restaurants — one row per owner. Persistent world state.
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurants (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id          INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT    NOT NULL,
  cash              INTEGER NOT NULL DEFAULT 150,                   -- whole dollars; clamped at 0 (see §9). Starting cash per design §2.
  day_number        INTEGER NOT NULL DEFAULT 1,                     -- 1-based; increments at end-of-day
  in_game_minute    INTEGER NOT NULL DEFAULT 480,                   -- minutes since midnight; 480 = 08:00 day start
  is_paused         INTEGER NOT NULL DEFAULT 0,                     -- 1 when owner pauses the sim
  cleanliness       INTEGER NOT NULL DEFAULT 80,                    -- 0..100; decays slowly during open hours (2/in-game-hr per design §1)
  vibe              INTEGER NOT NULL DEFAULT 70,                    -- 0..100; affected by decor theme
  reputation        INTEGER NOT NULL DEFAULT 60,                    -- 0..100; rolling avg of review scores (3.0/5.0 → 60/100)
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
-- NOTE: `tier` column removed per critique §1.14/§4 (Phase-2 expansion mechanic, not MVP).

CREATE INDEX IF NOT EXISTS idx_restaurants_owner ON restaurants(owner_id);

-- ============================================================
-- recipes — global catalog. Seeded at boot from seed.ts.
-- ============================================================
CREATE TABLE IF NOT EXISTS recipes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  slug               TEXT    NOT NULL UNIQUE,                       -- "classic_burger", "spicy_fries", etc.
  display_name       TEXT    NOT NULL,
  category           TEXT    NOT NULL CHECK (category IN ('main','drink','dessert','side')),
  base_cost          INTEGER NOT NULL,                              -- ingredient cost per serving (cents-free, whole $)
  default_price      INTEGER NOT NULL,                              -- suggested menu price
  unlock_cost        INTEGER NOT NULL DEFAULT 0,                    -- $ owner pays to unlock; 0 = free starter
  prep_time_seconds  INTEGER NOT NULL,                              -- real seconds at base worker skill (informational, NOT a deadline)
  station            TEXT    NOT NULL CHECK (station IN ('grill','fryer','prep','drink','dessert','assembly'))
);

CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category);

-- ============================================================
-- menu_items — which recipes a specific restaurant has unlocked,
-- and at what price.
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id   INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  recipe_id       INTEGER NOT NULL REFERENCES recipes(id),
  price           INTEGER NOT NULL,                                 -- whole $
  is_available    INTEGER NOT NULL DEFAULT 1,                       -- owner can toggle off without losing unlock
  unlocked_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (restaurant_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);

-- ============================================================
-- workers — NPC kitchen staff (DECISIONS §2).
-- ============================================================
CREATE TABLE IF NOT EXISTS workers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id     INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name              TEXT    NOT NULL,
  portrait_id       TEXT    NOT NULL,                               -- sprite atlas key
  xp                INTEGER NOT NULL DEFAULT 0,                     -- 0..∞; XP→level mapping in design §4.2 (L1=0-24, L2=25-74, L3=75-179, L4=180-399, L5=400+)
  mood              INTEGER NOT NULL DEFAULT 70,                    -- 0..100; morning floor of 50, no decay while idle (per design §4)
  station           TEXT    NOT NULL CHECK (station IN ('grill','fryer','prep','drink','dessert','assembly','floor')),
  wage_per_day      INTEGER NOT NULL DEFAULT 40,                    -- $ paid at end-of-day (revenue-share component layered on top)
  hired_on_day      INTEGER NOT NULL,                               -- day_number when hired
  hire_date         TEXT    NOT NULL DEFAULT (datetime('now')),     -- real-world for reference
  coaching_count    INTEGER NOT NULL DEFAULT 0,                     -- lifetime # coaching sessions
  -- Workers are NEVER deleted (DECISIONS §10.3 — no firing). is_active reserved for future "took the day off" mechanic.
  is_active         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_workers_restaurant ON workers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_workers_station    ON workers(station);

-- ============================================================
-- NOTE: customers table REMOVED per critique §1.7 / §4 scope creep.
-- Customer data is denormalised onto `orders` below (ephemeral model
-- matches design §5 personas; "Marco recognises you" is a Phase-2 idea
-- and explicitly out of MVP scope).
-- ============================================================

-- ============================================================
-- orders — historical ledger of every order ever placed.
-- Customer info is denormalised here (no FK; customers are ephemeral).
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id            INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_display_name    TEXT    NOT NULL,                       -- denormalised; eg "Marco"
  customer_archetype       TEXT    NOT NULL CHECK (customer_archetype IN ('beach_bum','tourist_family','date_couple','foodie_critic','night_owl','hangry_surfer')),
  customer_portrait_id     TEXT    NOT NULL,                       -- sprite atlas key
  worker_id                INTEGER          REFERENCES workers(id),-- assigned cook (NULL if owner cooked)
  menu_item_id             INTEGER NOT NULL REFERENCES menu_items(id),
  day_number               INTEGER NOT NULL,
  placed_at_min            INTEGER NOT NULL,                       -- in-game minute-of-day order was placed
  served_at_min            INTEGER,                                -- NULL until served; informational only (no expiry)
  price_paid               INTEGER NOT NULL,                       -- $
  tip_amount               INTEGER NOT NULL DEFAULT 0,             -- $; computed at review time from persona tip% × service_factor
  was_mistake              INTEGER NOT NULL DEFAULT 0,             -- 1 if worker fumbled (per design §4.1); customer still pays
  mistake_kind             TEXT             CHECK (mistake_kind IS NULL OR mistake_kind IN ('burnt','wrong_item','undercooked','slow')),
  status                   TEXT    NOT NULL CHECK (status IN ('queued','cooking','served','reviewed')) DEFAULT 'queued',
  created_at               TEXT    NOT NULL DEFAULT (datetime('now'))
  -- NOTE (§9): no `expires_at`, no `walked_out` status. Orders cannot fail. served_at_min may be late; that's just data for the review.
);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_day ON orders(restaurant_id, day_number);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);

-- ============================================================
-- reviews — raw customer comment + Claude-scored dimensions.
-- One review per served order (eventually).
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id            INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id       INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  -- customer_id removed; customer info denormalised on orders row.
  raw_comment         TEXT    NOT NULL,                             -- what the NPC "wrote"
  score_taste         INTEGER NOT NULL CHECK (score_taste         BETWEEN 0 AND 100),
  score_cleanliness   INTEGER NOT NULL CHECK (score_cleanliness   BETWEEN 0 AND 100),
  score_seating       INTEGER NOT NULL CHECK (score_seating       BETWEEN 0 AND 100),
  score_service       INTEGER NOT NULL CHECK (score_service       BETWEEN 0 AND 100),
  score_vibe          INTEGER NOT NULL CHECK (score_vibe          BETWEEN 0 AND 100),
  score_timing        INTEGER NOT NULL CHECK (score_timing        BETWEEN 0 AND 100),
  improvement_hint    TEXT,                                         -- ≤ 140 chars (per critique §1.6); Claude or heuristic
  claude_used         INTEGER NOT NULL DEFAULT 0,                   -- 1 = real Claude call, 0 = heuristic fallback
  fallback_reason     TEXT             CHECK (fallback_reason IS NULL OR fallback_reason IN ('no_key','rate_limit','invalid_key','timeout','parse_error','network')),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_restaurant   ON reviews(restaurant_id, created_at);

-- ============================================================
-- coaching_sessions — owner ↔ worker quiet-hours conversations.
-- ============================================================
-- coaching_sessions has TWO kinds (critique §1.5):
--   • 'preset'     : owner taps a preset radial-menu phrase during open hours.
--                    Zero Claude calls. worker_response is NULL (a templated
--                    speech bubble is shown by the UI, not stored).
--   • 'one_on_one' : quiet-hours conversation per design §4.4.
--                    Optionally calls Claude (Opus 4.7) for a worker reply.
CREATE TABLE IF NOT EXISTS coaching_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  restaurant_id     INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  worker_id         INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  day_number        INTEGER NOT NULL,                              -- day this session occurred on
  kind              TEXT    NOT NULL CHECK (kind IN ('preset','one_on_one')),
  preset_key        TEXT,                                          -- non-null when kind='preset'; e.g. 'praise', 'try_recipe_again'
  owner_message     TEXT,                                          -- non-null when kind='one_on_one'; choice text
  worker_response   TEXT,                                          -- nullable: NULL for presets; may be Claude-generated for one_on_one
  xp_delta          INTEGER NOT NULL DEFAULT 0,                    -- applied to workers.xp at session close
  mood_delta        INTEGER NOT NULL DEFAULT 0,                    -- applied to workers.mood
  claude_used       INTEGER NOT NULL DEFAULT 0,                    -- always 0 for kind='preset'
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coaching_worker ON coaching_sessions(worker_id, day_number);

-- ============================================================
-- settings — per-user key/value store for non-secret prefs.
-- (The Claude API key lives encrypted on users, not here.)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT    NOT NULL,                                     -- "music_volume", "tutorial_seen", etc.
  value      TEXT    NOT NULL,                                     -- always stored as string; client parses
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);

-- ============================================================
-- daily_scores — one row per (restaurant, in-game day) per critique §1.8.
-- Populated by server-side leaderboard.ts at in-game day-end (5 AM).
-- Replaces the previous leaderboard_view (which used a different formula
-- than design §10). The leaderboard endpoint is now a trivial SELECT.
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_scores (
  restaurant_id     INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_number        INTEGER NOT NULL,
  daily_score       REAL    NOT NULL,                              -- DailyScore × 1000 (per design §10)
  rolling_score     REAL    NOT NULL,                              -- 0.6·avg7d + 0.4·best7d, × 1000
  feedback_norm     REAL    NOT NULL,                              -- 0..1
  sales_norm        REAL    NOT NULL,
  team_norm         REAL    NOT NULL,
  growth_norm       REAL    NOT NULL,
  consistency_norm  REAL    NOT NULL,
  computed_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (restaurant_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_daily_scores_rolling ON daily_scores(rolling_score DESC);

-- ============================================================
-- auth_sessions — one active session per user (HMAC nonce; see §7).
-- ============================================================
CREATE TABLE IF NOT EXISTS auth_sessions (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret      TEXT    NOT NULL,                                    -- 16 hex chars
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id)                                            -- logout = DELETE; login = upsert
);
