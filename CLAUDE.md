# Working on Kitchen Rush

This file is the **5-minute loadout** for any Claude (Code, Claude.ai, etc.) opening this repo. The goal is for you to start contributing without re-deriving the architecture from scratch — that wastes the contributor's tokens and their patience.

If something here disagrees with the rest of the docs, the docs win. Update this file when you find that drift.

---

## What this project is

A cozy beachfront restaurant game for kids. Customers arrive, NPC cooks make food, reviews drop. The player hires, coaches, and prices — that's all. **No fail-states. No timers. No walkouts.** This is the genre contract, not just a default.

Runs as a Node + Express backend with a 1 Hz tick loop + SQLite, and a React + Canvas frontend that polls `/api/restaurant/state`. Single repo, npm workspaces. Mac LAN service via launchd for always-on iPad play.

---

## Read these first (in order, with stop conditions)

1. **`README.md`** — full picture in ~3 min. Read it.
2. **`docs/DEV.md`** — the source of truth for file layout and "how to add X" recipes. **Always start here when planning a code change.**
3. **`DECISIONS.md`** — read when you're about to change game rules, add scarcity, add timers, add walkouts, or "make it more challenging" (don't).
4. **`docs/PLAY.md`** — read only if you've never seen the game and need to understand the player experience.
5. **`docs/DEPLOY.md`** — read only when touching `run.zsh`, the LaunchAgent plist, or production config.

**Don't read** `node_modules/`, `apps/*/dist/`, `apps/server/data/`, `packages/shared/dist/`, or `sandbox/` (the last is a dead prototype kept for history).

---

## Hard invariants

Violate these and you've broken the design, not just a feature.

1. **No fail-states.** Customers never walk out. Cooks never quit. Cash floors at $0. Cleanliness floors at 0 but doesn't end the day. If you're tempted to add a timer or "you lose if…" — read `DECISIONS.md` first, then talk to the user.
2. **Server is authoritative.** Client polls + renders. Never let the client mutate game state directly. The canvas is a view, not a model.
3. **No PNG sprite art for characters/stations.** Everything in `apps/web/src/canvas/render/*` draws via canvas primitives (`ctx.fillRect`, `ctx.arc`, etc.). The placeholder PNGs in `public/sprites/` exist but the renderer ignores them. Adding sprites is a Phase-2 art task, not a casual change.
4. **Heuristic review scoring is the default path.** Claude API is optional, opt-in via Settings → API key. The game must be fun without an API key.
5. **Kid-friendly tuning.** Scores floor at 20–30 per dimension, mood decays slowly, morning floor is 65. Don't make the math more punishing.
6. **GPLv3** — derivatives must stay open. Don't add proprietary deps that can't be redistributed.
7. **Never commit secrets.** `.env`, `master.key`, `*.sqlite*`, and `.claude/settings.local.json` are gitignored — keep them that way.
8. **Touch-friendly.** Minimum 44×44 hit targets. Test new UI at iPhone Safari width (~390px).

---

## Common gotchas (where Claude usually trips)

| You did this | What breaks | Fix |
|---|---|---|
| `const stmt = db.prepare(...)` at module top level | Throws "no such table" in production (module loads before migrations) | Move the `prepare()` inside the function body |
| Edited `apps/server/src/db/schema.sql` for an existing column | Schema uses `IF NOT EXISTS`, won't update existing DBs | `./run.zsh stop && rm apps/server/data/*.sqlite* && ./run.zsh dev` to reset, or write a migration step |
| Added `apps/server/src/db/foo.json` you read at runtime | Not copied to `dist/` by tsc | Add to the server's `build` script in `apps/server/package.json` (see how `schema.sql` is copied) |
| Imported from `@kitchen-rush/shared` in a new file | Works in dev, fails in prod | Make sure `packages/shared/dist/` is built; the package's `exports` resolves to dist in prod |
| Used Math.random()-indexed access without `??` | TS error under `noUncheckedIndexedAccess` | `arr[Math.floor(Math.random()*arr.length)] ?? fallback` |
| Added a `setInterval` for polling in React | Overlapping requests, memory leaks | Use the `setTimeout` chain pattern in `apps/web/src/hooks/usePollingState.ts` |
| Bumped Claude API model name | Anthropic API may not recognize it | Keep model names in one place (`apps/server/src/ai/claudeClient.ts`), test with a real key |

---

## Where to start by intent

| Your goal | Start here |
|---|---|
| Fix a typo or copy edit | Search via `grep -rn "the exact phrase"` then `Edit` |
| Add a new TopBar button + modal | `docs/DEV.md` §"How to add a feature → Add a new modal" |
| Add a REST endpoint | `docs/DEV.md` §"How to add a feature → Add a new REST endpoint" |
| Add a customer persona | `docs/DEV.md` §"How to add a feature → Add a new customer persona" |
| Add a sound effect | Edit `apps/web/src/audio/sfx.ts`, call `playSfx('newName')` where the event fires |
| Change game balance numbers | Look in `apps/server/src/sim/` — `workers.ts` for mood, `orders.ts` for cook timing, `economy.ts` for wages |
| Tweak the review heuristic | `apps/server/src/ai/reviewScorer.ts` (math) + `reviewTemplates.ts` (text) |
| Redesign a modal visually | The modal lives in `apps/web/src/ui/*.tsx`. Reference `HirePanel.tsx` as the canonical pattern. |
| Draw something new on canvas | `apps/web/src/canvas/render/draw*.ts` — pure functions taking `(ctx, timeMs, state)` |

---

## Commands cheatsheet

```bash
./run.zsh dev          # hot-reload, two ports (server :4000, web :5173)
./run.zsh build        # build shared → server → web
./run.zsh prod         # single-port :5050, served-from-dist
./run.zsh status       # what's running locally
./run.zsh stop         # kill local processes

npx tsc -p apps/web/tsconfig.json       # typecheck web only
npx tsc -p apps/server/tsconfig.json    # typecheck server only
npm run typecheck                        # everything via tsc -b
```

A code change is **not done** until `npm run typecheck` passes clean.

For UI work, smoke-test in the browser at `http://localhost:5173` (dev) AT iPhone width (~390px) AND tablet width.

---

## How to verify a change works

Pick at least one path that matches the change:

- **Backend logic change** → restart dev, hit `curl -s http://localhost:4000/api/restaurant/state | python3 -m json.tool` and inspect.
- **Review text/scoring** → `curl 'http://localhost:4000/api/reviews?limit=5'` after a few in-game minutes of play.
- **UI change** → open the running site in a browser, click through. State updates polling each second.
- **Sim balance change** → use `/api/dev/advance-days` (POST `{"count":10,"withReviews":true}`) to fast-forward.

---

## Working with subagents

This project is small enough that most changes don't need a subagent. Spawn one only for:
- **Visual overhauls** across many canvas files (parallelize draw* file rewrites)
- **UX audits** of new modals (use the project's `game-designer` agent — see `.claude/agents/`)
- **Multi-area refactors** that span server + web + shared

For a single-file fix, just edit it. Don't spawn an agent for things you can do in 2 tool calls.

---

## Things contributors get wrong (recurring)

- **Adding "stress" mechanics** — read DECISIONS.md before this. The genre is cozy.
- **Reordering hardcoded `Persona` union** — breaks the SQLite check constraint on `orders.customer_archetype`. Add at the end if new, never reorder.
- **Renaming files that are imported in many places** — use a single `Edit replace_all: true` per file rather than scattering, AND update `tsconfig.json` paths/references.
- **Forgetting `--conditions=development` for tsx watch** — the server dev script handles it; if you create a new `tsx` invocation, include it or you'll silently load stale compiled dist.
- **Committing `apps/web/.env`** — it's gitignored, but `git add -A` will warn if it's tracked. The auto-generated file is local-only.

---

## When in doubt

- **Design choice**: read DECISIONS.md, then ask the maintainer.
- **API contract**: check `packages/shared/src/api.ts` — it's the typed source of truth.
- **Sim behavior**: check `apps/server/src/sim/*.ts` for the actual implementation, not the docs.
- **Anything else**: trace it from a known entry (`apps/server/src/index.ts` for backend, `apps/web/src/main.tsx` for frontend).
