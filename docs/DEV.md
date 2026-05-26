# 🧑‍💻 Kitchen Rush — Developer Guide

How the code is organized, where to add things, and how to not break the game while you do.

---

## Stack at a glance

| Layer | Tech |
|-------|------|
| Web frontend | React 18 + Vite + Tailwind CSS + HTML5 Canvas |
| Backend API | Node 20 + Express 4 |
| Persistence | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (sync, single-file) |
| Realtime sim | 1 Hz server-side tick loop (`setInterval`), client polls `/api/restaurant/state` |
| AI (optional) | Anthropic Claude API via `@anthropic-ai/sdk`. Heuristic fallback is the default path. |
| Audio | WebAudio API, pure oscillator synthesis. No asset files. |
| Build | npm workspaces, TypeScript composite project references |

No webpack, no Redux, no React Router, no GraphQL, no Docker. Boring on purpose.

---

## Repo map

```
kitchen-rush/
├─ apps/
│  ├─ server/                          Express + sim
│  │  ├─ src/
│  │  │  ├─ index.ts                   Entry — migrations → seed → tick loop → app.listen
│  │  │  ├─ app.ts                     Express factory + middleware + static-serve-in-prod
│  │  │  ├─ config.ts                  Master key + session secret bootstrap
│  │  │  ├─ routes/                    REST endpoints (one file per resource)
│  │  │  │  ├─ auth.ts                   /api/auth/{register,login,logout,me}
│  │  │  │  ├─ restaurant.ts             /api/restaurant/{state,clean}
│  │  │  │  ├─ day.ts                    /api/day/{start,pause,end}
│  │  │  │  ├─ workers.ts                /api/workers/...
│  │  │  │  ├─ menu.ts                   /api/menu/...
│  │  │  │  ├─ reviews.ts                /api/reviews
│  │  │  │  ├─ leaderboard.ts            /api/leaderboard
│  │  │  │  ├─ settings.ts               /api/settings/*
│  │  │  │  └─ dev.ts                    /api/dev/* (NODE_ENV !== production only)
│  │  │  ├─ sim/                       Background simulation
│  │  │  │  ├─ tick.ts                   1 Hz loop, fractional-minute accumulator
│  │  │  │  ├─ customers.ts              Poisson arrivals per in-game hour
│  │  │  │  ├─ orders.ts                 Worker-to-order assignment, cook timers, review gen
│  │  │  │  ├─ workers.ts                Mood decay, XP awards, morning floor
│  │  │  │  ├─ economy.ts                End-of-day wages, cash clamps
│  │  │  │  ├─ leaderboard.ts            Daily score formula → daily_scores rows
│  │  │  │  └─ personas.ts               Customer persona constants + arrival weights
│  │  │  ├─ ai/                        Review generation
│  │  │  │  ├─ reviewScorer.ts           Heuristic 6-dim scoring (default path)
│  │  │  │  ├─ reviewTemplates.ts        Persona-flavored review text
│  │  │  │  ├─ coachReply.ts             Heuristic chat reply (1:1 quiet hours)
│  │  │  │  └─ claudeClient.ts           Optional real Claude SDK wrapper
│  │  │  ├─ db/
│  │  │  │  ├─ connection.ts             SQLite singleton + WAL pragmas; loads schema
│  │  │  │  ├─ schema.sql                CREATE TABLE IF NOT EXISTS for all 11 tables
│  │  │  │  ├─ migrate.ts                Re-runs schema.sql (idempotent)
│  │  │  │  └─ seed.ts                   Inserts 20 recipes + starter menu items
│  │  │  ├─ auth/
│  │  │  │  ├─ cookie.ts                 HMAC-signed session cookie helpers
│  │  │  │  └─ middleware.ts             requireAuth — populates req.user + req.restaurantId
│  │  │  ├─ crypto/
│  │  │  │  └─ aes.ts                    AES-256-GCM for the encrypted Claude API key
│  │  │  └─ util/logger.ts             info/debug/warn/error with timestamps
│  │  └─ tsconfig.json                Composite project → references packages/shared
│  │
│  └─ web/                             React + canvas
│     ├─ src/
│     │  ├─ main.tsx                   ReactDOM.createRoot
│     │  ├─ App.tsx                    Auth router + RestaurantStateContext + all modals
│     │  ├─ canvas/
│     │  │  ├─ Scene.tsx                 Top-level canvas component; RAF loop; click handler
│     │  │  ├─ dayNight.ts               Color gradient lerped over in-game minute
│     │  │  ├─ render/
│     │  │  │  ├─ drawBeach.ts             Sky + ocean + shimmer particles
│     │  │  │  ├─ drawShop.ts              Floor, stations, tables, walls. Exports SHOP_LAYOUT.
│     │  │  │  ├─ drawWorkers.ts           Cute chef cartoons + speech bubble + mood emoji
│     │  │  │  ├─ drawCustomers.ts         6 persona cartoons + phase animation + mood emoji
│     │  │  │  └─ drawDayNightOverlay.ts   Tinted overlay applied on top of everything
│     │  │  └─ sprites/                  Legacy sprite atlas + loader (currently unused by render)
│     │  ├─ ui/
│     │  │  ├─ TopBar.tsx                Emoji icon row + status chips + cash-delta animation
│     │  │  ├─ LoginScreen.tsx           Username-only login (auto-register on 404)
│     │  │  ├─ WelcomeModal.tsx          First-run "what is this game" card (re-open via ?)
│     │  │  ├─ OnboardingToasts.tsx      Timed in-game tips for new players
│     │  │  ├─ HirePanel.tsx             Modal: 3 candidates, suggested station, hire button
│     │  │  ├─ MenuPanel.tsx             Modal: unlocked items + recipes to unlock
│     │  │  ├─ ReviewsPanel.tsx          Modal: paginated list of reviews
│     │  │  ├─ LeaderboardPanel.tsx      Modal: top 10 rolling-scores
│     │  │  ├─ SettingsModal.tsx         Modal: API key + sound toggle
│     │  │  ├─ CoachingModal.tsx         Modal: 6 preset coaching phrases with cooldowns
│     │  │  ├─ OneOnOneModal.tsx         Modal: quiet-hours conversation (3 choices)
│     │  │  ├─ DaySummaryModal.tsx       Modal: end-of-day stats
│     │  │  ├─ WorkerPanel.tsx           Right-side collapsible team list
│     │  │  ├─ StatsPanel.tsx            Modal: full team + tables dashboard
│     │  │  ├─ InspectCustomerModal.tsx  Modal: tap customer → name/mood/order/Q&A
│     │  │  └─ ReviewFlash.tsx           Full-screen gold/silver/blue halo when a review lands
│     │  ├─ audio/sfx.ts               WebAudio synthesis + mute toggle (localStorage)
│     │  ├─ state/store.ts             Tiny pub/sub store for UI modal state
│     │  ├─ hooks/
│     │  │  ├─ useAuth.ts                Auth context provider
│     │  │  └─ usePollingState.ts        Polls /api/restaurant/state with ETag, varies cadence
│     │  ├─ api/
│     │  │  ├─ client.ts                 apiFetch wrapper, ApiError, 304 handling
│     │  │  └─ endpoints.ts              Typed wrappers around every REST endpoint
│     │  └─ styles/index.css           Tailwind base + custom utilities (no-scrollbar, safe-area)
│     ├─ public/sprites/             Placeholder PNGs (mostly unused — render is canvas-drawn)
│     ├─ scripts/
│     │  ├─ verify-assets.ts            Prebuild: asserts every atlas key has a matching PNG
│     │  └─ generate-placeholder-sprites.mjs   One-off generator (no need to re-run)
│     ├─ index.html                  Vite entry
│     ├─ tailwind.config.ts          Cozy palette + floatUp/fadeInDown keyframes
│     └─ vite.config.ts              Proxies /api → localhost:4000 in dev
│
├─ packages/
│  └─ shared/                        TypeScript-only — types both server and web import
│     └─ src/
│        ├─ domain.ts                Restaurant, Worker, Order, Review, Persona, ...
│        ├─ scoring.ts               SixScores + meanScore helper
│        ├─ api.ts                   Every request/response DTO
│        └─ index.ts                 Barrel
│
├─ docs/
│  ├─ design.md                      Original game design
│  ├─ architecture.md                API contracts + data flow
│  ├─ PLAY.md                        Player guide
│  ├─ DEPLOY.md                      Mac service install
│  ├─ DEV.md                         You are here
│  ├─ ux-audit.md                    UX research findings (from a UXR agent pass)
│  └─ gd-review.md                   Game-design review (from a game-designer agent pass)
│
├─ DECISIONS.md                     What's in, what's out, why
├─ run.zsh                          Dev / prod / build / service dispatcher
├─ package.json                     Workspace root
└─ tsconfig.base.json               Strict TS settings shared by all workspaces
```

---

## Running locally

```bash
./run.zsh dev          # hot-reload, two ports (server :4000, web :5173)
./run.zsh build        # build shared → server → web
./run.zsh prod         # single-port production
./run.zsh status       # what's running?
./run.zsh stop         # kill local processes
```

Or directly via npm:

```bash
npm install            # install all workspace deps
npm run dev            # concurrently runs server + vite
npm run build          # full prod build
npm run typecheck      # tsc -b every workspace
npm run seed           # seed recipes (idempotent)
npm run reset          # wipe DB + re-seed
```

---

## How the data flows

```
[client polls every 1s] → GET /api/restaurant/state
                           ↓
                       app.ts (Express)
                           ↓
                       requireAuth middleware
                           ↓
                       routes/restaurant.ts
                           ↓
                       SQLite SELECTs
                           ↓
                       returns RestaurantState JSON
                           ↓
[client] React state → Scene canvas + all panels re-render
```

In parallel, on the server:

```
[tick every 1s] → sim/tick.ts
                    ↓
                    advances in_game_minute by 4.8
                    ↓
                    on hour change: sim/customers.ts → schedules Poisson arrivals (setTimeout)
                    ↓
                    on each tick: sim/orders.ts → assignPendingOrders + completeCookedOrders
                                              ↓
                                              when order completes → reviewScorer + reviewTemplates
                                                                    → INSERT INTO reviews
                                                                    → UPDATE cash + reputation
                    ↓
                    on day rollover (in_game_minute > 1440):
                                              → sim/leaderboard.computeDayEnd
                                              → sim/economy.settleEndOfDay (pay wages)
                                              → sim/workers.applyMorningMoodFloor
```

The whole loop is in-memory + SQLite. No queue, no Redis, no worker process.

---

## How to add a feature

### Add a new modal (e.g. "Coupons")

1. **Create the component** `apps/web/src/ui/CouponsModal.tsx`. Copy `HirePanel.tsx` as a template.
2. **Add to the modal union** in `apps/web/src/state/store.ts`:
   ```ts
   type ModalName = ... | 'coupons' | null;
   ```
3. **Mount it** in `App.tsx`:
   ```tsx
   import CouponsModal from './ui/CouponsModal';
   ...
   <CouponsModal />
   ```
4. **Add a TopBar button** in `TopBar.tsx`:
   ```tsx
   <EmojiBtn emoji="🎟️" title="Coupons" ariaLabel="..." onClick={() => store.openModal('coupons')} />
   ```

### Add a new REST endpoint

1. **DTO** in `packages/shared/src/api.ts`:
   ```ts
   export interface MyThingResponse { ... }
   ```
2. **Route** in `apps/server/src/routes/` (new file or existing):
   ```ts
   router.get('/my-thing', requireAuth, (req, res) => {
     const restId = req.restaurantId!;
     // ...
     res.json({ ... } satisfies MyThingResponse);
   });
   ```
3. **Mount** it in `apps/server/src/app.ts`:
   ```ts
   app.use('/api/my-thing', myThingRouter);
   ```
4. **Typed client wrapper** in `apps/web/src/api/endpoints.ts`:
   ```ts
   export async function getMyThing() {
     return apiFetch<MyThingResponse>('/api/my-thing');
   }
   ```

### Add a new customer persona

1. Add it to the `Persona` union in `packages/shared/src/domain.ts`.
2. Add a `SCHEMA CHECK` row in `apps/server/src/db/schema.sql` (the orders/customer_archetype check).
3. Define it in `apps/server/src/sim/personas.ts` (name pool, tipPct, preferred items, portrait pool, spawn weights).
4. Draw it in `apps/web/src/canvas/render/drawCustomers.ts`.
5. Add the emoji + label in `apps/web/src/ui/InspectCustomerModal.tsx` and `StatsPanel.tsx` (PERSONA_EMOJI maps).
6. Add a phrase bank in `apps/server/src/ai/reviewTemplates.ts`.

### Add a new sound effect

1. Add the name to `SfxName` and a recipe to `RECIPES` in `apps/web/src/audio/sfx.ts`.
2. Call `playSfx('myname')` wherever the moment happens.

That's it — no asset pipeline, no loader.

---

## Code style notes

- **No comments unless the *why* is non-obvious.** Function names should be self-documenting.
- **No "// added by Claude" / "// fixed for X" comments.** Commit messages own that history.
- **`noUncheckedIndexedAccess` is on** — every `arr[i]` is `T | undefined`. Use `??` defaults or `!` non-null assertions when you're sure.
- **No `any`.** Use `unknown` and narrow.
- **Server returns snake_case** (matches DB columns), shared DTO types preserve that. The client doesn't transform — it reads `restaurant.in_game_minute` directly.
- **Tailwind is the styling layer.** No CSS-in-JS, no styled-components. Custom utilities go in `styles/index.css`.
- **Canvas drawing is pure functions** — they take a `ctx`, `timeMs`, and state. No internal mutable state except the small `seatAssignments` map.
- **Modals are unconditionally mounted** but render `null` when not open. Avoids mount-unmount jank.

---

## Testing

There's no automated test suite yet. PRs adding tests are very welcome — suggested approach:

- **Server unit tests**: Vitest + an in-memory SQLite (just `:memory:` connection string).
- **Web component tests**: Vitest + React Testing Library. The canvas itself doesn't lend to unit tests — assertions live in modals.
- **E2E**: Playwright against `./run.zsh prod` would be ideal.

For now, **manual smoke testing**:

```bash
./run.zsh dev
# in browser:
#   1. Register a fresh username
#   2. Watch a customer arrive
#   3. Tap a cook → coach with Praise → speech bubble + mood up
#   4. Tap a customer table → modal with persona + Q&A
#   5. Hire a 2nd cook from TopBar
#   6. Unlock a new menu item
#   7. Wait for a review to drop → halo + chime
#   8. Open Stats panel → see whole shop
#   9. Open Settings → mute sound → re-tap a button → silent
#  10. Resize browser to ~390px → confirm canvas + UI fits
```

Both `npm run typecheck` and `./run.zsh build` should pass clean before any PR.

---

## Cleaning up your local data

```bash
npm run reset          # wipe SQLite, re-seed recipes only
rm -rf node_modules    # clean install
rm -rf apps/*/dist     # force rebuild
```

---

## Common pitfalls

| You did | What goes wrong | Fix |
|---------|-----------------|-----|
| Added a `db.prepare()` at module top-level | Module loads before migrations run; "no such table" | Move it inside the function body |
| Edited `schema.sql` for an existing column | Schema is `IF NOT EXISTS`; existing DBs don't pick up changes | Either bump a migration file or `npm run reset` your local DB |
| Added a new field to `RestaurantState` | Client crashes on `undefined` access for already-running games | Default-coalesce on the client (`state?.foo ?? defaultValue`) |
| Used `setInterval` for a UI poll | Overlapping requests when slow | Use the `usePollingState` setTimeout chain pattern |
| Imported `@kitchen-rush/shared/foo` without building shared | "Cannot find module" in CI | Use the `/foo` subpath exports defined in `packages/shared/package.json` (works without build) OR run `npm run build:shared` once |

---

## Architecture decisions

See [DECISIONS.md](../DECISIONS.md) for the full list. Highlights:

- **No fail-states** — no walkouts, no firing, no timers. The game is cozy by contract.
- **Server-authoritative** — the canvas is a view, not a game. All state lives in SQLite + a 1Hz tick loop.
- **Heuristic by default** — the Claude API is opt-in via Settings. The game must be fun without a key.
- **Polling, not WebSockets** — simpler, kid-friendly across iPad sleeps, and the state is small.
- **Username-only auth** — no passwords. Anyone on the LAN who knows a username can play that account. Acceptable for home use.

---

## Useful one-liners

```bash
# What's in the database?
sqlite3 apps/server/data/kitchen-rush.sqlite '.tables'
sqlite3 apps/server/data/kitchen-rush.sqlite 'SELECT * FROM workers'

# Reset just the reviews
sqlite3 apps/server/data/kitchen-rush.sqlite 'DELETE FROM reviews'

# Skip 10 in-game days (dev only)
curl -X POST http://localhost:4000/api/dev/advance-days \
  -H 'Content-Type: application/json' \
  -d '{"count":10}' -b /tmp/kr.txt

# Watch live tick logs
./run.zsh dev | grep -E "tick|customer|review"
```

---

## Where to ask for help

- Open an [issue on GitHub](../..) with what you tried and what happened.
- Tag PRs with `[bug]` / `[feature]` / `[docs]` for triage.
- For game-design discussions, prefer issues over PRs so we can sketch before coding.

Happy hacking. 🌊
