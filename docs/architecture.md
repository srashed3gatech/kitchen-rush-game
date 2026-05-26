# Kitchen Rush — Architecture (Phase 1b)

This document is the single source of truth for how the Kitchen Rush MVP is built. It respects every decision in `DECISIONS.md`. Where the source docs (`docs/source/SystemDesign.md` in particular) recommend Redis / Postgres / NestJS / WebSockets / Phaser, those recommendations are **overridden** per DECISIONS §3 and §10.

This is an MVP for **local-dev only**, **single owner playing offline**, with a cozy, no-time-pressure feel. Anything in the architecture that smells like a fail-state, deadline, or expiry is called out in §9.

---

## 1. Workspace layout

A single npm-workspaces monorepo. No yarn, no pnpm, no turbo (DECISIONS §3).

```
kitchen-rush/
├── DECISIONS.md
├── README.md                              ← written in Phase 5
├── package.json                           ← workspace root, scripts only
├── package-lock.json
├── .nvmrc                                 ← "20"
├── .env.example                           ← MASTER_ENCRYPTION_KEY placeholder only
├── tsconfig.base.json                     ← shared compiler options
│
├── apps/
│   ├── web/                               ← React 18 + Vite + TS + Tailwind + Canvas
│   │   ├── package.json
│   │   ├── vite.config.ts                 ← proxy /api → :4000
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── index.html
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.tsx                   ← React root
│   │       ├── App.tsx                    ← top-level router (basic state machine, no react-router needed)
│   │       ├── api/
│   │       │   ├── client.ts              ← fetch wrapper, sends credentials: 'include'
│   │       │   └── endpoints.ts           ← typed wrappers per endpoint
│   │       ├── hooks/
│   │       │   ├── usePollingState.ts     ← 1-second poll of /api/restaurant/state
│   │       │   └── useAuth.ts
│   │       ├── canvas/
│   │       │   ├── Scene.tsx              ← <canvas> + RAF loop
│   │       │   ├── render/                ← draw functions (beach, shop, workers, customers)
│   │       │   ├── sprites/               ← sprite loader & atlas index (CC0 pack lives in /public/sprites)
│   │       │   └── dayNight.ts            ← gradient overlay by in-game hour
│   │       ├── ui/                        ← Tailwind UI overlay on top of canvas
│   │       │   ├── TopBar.tsx             ← cash, day number, in-game clock (NOT a countdown)
│   │       │   ├── WorkerPanel.tsx
│   │       │   ├── CoachingModal.tsx
│   │       │   ├── ReviewsPanel.tsx
│   │       │   ├── MenuPanel.tsx
│   │       │   ├── SettingsModal.tsx      ← API key paste box
│   │       │   ├── LeaderboardPanel.tsx
│   │       │   └── LoginScreen.tsx
│   │       ├── state/
│   │       │   └── store.ts               ← tiny Zustand-style store (one file, ~80 lines, no dep)
│   │       └── styles/
│   │           └── index.css              ← Tailwind directives
│   │   └── public/
│   │       └── sprites/                   ← CC0 pack (Kenney-style) — chosen by research agent
│   │
│   └── server/                            ← Express + TS + better-sqlite3
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts                   ← entrypoint (bootstrap + listen)
│       │   ├── app.ts                     ← Express app factory (routes, middleware)
│       │   ├── config.ts                  ← env loading, master key bootstrap
│       │   ├── db/
│       │   │   ├── connection.ts          ← better-sqlite3 singleton
│       │   │   ├── migrate.ts             ← runs schema.sql on boot
│       │   │   ├── schema.sql             ← see §2
│       │   │   └── seed.ts                ← seeds recipes + dev fixtures
│       │   ├── auth/
│       │   │   ├── cookie.ts              ← HMAC sign/verify
│       │   │   └── middleware.ts          ← requireAuth
│       │   ├── crypto/
│       │   │   └── aes.ts                 ← encrypt/decrypt (see §5)
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── restaurant.ts
│       │   │   ├── day.ts
│       │   │   ├── workers.ts
│       │   │   ├── menu.ts
│       │   │   ├── reviews.ts
│       │   │   ├── leaderboard.ts
│       │   │   ├── settings.ts
│       │   │   └── dev.ts                 ← only mounted in NODE_ENV=development
│       │   ├── sim/
│       │   │   ├── tick.ts                ← server tick loop (see §4)
│       │   │   ├── customers.ts           ← arrival generator
│       │   │   ├── orders.ts              ← order lifecycle (no aging exposed to UI)
│       │   │   ├── workers.ts             ← worker AI behavior
│       │   │   └── economy.ts             ← cash accounting (clamped at 0)
│       │   ├── ai/
│       │   │   ├── claudeClient.ts        ← thin Anthropic SDK wrapper
│       │   │   ├── reviewScorer.ts        ← see §6
│       │   │   └── coachReply.ts          ← worker dialogue generator (mock fallback)
│       │   └── util/
│       │       └── logger.ts              ← tiny console logger
│       └── data/                          ← runtime SQLite file lives here (gitignored)
│           └── .gitkeep
│
├── packages/
│   └── shared/                            ← Pure types, zero runtime deps
│       ├── package.json                   ← "main": "src/index.ts" (consumed via tsconfig paths)
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                   ← re-export everything
│           ├── api.ts                     ← request/response DTOs
│           ├── domain.ts                  ← Restaurant, Worker, Customer, Order, Review
│           └── scoring.ts                 ← 6-dimension score type
│
├── docs/
│   ├── source/                            ← input docs (locked)
│   ├── research.md
│   ├── architecture.md                    ← THIS FILE
│   ├── design.md
│   └── critique.md
│
└── sandbox/                               ← archived prototype, do not modify
```

### Root `package.json`

```json
{
  "name": "kitchen-rush",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev":          "concurrently -n server,web -c blue,magenta \"npm:dev:server\" \"npm:dev:web\"",
    "dev:server":   "npm --workspace apps/server run dev",
    "dev:web":      "npm --workspace apps/web run dev",
    "build":        "npm --workspace apps/server run build && npm --workspace apps/web run build",
    "typecheck":    "tsc -b apps/server apps/web packages/shared",
    "seed":         "npm --workspace apps/server run seed",
    "reset":        "rm -f apps/server/data/kitchen-rush.sqlite && npm run seed"
  },
  "devDependencies": {
    "concurrently": "^9.0.0",
    "typescript": "^5.5.0"
  }
}
```

### `apps/server/package.json` (key bits)

```json
{
  "name": "@kitchen-rush/server",
  "scripts": {
    "dev":   "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "seed":  "tsx src/db/seed.ts"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cookie-parser":  "^1.4.7",
    "express":        "^4.19.0",
    "@anthropic-ai/sdk": "^0.27.0"
  },
  "devDependencies": {
    "tsx":         "^4.16.0",
    "typescript":  "^5.5.0",
    "@types/express": "^4.17.0",
    "@types/cookie-parser": "^1.4.7",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

**Dev runner pick:** `tsx watch` (single-file, fast, no `ts-node-dev` quirks).

### `apps/web/package.json` (key bits)

```json
{
  "name": "@kitchen-rush/web",
  "scripts": {
    "dev":   "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react":     "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "vite":       "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss":"^3.4.0",
    "postcss":    "^8.4.0",
    "autoprefixer": "^10.4.0",
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

Confirmed stack: **React 18 + Vite + TS + Tailwind** for `web`; **Express + TS + better-sqlite3** for `server`; shared types in `packages/shared`. No Phaser. No WebSockets. No Redis. No Postgres.

---

## 2. Data model — full SQLite schema

`apps/server/src/db/schema.sql`. Run on first boot if tables don't exist. SQLite via `better-sqlite3` is configured with `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON`.

All timestamps are stored as **ISO-8601 strings in UTC** (`TEXT NOT NULL DEFAULT (datetime('now'))`). All booleans are `INTEGER` (0/1).

```sql
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
```

**Why a table, not a view:** the design §10 formula is a 5-factor weighted sum recomputed at in-game day-end. Computing it in a view on every leaderboard read is both wrong (uses rolling 7-day window) and wasteful. A table lets the leaderboard endpoint be `SELECT * FROM daily_scores WHERE day_number = (latest per restaurant) ORDER BY rolling_score DESC LIMIT 10`.

---

## 3. REST API surface

All endpoints are mounted under `/api`. JSON in, JSON out. Auth via signed cookie (`kr_session`); see §7. Error envelope is always `{ "error": { "code": string, "message": string } }` with appropriate HTTP status.

| # | Method | Path | Auth | Request body (1-liner) | Response (1-liner) |
|---|---|---|---|---|---|
| 1 | GET    | `/api/health`                              | no  | —                                                | `{ ok: true, version }` |
| 2 | POST   | `/api/auth/register`                       | no  | `{ username, displayName }`                      | `{ user }` + Set-Cookie |
| 3 | POST   | `/api/auth/login`                          | no  | `{ username }`                                   | `{ user }` + Set-Cookie |
| 4 | POST   | `/api/auth/logout`                         | yes | —                                                | `{ ok: true }` |
| 5 | GET    | `/api/auth/me`                             | yes | —                                                | `{ user, restaurantId }` |
| 6 | GET    | `/api/restaurant/state`                    | yes | —                                                | full RestaurantState snapshot (cash, day, in_game_minute, cleanliness, vibe, reputation, workers[], openOrders[]) |
| 7 | POST   | `/api/restaurant/clean`                    | yes | `{ target?: 'floor'\|'tables' }`                 | `{ cleanliness }` (owner action increments cleanliness) |
| 8 | POST   | `/api/day/start`                           | yes | —                                                | `{ day_number, in_game_minute }` (resumes if paused, fresh-starts if at quiet hours) |
| 9 | POST   | `/api/day/pause`                           | yes | —                                                | `{ is_paused: true }` (cozy pause; sim halts) |
| 10 | POST  | `/api/day/end`                             | yes | —                                                | `{ day_number, summary }` (force-advances to next day; runs end-of-day economy) |
| 11 | GET   | `/api/workers`                             | yes | —                                                | `{ workers: Worker[] }` |
| 12a| GET   | `/api/workers/candidates`                  | yes | —                                                | `{ candidates: HireCandidate[] }` (returns 3 procedural candidates per critique §5.8) |
| 12b| POST  | `/api/workers/hire`                        | yes | `{ candidateId: string, station }`               | `{ worker }` (cost from design §4 curve: $100/$150/$250 for hires 2/3/4) |
| 13 | POST  | `/api/workers/:id/assign`                  | yes | `{ station }`                                    | `{ worker }` |
| 14a| POST  | `/api/workers/:id/coach`                   | yes | `{ presetKey: 'praise'\|'take_time'\|'try_again'\|'watch_heat'\|'check_ticket'\|'cleanup_when_can' }` | `{ session }` — **preset only, NO Claude call** (per critique §1.5) |
| 14b| POST  | `/api/workers/:id/one-on-one`              | yes | `{ choice: 1\|2\|3 }`                            | `{ session }` — quiet-hours conversation, MAY call Claude Opus 4.7 |
| 15 | GET   | `/api/menu`                                | yes | —                                                | `{ items: MenuItem[], availableRecipes: Recipe[] }` |
| 16 | POST  | `/api/menu/unlock`                         | yes | `{ recipeId, price }`                            | `{ item }` (deducts unlock_cost) |
| 17 | PATCH | `/api/menu/:id`                            | yes | `{ price?, is_available? }`                      | `{ item }` |
| 18 | GET   | `/api/reviews?limit=20&cursor=...`         | yes | —                                                | `{ reviews: Review[], nextCursor }` |
| 19 | GET   | `/api/leaderboard?limit=10`                | yes | —                                                | `{ rows: LeaderboardRow[] }` — reads `daily_scores` (latest day per restaurant), sorted by `rolling_score DESC`. Top 10 only (critique §2.8). Never includes "your rank". |
| 20 | GET   | `/api/settings/api-key`                    | yes | —                                                | `{ hasKey: boolean, lastFour?: string }` (never returns plaintext) |
| 21 | PUT   | `/api/settings/api-key`                    | yes | `{ apiKey: string }`                             | `{ hasKey: true, lastFour }` (encrypts + stores) |
| 22 | DELETE| `/api/settings/api-key`                    | yes | —                                                | `{ hasKey: false }` |
| 23 | GET   | `/api/settings`                            | yes | —                                                | `{ kv: Record<string,string> }` |
| 24 | PUT   | `/api/settings/:key`                       | yes | `{ value: string }`                              | `{ key, value }` |
| 25 | POST  | `/api/dev/seed`                            | yes* | —                                              | `{ ok: true }` — only in NODE_ENV=development |
| 26 | POST  | `/api/dev/reset`                           | yes* | —                                              | `{ ok: true }` — only in NODE_ENV=development |
| 27 | POST  | `/api/dev/advance-days`                    | yes* | `{ count: number, withReviews?: boolean }`     | `{ day_number }` — fast-forwards N in-game days, generates synthetic reviews + levels workers. Critique §5.5. |

`yes*` = additionally guarded by `NODE_ENV !== 'production'`.

**Notes:**
- Endpoint #6 is the **polling endpoint** (see §4). It must be cheap; one SELECT per restaurant row, one SELECT per worker, one SELECT for open orders. better-sqlite3 handles this in <1 ms.
- Coaching (#14) is the only endpoint that synchronously calls Claude. Worst-case latency ~2 s; UI shows a "Worker is thinking…" state.
- Review creation is **internal**, fired by the sim tick. It is not a client endpoint.

---

## 4. Real-time / sync model

DECISIONS §3 forbids WebSockets/multiplayer for MVP. The model is server-authoritative simulation + client HTTP polling.

### 4.1 Server tick

- Runs in the same Node process as Express, via `setInterval(tickAll, 1000)` (1 Hz). Started in `apps/server/src/sim/tick.ts` after migrations finish.
- One Hz wall-clock = **one tick per real second**.
- **Time mapping (DECISIONS §4):** one in-game day = 5 real minutes = 300 real seconds = 300 ticks. The day spans 24 in-game hours (1440 in-game minutes). So one tick advances `in_game_minute` by `1440 / 300 = 4.8` in-game minutes (stored as integer; we accumulate a fractional remainder per restaurant in memory to avoid drift, then flush integer increments to disk).
- The tick iterates every restaurant where `is_paused = 0`:
  1. Advance `in_game_minute` (wrap at 1440 → increment `day_number`, run end-of-day settlement).
  2. **Customer arrivals are NOT sampled in the 1 Hz tick** (critique §1.4). At the start of each in-game hour, we sample a Poisson process with λ from design §5.1 (modified by reputation per design §5.1 — λ × 1.3 at rep≥90, × 0.6 at rep≤10, linear between), and queue arrivals with `setTimeout` at precomputed real-second offsets. This gives smooth, fair spawn cadence.
  3. Advance each worker's current task (cooking timer counts down toward `prep_time_seconds * skillFactor`).
  4. Apply slow cleanliness decay during open hours (2 points per in-game hour per design §1).
- **Persistence cadence:** the tick mutates an in-memory cache of `RestaurantState`. SQLite writes happen:
  - Every 5 ticks (5 s) for `restaurants.in_game_minute`, `cash`, `cleanliness`.
  - Immediately on any discrete event (order placed, order served, review created, worker hired/coached, day rolled over). better-sqlite3 transactions make this cheap.
- The MVP runs **one Node process**, so there is no clustering concern. The in-memory cache is the source of truth between flushes; on boot, we hydrate from SQLite.

### 4.2 Client refresh

- **HTTP polling.** Not SSE. Reasoning: simpler to debug, no connection lifecycle, no proxy headaches, and the data volume is tiny.
- **Poll rate:** **1 Hz** (every 1 s) of `GET /api/restaurant/state` while a day is running. Drops to **0.2 Hz** (every 5 s) when `is_paused = true` or during quiet hours (5–8 AM in-game).
- **Endpoint shape:** the polling response is the single fat snapshot from §3 endpoint #6 — restaurant top-level fields + workers + open orders + last 3 review IDs (the client lazy-loads full reviews). Empirically ~2–5 KB JSON.
- The polling hook (`usePollingState.ts`) uses a single `setTimeout` chain (not `setInterval`) so it never overlaps requests, and pauses when `document.visibilityState !== 'visible'`.
- **ETag / If-None-Match** on `GET /api/restaurant/state` (critique §3.1): server computes a cheap hash of `(in_game_minute, day_number, len(open_orders), max(workers.updated_at))`. When unchanged, return `304 Not Modified` with zero body. Cuts poll bytes to ~0 during quiet hours / pauses.

### 4.3 Authority

- **Server is authoritative for everything.** The client renders what the server reports. The canvas interpolates worker positions visually between snapshots, but never simulates business logic.
- **No client predictions** in MVP. Owner clicks "Clean" → POST → re-poll → see updated `cleanliness`. The ~1 s round-trip is acceptable for a cozy game.

---

## 5. Encryption of Claude API key

**Algorithm:** AES-256-GCM. Implementation: Node's built-in `crypto` module. **No npm dependency.**

**Master key location** (per critique §3.2 — moved out of repo): `~/.config/kitchen-rush/master.key` (mode `0600`, expanded via `os.homedir()`). Process reads it on boot. `process.env.MASTER_ENCRYPTION_KEY` is honoured as an override if set.

- **Bootstrap (dev):** if the file is missing **and** `NODE_ENV !== 'production'`, the server creates `~/.config/kitchen-rush/` (mode `0700`), writes a fresh `crypto.randomBytes(32).toString('hex')` into `master.key` (mode `0600`), and logs a one-line notice with the path.
- **Production refuse:** if missing in prod, server refuses to boot and prints the path it expects. (MVP is local-dev only — DECISIONS §9 — but the code path exists.)
- **No repo footprint.** `.env.example` no longer mentions `MASTER_ENCRYPTION_KEY` (it lives in `~/.config`, not in the repo). `.gitignore` still excludes `.env` for `SESSION_SIGNING_SECRET` and `ANTHROPIC_API_KEY` overrides if anyone uses them.
- **Decrypt failure handling** (critique §3.2): if `decrypt()` throws (corrupted ciphertext, master key rotated and lost), `reviewScorer` wraps the call in try/catch, logs a warning, and falls back to the heuristic scorer with `fallback_reason = 'parse_error'`. The owner is shown a one-line nudge in Settings: "Stored key couldn't be read — re-paste your key, or play with the offline scorer."

**IV:** 12 bytes, fresh per encryption, stored alongside the ciphertext in `users.claude_api_key_iv`. Auth tag is appended to the ciphertext (final 16 bytes of the BLOB).

```ts
// apps/server/src/crypto/aes.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function masterKey(): Buffer {
  const hex = process.env.MASTER_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    // SECURITY: bootstrap path handles auto-generation in dev (see config.ts).
    throw new Error('MASTER_ENCRYPTION_KEY missing or wrong length');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): { ciphertext: Buffer; iv: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();          // 16 bytes
  return { ciphertext: Buffer.concat([enc, tag]), iv };
}

export function decrypt(ciphertext: Buffer, iv: Buffer): string {
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
  const body = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}
```

The key is only decrypted at the moment of an outgoing Claude call (see §6) and never logged.

---

## 6. AI scoring service contract

File: `apps/server/src/ai/reviewScorer.ts`. Single exported function plus a coaching helper.

```ts
// packages/shared/src/scoring.ts
export interface SixScores {
  taste: number;        // 0..100
  cleanliness: number;
  seating: number;
  service: number;
  vibe: number;
  timing: number;
}

export interface ReviewInput {
  restaurantSnapshot: {            // pulled from current restaurant row by caller
    cleanliness: number;
    vibe: number;
    reputation: number;
  };
  order: {
    menuItemDisplayName: string;
    priceCharged: number;
    waitMinutesInGame: number;     // served_at_min - placed_at_min (informational only)
  };
  worker: { name: string; skill: number; mood: number } | null;
  customer: { archetype: string; preferredCategory: string; generosity: number };
}

export interface ScoredReview {
  rawComment: string;        // ≤ 280 chars, NPC voice
  scores: SixScores;
  improvementHint: string;   // ≤ 140 chars, owner-facing
  claudeUsed: boolean;
  fallbackReason?: 'no_key' | 'rate_limit' | 'invalid_key' | 'timeout' | 'parse_error' | 'network';
}
```

```ts
// apps/server/src/ai/reviewScorer.ts
export interface ReviewScorer {
  scoreReview(userId: number, input: ReviewInput): Promise<ScoredReview>;
}
```

**Implementation behavior:**

1. Look up the owner's encrypted API key for `userId`. If both `claude_api_key_ciphertext` and `claude_api_key_iv` are NULL → use **mock fallback** (below). Set `claudeUsed = false, fallbackReason = 'no_key'`.
2. Otherwise, `decrypt(...)` (try/catch — on failure fall back with `'parse_error'`) → call `@anthropic-ai/sdk` with model **`claude-haiku-4-5`** (per critique §1.2 — narrow classification task; Haiku is ~3× cheaper and fast enough; DECISIONS §11 updated to add Haiku for narrow classification). Use **`tool_use`** mode with a forced `score_review` tool whose `input_schema` enforces six 0..100 integers + `improvementHint` (≤140 chars). System prompt = the 6-dimension rubric (prompt-cached). `max_tokens: 400`, `temperature: 0.4`.
3. **Coaching one_on_one** replies (only the quiet-hours endpoint #14b) use `claude-opus-4-7` — creative, low-frequency (≤4 calls per real minute per restaurant), tone-sensitive.
4. **Timeouts & errors** (critique §5.3): all Claude calls use `AbortSignal.timeout(10_000)`. On any error class (`429`, `5xx`, `401`, `timeout`, `network`, parse failure) → log the class, set `claudeUsed = false`, set `fallbackReason` accordingly (`'rate_limit'` / `'invalid_key'` / `'timeout'` / `'network'` / `'parse_error'`), and return the mock result. The SettingsModal surfaces the last fallback reason as a soft inline message ("Last attempt: rate-limited, retrying next time").
5. Parse the JSON returned by the `tool_use` block. Validate every score is `0..100` integer. If any invalid → `fallback_reason='parse_error'`.
6. Cache the decrypted key for the lifetime of one request only; never store in memory across requests.

**Mock fallback (deterministic-ish heuristic):**

Given `restaurantSnapshot`, `worker`, `order`, produce scores like:
- `taste` = clamp(50 + worker.skill * 0.3 + jitter, 0, 100)
- `cleanliness` = restaurantSnapshot.cleanliness ± 5
- `seating` = restaurantSnapshot.vibe ± 5
- `service` = clamp(40 + worker.mood * 0.4 + jitter, 0, 100)
- `vibe` = restaurantSnapshot.vibe ± 3
- `timing` = clamp(100 - order.waitMinutesInGame * 1.5, 0, 100)
- `rawComment` picked from a small template pool seeded by archetype.
- `improvementHint` picked from a small rule table on the lowest dimension.

Jitter is `pseudo-random seeded by orderId` so results are reproducible during dev. **`claudeUsed = false`.**

**Coaching companion:** `coachReply.ts` exposes `coachReply(userId, { workerSnapshot, ownerMessage }): Promise<{ workerResponse, skillDelta, moodDelta, claudeUsed }>` with the same key/fallback discipline. Used by `/api/workers/:id/coach`.

---

## 7. Auth implementation

**Pick: HMAC-signed cookie via `cookie-parser`'s `signedCookies`. One pick, one paragraph.**

On register or login the server creates a row in `users` (case-insensitive on `username`) and sets a single signed cookie `kr_session` whose value is `${userId}:${userSecret8Chars}` — the userSecret is a per-user random nonce stored in a tiny `auth_sessions` table (rotates on logout). `cookie-parser` is initialized with `process.env.SESSION_SIGNING_SECRET` (auto-generated to `.env` on first boot, same machinery as the master encryption key). The cookie is `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 30 days`, and **not** `secure` (local dev over http). The `requireAuth` middleware reads `req.signedCookies.kr_session`, splits it, joins to `auth_sessions`, attaches `req.user`. There is no password verification step because DECISIONS §7 forbids passwords; a `// SECURITY: username-only auth — anyone who knows your username can log in as you` comment lives on the login route. Vite proxies `/api` to `:4000` with `changeOrigin: true`, so cookies flow naturally during dev.

The `auth_sessions` table is declared in the §2 schema block (folded in per critique §1.15).

---

## 8. Build / dev / run

- `npm install` at root once (workspaces install everything).
- `npm run dev` at root → `concurrently` launches:
  - **server** (`tsx watch src/index.ts`) on **port 4000**. Migrations + seed run on boot if DB is empty.
  - **web** (`vite`) on **port 5173**.
- **Vite proxy:** `vite.config.ts` has
  ```ts
  server: { proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } } }
  ```
  so the client always fetches `/api/...` and never sees CORS.
- `npm run build` → web emits static assets to `apps/web/dist`; server compiles TS to `apps/server/dist`. (Local-dev only per DECISIONS §9; build is exercised mainly for typecheck.)
- **Smoke test:** `curl -s localhost:4000/api/health` → `{"ok":true,"version":"0.1.0"}` with HTTP 200. The CI smoke check is just this curl + a one-liner that hits `/api/auth/register` and asserts a cookie comes back.
- `npm run reset` deletes the SQLite file and re-seeds — useful for design iteration.

Node 20 LTS, declared in `.nvmrc`.

---

## 9. No-fail / no-rush check

Auditing every place where time-pressure or a fail-state could leak into the architecture, and explicitly designing it out.

| # | Potential leak | Mitigation in this architecture |
|---|---|---|
| 1 | `orders.served_at_min` could be turned into a deadline ("you have 90 in-game minutes") | The column exists only for review weighting. No `expires_at`, no `walked_out` status, no UI surfacing of "how long has Marco been waiting?". Order rows have status `queued`/`cooking`/`served`/`reviewed` — no `cancelled`/`abandoned`. |
| 2 | `restaurants.cash` going negative | Application-layer clamp: any debit that would push `cash < 0` is **partially applied down to 0**. Workers don't quit; they just get unpaid (modelled as a small `mood` drop, never below 30). DB allows negative for analytical honesty but the writer never lets it happen. |
| 3 | "Day ends and you didn't make rent" → fail state | There is **no rent**. End-of-day settlement: pay wages (clamped per #2), close the books. The owner advances to the next day no matter what. |
| 4 | Countdown timers in the UI | The top bar shows the in-game time-of-day as a **clock** (e.g. "14:32"), not a timer counting down to anything. There is no progress bar that depletes. |
| 5 | Customer "patience" leading to walkouts | The `customers` table is removed (critique §1.7). Patience exists only as a per-persona constant in `apps/server/src/sim/personas.ts` and only weights the *review tone* design §6 generates. No walkout mechanic, no "customer leaves angrily" sprite. |
| 6 | Cooking timers showing on the canvas | Workers visually animate cooking; there's no on-screen ring that turns red. The order completes when it completes. |
| 7 | Worker firing | `workers` has no `terminated_at`. There is no `DELETE FROM workers` endpoint. Coaching is the only knob — DECISIONS §10.3 enforced at the API layer. |
| 8 | Cleanliness reaching 0 → "health inspector closes you" | `cleanliness` is clamped to `[0,100]` and feeds only into review scoring. No closure event. |
| 9 | Mood reaching 0 → worker quits | `mood` is clamped to `[0,100]`. Low mood reduces skill effectiveness but never removes the worker. |
| 10 | Leaderboard ranking creating ranked anxiety | Top 10 only (critique §2.8, design §10.5). Sort by RollingScore (forgiving 7-day window). Owner's own rank position is **never** displayed; their own score appears elsewhere as a personal metric, not a ladder. |
| 11 | Polling cadence dropping connection → "you missed time" | The sim runs server-side regardless of client polling. If the browser tab is hidden the client pauses *polling* but not the world. Time passing offline is fine — the next snapshot just shows progress. |
| 12 | Backend tick falling behind on slow machines | The tick uses a fixed-step accumulator. If the loop runs late, it catches up by advancing multiple steps. No real-world consequence — cozy game. |
| 13 | Save corruption / lost progress as a soft fail | WAL mode + per-event transactions + every-5-tick flush of soft state. Crash-recovery point is at worst 5 in-game seconds lost. |
| 14 | "You can't afford to unlock this recipe" framed as failure | Endpoint #16 returns a `cannot_afford` error code; UI renders it as "Earn $X more to unlock" — informational, not punitive. |
| 15 | Dev-mode reset endpoint accidentally callable in prod | `/api/dev/*` is only mounted when `NODE_ENV === 'development'`. |

---

## 10. Open questions — RESOLVED by Phase-2 critique

All five Phase-1 open questions are now answered (see `docs/critique.md` §6). Summary:

1. **Customer arrival rate by reputation** → base λ from design §5.1 × `(0.6 + 0.7·rep/100)`, so rep=50→0.95×, rep=90→1.23×, rep=10→0.67×. Clamped to `[0.6× .. 1.3×]`.
2. **Coaching effect magnitudes** → design §4.3 specifies XP/mood deltas per preset; one_on_one deltas in §4.4. Use those.
3. **Leaderboard visibility** → top 10 only, sort by `rolling_score`, **never** show "you are rank #N". (Design §10.5.)
4. **Worker hiring cap & cost curve** → MVP cap = 4 workers (1 starter + 3 hires). Hire prices: $100, $150, $250 for hires 2/3/4. Wage stays $40/day.
5. **Mock-fallback review tone** → design §6.3 expands phrase banks to 8 variants per bank + 6 openers/closers per persona (~3,000 unique-feeling reviews, enough for ~60 in-game days).

---

## 11. Asset pipeline (critique §5.4)

The research agent picked **Kenney Restaurant Kit (2D)** + **Kenney Toon Characters 1.0**, both CC0. Beach background is drawn procedurally on Canvas (no third asset pack needed).

### 11.1 Where assets live
```
apps/web/public/sprites/
  ├── restaurant-kit/        ← Kenney Restaurant Kit (2D) PNGs (committed, ~15 MB)
  └── toon-characters/       ← Kenney Toon Characters 1.0 PNGs (committed, ~12 MB)
```

Both packs are committed to the repo (no download script at runtime).

### 11.2 Sprite atlas
`apps/web/src/canvas/sprites/atlas.ts` is hand-written:

```ts
export const ATLAS = {
  worker_chef_blond_idle:   { src: 'toon-characters/character_blond_chef.png',   x: 0,  y: 0,  w: 64, h: 64 },
  worker_chef_brown_idle:   { src: 'toon-characters/character_brown_chef.png',   x: 0,  y: 0,  w: 64, h: 64 },
  customer_beach_bum_idle:  { src: 'toon-characters/character_surfer.png',       x: 0,  y: 0,  w: 64, h: 64 },
  // …one entry per portrait_id used in seed data and personas.ts
  station_grill:            { src: 'restaurant-kit/grill.png',                   x: 0,  y: 0,  w: 96, h: 96 },
  station_fryer:            { src: 'restaurant-kit/fryer.png',                   x: 0,  y: 0,  w: 96, h: 96 },
  // …etc.
} as const;
export type SpriteKey = keyof typeof ATLAS;
```

### 11.3 portrait_id → atlas key
The string in `workers.portrait_id` and `orders.customer_portrait_id` is exactly a `SpriteKey`. No translation layer. Seed data uses `worker_chef_blond_idle` as starter Alex's portrait.

### 11.4 Validation script
`apps/web/scripts/verify-assets.ts` (run in `prebuild` and CI smoke-check):
- Walks every seed-data `portrait_id` and every persona's portrait reference.
- Asserts each is a key in `ATLAS`.
- Asserts the referenced PNG file exists in `public/sprites/`.
- Exits non-zero on mismatch.

### 11.5 Loading
`apps/web/src/canvas/sprites/loader.ts` lazy-loads PNGs via `new Image()` keyed by `src`. A single shared cache `Map<string, HTMLImageElement>` avoids re-decoding. The canvas render loop draws from `ATLAS[key]` with `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)`.

---

*End of architecture.md.*
