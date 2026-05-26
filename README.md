# 🏖️ Kitchen Rush

> *A cozy beachfront restaurant game for kids and grown-ups. No timers, no fail-states, no rush.*

Customers stroll in, your cooks make food, reviews trickle in at night. You hire, coach, and price — that's it. It runs on any Mac as a one-line LAN service so kids can play on iPad, iPhone, or any browser on the home Wi‑Fi.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org/)
[![Mac LAN service](https://img.shields.io/badge/runs%20as-macOS%20LaunchAgent-orange)](./docs/DEPLOY.md)

---

## Why this exists

I built this for my kids to play on the iPad. It needed to be:

- **Calm.** No "your customer walked out!" panic. No timers. Cooks don't quit.
- **One‑tap to play.** Kid opens Safari, taps a bookmark, game's there.
- **Open.** Any parent, kid, or dev can clone, run, hack on it.

The result is a small Node/React monorepo with a canvas restaurant, cute cartoon chefs, a coaching loop, and a heuristic review scorer. It optionally talks to the [Anthropic Claude API](https://www.anthropic.com/claude) for richer reviews, but the heuristic alone plays great.

---

## Quickstart

You'll need **Node 20+** and **npm**. On Mac, `brew install node` is the easiest path.

```bash
git clone https://github.com/<your-handle>/kitchen-rush.git
cd kitchen-rush
./run.zsh dev
```

Now open **http://localhost:5173** on the Mac, or **http://&lt;your-mac-ip&gt;:5173** from an iPad/phone on the same Wi‑Fi.

That's it. Pick a username on the login screen — it auto-creates the account.

---

## Run as a Mac service (auto‑start, no terminal needed)

For the "kids tap the iPad whenever, the game is always there" experience:

```bash
./run.zsh service install
```

This installs a **LaunchAgent** that:

- Auto-starts at login
- Runs the built game on a single port (default `5050`)
- Restarts itself if it crashes
- Writes logs to `~/Library/Logs/kitchen-rush.{out,err}.log`

After install, the LAN URL is `http://<your-mac-ip>:5050` — bookmark it on every iPad.

Full service commands:

```bash
./run.zsh service install      # install + start (auto-runs at login)
./run.zsh service status       # is it running?
./run.zsh service logs         # tail the service logs
./run.zsh service restart      # bounce it
./run.zsh service stop         # halt without uninstalling
./run.zsh service uninstall    # remove the LaunchAgent
```

Override the port with `KR_PORT=8080 ./run.zsh service install`.

More detail: **[docs/DEPLOY.md](./docs/DEPLOY.md)**

---

## How to play

The 60-second pitch:

1. **Customers arrive on their own.** Your job is the *shop*, not the cooking line.
2. **Tap a cook on the canvas** to coach them — *Praise* boosts mood, *Try again* nudges skill.
3. **Tap a customer at a table** to see who they are, what they ordered, their mood, and answer a friendly question they asked you.
4. **Hire / Menu / Reviews / Stats** live in the top bar.
5. Each in-game day is ~5 real minutes. **Reviews score 6 things** (taste, cleanliness, seating, service, vibe, timing) — better day = better reputation = more customers tomorrow.

Full guide for parents and kids: **[docs/PLAY.md](./docs/PLAY.md)**

---

## What you do vs what you don't

| You do                              | You don't                          |
|-------------------------------------|------------------------------------|
| Hire and assign cooks               | Cook food yourself                 |
| Set menu prices, unlock new recipes | Wait for individual orders         |
| Coach cooks (presets + 1:1 chats)   | Fire anyone                        |
| Clean the floor                     | Manage stock or supplies           |
| Watch reviews come in               | Suffer "your customer walked out!" |
| Pause whenever                      | Race a timer                       |

No fail-states. No walkouts. No scarcity. This is by design — see [DECISIONS.md](./DECISIONS.md).

---

## What's inside

```
kitchen-rush/
├─ apps/
│  ├─ server/                 Express + SQLite + sim tick loop (Node 20)
│  │  └─ src/
│  │     ├─ routes/           REST API: auth, restaurant, day, workers, menu, ...
│  │     ├─ sim/              Tick loop, customer arrivals, order assignment, economy
│  │     ├─ ai/               Heuristic review scorer + (optional) Claude API path
│  │     ├─ db/               SQLite schema + migrations + seed
│  │     └─ crypto/           API-key encryption (AES-256-GCM)
│  └─ web/                    React + Vite + Tailwind + HTML5 Canvas
│     └─ src/
│        ├─ canvas/           Cartoon characters & restaurant rendered via canvas primitives
│        ├─ ui/               Modals: Hire, Menu, Reviews, Stats, InspectCustomer, ...
│        ├─ audio/            WebAudio synthesized SFX (coin, chime, bell, cheer, ...)
│        ├─ hooks/            useAuth, usePollingState
│        ├─ state/            Tiny Zustand-inspired UI store
│        └─ api/              Typed REST client
├─ packages/
│  └─ shared/                 TypeScript types shared between server + web
├─ docs/
│  ├─ design.md               The game design doc
│  ├─ architecture.md         API contracts + data flow
│  ├─ PLAY.md                 Player guide for parents/kids
│  ├─ DEPLOY.md               Mac service install + LAN setup
│  ├─ DEV.md                  Developer guide
│  ├─ ux-audit.md             UX research findings
│  └─ gd-review.md            Game-design review
├─ DECISIONS.md               Architectural choices + tradeoffs
├─ run.zsh                    Run dispatcher (dev / prod / service)
└─ LICENSE                    GPLv3
```

---

## Developing

```bash
./run.zsh dev          # hot-reload, two ports
./run.zsh build        # build everything
./run.zsh prod         # single-port production
./run.zsh status       # what's running?
./run.zsh stop         # kill local processes
./run.zsh update       # git pull + rebuild + restart service
```

Inside `apps/web/` you've got Vite, React 18, Tailwind. Inside `apps/server/` you've got Express, better-sqlite3, and a 1 Hz tick loop. Both compile cleanly with `npx tsc -p tsconfig.json`.

Full dev guide: **[docs/DEV.md](./docs/DEV.md)** — repo map, where to add a feature, code-style notes.

---

## Optional: Claude AI reviews

Reviews work great with the built-in heuristic. If you want livelier text and richer scoring, drop an [Anthropic API key](https://console.anthropic.com/) into **Settings → Claude API Key** inside the game. It's stored encrypted at rest (AES‑256‑GCM, per-user master key). The game falls back to heuristic on any error.

---

## Contributing

PRs and issues welcome. The repo is GPLv3 — anything you build on top of this stays open-source too.

Before opening a PR:
- `npm run typecheck` should be clean.
- For UI changes, smoke-test on iPhone Safari (~390px viewport) and iPad (~810px).
- Read [docs/DEV.md](./docs/DEV.md) for the file-by-file map.

---

## License

[GPLv3](./LICENSE). Use it, fork it, ship it — keep your derivatives open.

Built on a beach. 🌊
