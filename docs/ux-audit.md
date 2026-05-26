# Kitchen Rush — UX Audit (first-play, new gamer)

**Auditor:** UXR pass
**Datum:** A non-developer opened the game and said: *"I don't understand what it is."*
**Method:** Read the actual code paths a brand-new account hits — login → empty scene → first toast → first customer arrives — and compared the realized UI against what `docs/design.md` says the player is supposed to do.

This audit names broken interactions. It is not a brand critique, not a copy pass, and not a redesign. The next agent does code; this agent points fingers.

---

## TL;DR — Top 5 must-fix items

1. **The game never tells the player what they're trying to do.** The login tagline says "Running your beachfront shop on your own time. Cozy, calm, no rush." That's a *vibe statement*, not a *goal*. There is no "you are the owner, your job is to coach workers and set prices so customers leave good reviews" anywhere. The four onboarding toasts (`apps/web/src/ui/OnboardingToasts.tsx:22-43`) describe mechanics ("click Alex to coach") with zero framing of why coaching matters or what a "good day" looks like. **Fix:** add a one-screen "what you do here" card before or alongside the first toast — three bullets: (1) customers arrive, your cooks make food, (2) you coach cooks and price the menu, (3) reviews score you on 6 things at night. Player can dismiss but it lives behind a "?" button in the TopBar.

2. **The canvas is non-interactive, but the tutorial says to click it.** Toast #3 says "Click Alex any time to coach them." Toast #4 points at customers. The Scene component (`apps/web/src/canvas/Scene.tsx`) attaches **zero click handlers** — no `onClick` on the `<canvas>` element (line 128-136), no hit-testing in `drawWorkers.ts` or `drawCustomers.ts`. The player follows the instruction, clicks Alex, nothing happens, concludes the game is broken or that they misread the tip. The only path to coach is via the TEAM sidebar on the right. **Fix:** wire a click handler on the canvas, hit-test against worker positions in `drawWorkers.ts` (positions are already in `STATION_POSITIONS`), call `store.openCoaching(worker.id)`. Same for the design-promised "click empty floor to walk," "click station to clean," "click customer to greet" — none exist.

3. **The TopBar is eight identical small icons with no labels and no spatial grouping.** `apps/web/src/ui/TopBar.tsx:110-222` renders eight `<svg class="w-4 h-4">` buttons in a row: broom, person-plus, envelope, clipboard, bars, pause, cog, exit. They share one `iconBtn` class (line 70-71), are 16×16px, dim gray, and only differ on hover-title. A new gamer cannot identify the **Menu** (clipboard) or **Reviews** (envelope) from inspection — both look like generic document icons. The broom for "Clean" reads as "delete" or "tools." There is no label, no separator between read-actions (Reviews, Leaderboard, Menu) and write-actions (Clean, Hire, Pause, Settings, Logout). **Fix:** add visible text labels below or beside icons at default zoom, OR group with separators and at least slightly larger hit targets (current `p-1.5` + 16px icon = ~28px button, well below the 44px mobile-tap recommendation). The four primary nouns (Reviews, Menu, Hire, Clean) deserve text. Pause/Settings/Logout can stay icon-only.

4. **The starting scene visually communicates "loading" or "broken," not "your shop."** At T+0 on day 1, the player sees: a 960×600 canvas, a beige floor with grid lines, four colored rectangles labeled "Counter / Grill / Fryer / Drinks" along the back wall (per `drawShop.ts` because sprite PNGs aren't matching → `FALLBACK_COLORS` at lines 81-91 are the actual visuals shipping), two brown rectangles for tables, "Entrance" text in the corner, no workers yet (Alex "arrives at 8 AM"), no customers, and the italic Georgia-serif text "The shop is quiet..." pulsing at center (`Scene.tsx:177-187`). A user who didn't read the design doc sees pulsing "shop is quiet" text and concludes the game is loading or hasn't started. **Fix:** either ship real sprites or make the fallback rectangles look intentional (rounded corners, inset shadow, station-specific icon glyph inside the rectangle like a flame/fries/cup). And replace "The shop is quiet..." with something less ambiguous — "Opening at 8 AM" or just remove during day-1 onboarding.

5. **There is no answer to "what should I do RIGHT NOW?"** The design doc §8 lists 8 owner activities, all "click-to-trigger." None of them have a UI affordance pulling the player toward the *next sensible action*. The right-panel WorkerPanel lists workers but a new player won't connect "list of workers" with "coaching tool." There's no quest log, no objective, no "first day goal: serve 5 customers." Combined with no fail-state (correctly per DECISIONS §10) and no urgency, a new player has *nothing to do and no hint that anything is theirs to do.* **Fix:** a tiny non-modal "Today's nudge" line below the TopBar that rotates 2-3 contextual suggestions ("Try clicking a worker's row in TEAM to coach them" → "Customers come back — read your first review tonight" → "You can set prices in Menu"). Auto-hides after first interaction. NOT a checklist (that's against the cozy promise) — just a single rotating hint string.

---

## 1. The first-30-seconds problem

**What the player sees on first-ever login:**

1. **Login screen** (`LoginScreen.tsx`). A beach emoji 🏖️, "Kitchen Rush," tagline "Running your beachfront shop on your own time. Cozy, calm, no rush." A username box. "No password needed."
   - **Player understanding so far:** "It's a beach-shop something. No password is weird/refreshing. Let's go."

2. **Loading text "Kitchen Rush…"** (`App.tsx:117`) while polling starts.

3. **The game world appears.** Canvas 960×600 in the center, dim TEAM sidebar collapsed-ish on the right, eight tiny gray icons in the top bar. Toast at top center: **"Welcome. Alex will arrive at 8 AM."** Then 2 seconds later: **"This is your shop. Take a moment to look around."** Then at T+5s: **"Click Alex any time to coach them."** Then at T+12s: **"Customers walk in on their own. No rush — they'll wait."**

**What the player understands so far:**
- "Alex will arrive at 8 AM" — but the clock in the top bar already says 08:00 (or 08:01). So Alex should be there *now*? Where is Alex? There's no person on screen.
  - Actually the server-side day starts in quiet hours or at 8 AM depending on registration timing; the worker sprite renders only when `state.workers` includes them and `is_active`. New-account default has 1 worker (`design.md §2`), so Alex should appear immediately. If they don't (sprite atlas fallback or station-mapping issue), the player has just been told "Alex arrives at 8 AM" and seen no Alex — confusion compounds.

**What the player tries first that fails:**

- **Try 1: Click on the canvas.** Specifically clicks the colored "GRILL" rectangle (largest visible element) or one of the table rectangles or the "Entrance" label or — once a customer appears — the customer circle. **Nothing happens.** Canvas has no click handler.
- **Try 2: Click the colored circle that appeared near the door (a customer).** Nothing happens. The toast said "Customers walk in on their own. No rush" — player interprets this as "I should click to seat them or take their order." Wrong interpretation, but reasonable given the line. Customers auto-route through phases server-side.
- **Try 3: Click one of the top-bar icons.** First instinct: the broom (clean) or the envelope (which they might guess is "mail" or "inbox"). The broom triggers a network call and the cleanliness number ticks up by a vague amount. There's **no visible feedback on the canvas** (no mop animation per design §8, no particle, no "+5" floater). The player has no idea what they just did.
- **Try 4: Read the labels.** They hover over icons; titles show "Clean (boost cleanliness)" / "Hire a cook" / "Reviews" / "Menu" / "Leaderboard." They open Menu — get a list of unlockable recipes ("Spicy Fries $50 / Earn $50 more"). They have $150 starting cash, so they CAN unlock Spicy Fries. But the modal doesn't explain that *unlocking a recipe* adds it to what customers can order. Player closes the modal.
- **Try 5: Click the worker name in the right sidebar.** Finally — the coaching modal opens. Six emoji buttons with quoted phrases. Player clicks "Nice work, keep it up!" gets a feedback string "Friendly praise — Alex heard you." Modal stays open. They click again — button is faded ("Just praised — let it land 🌱"). They close the modal.

**Time spent confused:** about 90 seconds. Then either (a) they spelunk every icon and slowly assemble a mental model, or (b) they say "I don't understand what it is" and quit. The quoted user above stopped at (b).

**Root cause:** the game never positions the player as "the owner who coaches cooks and prices the menu." The toasts give *mechanical* hints ("click Alex") in a vacuum; the canvas doesn't actually accept the clicks the toasts promise; the TopBar is mute; the right sidebar's purpose ("TEAM") is not bridged to action.

---

## 2. Prioritized findings

Format per finding: **Problem.** Where. Why new gamer fails. Concrete fix.

### P0 — these block first-play comprehension

#### P0-1. Canvas is decorative; design doc treats it as the primary interaction surface
- **Where:** `apps/web/src/canvas/Scene.tsx:128-136` — `<canvas>` element has no `onClick`, no `onPointerDown`. `drawWorkers.ts` and `drawCustomers.ts` know exact pixel positions of every entity but never expose hit-testing.
- **Why new gamer fails:** Onboarding toast literally says "Click Alex any time to coach them" (`OnboardingToasts.tsx:34-37`). Player clicks Alex. Nothing. Design.md §8 promises click-worker, click-station-to-clean, click-customer-to-greet, click-empty-floor-to-walk. **None** of these work. The player learns within seconds that the canvas is a TV, not a control surface, but the tutorial told them the opposite.
- **Fix:** add a single canvas click handler. Hit-test worker rects against `STATION_POSITIONS` in `drawWorkers.ts:16-25` (each worker sprite is ~64×64 at position `{x, y}`). On hit: `store.openCoaching(worker.id)`. Defer click-customer-to-greet and click-floor-to-walk to a later pass — but worker click must work because the tutorial promises it.

#### P0-2. Onboarding tells players HOW before WHY
- **Where:** `OnboardingToasts.tsx:22-43`. Four toasts, all mechanical ("click X to do Y"). None say what the player's *goal* is.
- **Why new gamer fails:** A player who has never seen the game has no frame. "Click Alex to coach them" presupposes the player knows (a) Alex is a worker, (b) workers cook, (c) coaching makes them better, (d) better cooks → better reviews → better rep → more customers. None of that is shown.
- **Fix:** add a first-time-only welcome card BEFORE the toast sequence — a small centered card with: "You own this shop. Customers come in and order. Your cooks make the food. At the end of each day, customers leave reviews — your job is to coach the cooks and price the menu so reviews go up. **Take your time — there's no clock running out.**" One button: "Got it." Then the existing toast sequence fires. Keep the "skip tutorial" link.

#### P0-3. TopBar icons are unlabeled, undersized, and indistinguishable
- **Where:** `TopBar.tsx:110-222`. Eight icons, 16px (`w-4 h-4`), all using identical `iconBtn` class (`p-1.5 rounded-lg hover:bg-beach-sand/50 ... text-cozy-dim/70`). The broom icon path (line 121) is a non-standard glyph that, at 16px in gray, reads as "tools" or "trash." The clipboard for Menu and the envelope for Reviews both look like document-y icons.
- **Why new gamer fails:** They cannot scan the bar and form an intent. "Where do I see what people are saying about my shop?" requires hovering each icon. Title attributes work only with mouse + patience; not discoverable on touch.
- **Fix:** the four high-value buttons need text. At desktop width: `[🧹 Clean] [+ Hire] [✉ Reviews] [📋 Menu] [🏆 Leaderboard] | [⏸] [⚙] [⤴]` with the right three as icon-only and a visible vertical separator. Or, less invasive: keep icons but show always-on text labels under each (Apple-toolbar style), small caps. Also: bump hit target to 32×32 minimum (`p-2 w-5 h-5` icon).

#### P0-4. "Score: NN" appears in the top bar with zero context
- **Where:** `TopBar.tsx:102-106`. Renders `Score: {score}` when `state.current_score != null`.
- **Why new gamer fails:** Number with no scale, no trend, no max. Is 65 good? Bad? Out of what? Design §10.1 says it's `DailyScore × 1000`, range 0–1000. The UI doesn't show /1000, doesn't show yesterday, doesn't show direction. A player sees "Score: 65" and thinks "I'm doing badly" (because they instinctively compare to 100) when they may actually be average.
- **Fix:** show `Score: 65 / 1000` OR show a tiny sparkline of last 3 days OR remove from the topbar on day 1 (design §1.43 says it doesn't render until a review exists — make sure that's actually wired). Cheapest fix: add the "/1000" denominator.

#### P0-5. Cleanliness chip is a number with a soap emoji and no semantics
- **Where:** `TopBar.tsx:94-101`. Renders `🧼 44` where 44 turns yellow at 40-69 and red below 40.
- **Why new gamer fails:** Player has no idea what cleanliness affects, what range it's on, or whether 44 is alarming. The color shifts to red below 40 (design §1.37 says decay is gentle and never urgent), but visually red triggers alarm. The broom icon-button alongside is the intended fix but isn't linked perceptually.
- **Fix:** make the cleanliness chip itself a button — click it to clean. Add `/100` to the value. Soften the red threshold or use amber instead of red.

#### P0-6. The "shop is quiet" empty-state animation looks like a loading screen, not a deliberate "before opening" beat
- **Where:** `Scene.tsx:177-187`. Pulsing Georgia-italic "The shop is quiet..." text + two silhouette NPCs walking past.
- **Why new gamer fails:** The italic gray text fades in/out with a sine pulse — visually identical to a loading spinner. A new gamer waits, expecting it to "finish loading." It never does (the cue persists until workers and customers both exist, per `Scene.tsx:100-102`).
- **Fix:** different copy and weight. "Day 1 — opening at 8 AM. Alex is on the way." Or just suppress the message during day 1 onboarding (the tutorial toasts cover the gap). The silhouettes are nice and should stay.

#### P0-7. Workers/customers render as colored circles with one-letter initials when sprites don't load
- **Where:** `drawWorkers.ts:113-126` (worker fallback: blue circle with name initial) and `drawCustomers.ts:117-122` (customer fallback: persona-colored circle, no initial). The sprite atlas at `apps/web/src/canvas/sprites/atlas.ts` references PNGs that the screenshot suggests aren't loading.
- **Why new gamer fails:** A new player sees abstract colored dots labeled "Alex" and "Soren" near the kitchen rectangles, and other colored dots labeled with first names near tables. They cannot tell at a glance which dots are *staff* and which are *customers*. The worker fallback color is hardcoded `#5B8DEF` (blue) for *every* worker — Alex and Soren are the same blue circle with a tiny "A" or "S" on top. With multiple workers, this becomes a wall of identical blue dots.
- **Fix:** either ship the sprites (it's an asset bug, not a UX one) or make the fallback differentiate (a chef-hat icon glyph above the worker circles, customers get the simple circle). At minimum, color workers per-worker (hash worker.id → hue) instead of one-blue-for-all.

#### P0-8. Customer name labels float in mid-air with no anchor to a table/chair
- **Where:** `drawCustomers.ts:195-204`. Customer name renders 2px below the sprite center while seated. With sprites missing (circles), names like "Brian Williams" appear floating over the table rectangle with no visual connection to a chair.
- **Why new gamer fails:** Looks like a typo / placeholder / debug overlay rather than "this is a customer's name."
- **Fix:** lower-priority — but consider rendering customer names *only* on hover (with a hit zone), or hide them entirely when the sprite is a fallback circle. Otherwise restaurant looks like a Slack room with name tags.

### P1 — important, but a determined player will find them

#### P1-1. The TEAM sidebar is the primary game-loop entry point and is not signposted
- **Where:** `WorkerPanel.tsx`. Right-side, collapsible, 208px wide when open. Header is "TEAM" in small-caps. Each row is a button that opens the Coaching modal.
- **Why new gamer fails:** Onboarding never points at this panel. The tutorial toast says "Click Alex" implying the canvas, not the sidebar. A player who never discovers that worker rows are clickable will have no coaching loop at all — and coaching is the entire game per `GDD.md` and the title "Kitchen Rush — Mentorship over management" (DECISIONS §10.3).
- **Fix:** the first tutorial toast about Alex should target the sidebar row, not "Alex" generically — e.g. "Click Alex's row in the TEAM panel →" with an arrow or highlight ring. The sidebar header could read "TEAM (click to coach)" until first coaching is done. Once canvas click works (P0-1), the toast can keep pointing at the canvas.

#### P1-2. Coaching modal feedback is ambiguous and doesn't show consequences
- **Where:** `CoachingModal.tsx:110-112`. Feedback text: "Friendly praise — Alex heard you." Then the modal stays open.
- **Why new gamer fails:** Player can't tell whether anything *happened*. No mood number visible to compare (modal shows mood at open but doesn't refresh it). No XP value visible. Design §4.3 says clicking "Try the recipe again" gives -2 mood / +2 XP — the player would benefit from seeing those deltas to learn the praise/correction trade-off central to the game.
- **Fix:** after a successful coach, the worker's level/mood line in the modal header (`CoachingModal.tsx:148-152`) should animate-update with a `+8 mood` or `+2 XP` floater. Or surface the delta inline in the feedback string: "Alex heard you. Mood +8."

#### P1-3. Cooldown UI is hover-only and on a modal — invisible on touch and easily missed on hover
- **Where:** `CoachingModal.tsx:200-211`. Tooltip is `opacity-0 group-hover:opacity-100`.
- **Why new gamer fails:** Player clicks "Nice work" → button fades → player thinks "is it broken? did I break it?" They click again — nothing happens (the disabled handler is silent). The cooldown tooltip only appears on hover; on touch devices it never shows. Design §4.3 explicitly chose no numeric countdown, which is correct, but the "Just praised — let it land 🌱" text needs to be visible without hovering for cozy-discoverable.
- **Fix:** when on cooldown, REPLACE the button's preset summary text ("Friendly praise") with the cooldown copy in italic, persistently visible. Or put a subtle 🌱 leaf glyph in the corner of cooled-down buttons. No timer, just persistent state visibility.

#### P1-4. The Day Summary modal can appear without the player understanding it's special
- **Where:** `DaySummaryModal.tsx`. Renders only when `openModal === 'day-summary'`. The wiring note in lines 15-19 admits "the actual day-end detection ... will be refined." It's unclear from reading whether this auto-fires at 5 AM in-game (250 real seconds after starting). Design §9 says it's "default open" at quiet hours.
- **Why new gamer fails:** If it auto-pops at 5 minutes real-time, the player who is mid-coaching gets a sudden full-screen modal with six score gauges and "Open Tomorrow." If it does NOT auto-pop, the player never sees the day summary and misses the only place reviews-vs-scores are aggregated.
- **Fix:** verify it auto-opens at quiet hours. Add a tiny "Day Summary" label or sun icon in the TopBar during quiet hours so a player who dismissed it can reopen. Also: the summary header copy "Day 1 Done" / "Quiet hours. Take your time." is good — but the modal should not block clicking through reviews, which means a "Read full reviews" link from the summary directly into ReviewsPanel.

#### P1-5. The Hire panel pricing is opaque ("$100 / Earn $X more") without explaining wages
- **Where:** `HirePanel.tsx`. Shows hire cost ($100/$150/$250 per design §4.5) and team count `2/4`. Never mentions that workers cost $40/day wage (design §4.5).
- **Why new gamer fails:** Player hires Soren for $100, then is surprised tomorrow when their cash dips by an unexplained $40. With 1 worker, wages exist but the player has no way to know without reading the design doc.
- **Fix:** add a one-line "wage: $40/day" sub-label under each candidate. Or, in the modal header: "Cash: $150 · Team: 1/4 · Daily wages: $40."

#### P1-6. The Menu modal doesn't explain the relationship between unlocking and customer orders
- **Where:** `MenuPanel.tsx`. "Available to Unlock" section lists recipes with unlock cost. Items already unlocked have inline-editable price.
- **Why new gamer fails:** A new player sees a list of foods at fixed prices ($8 burger, etc.) and a list of items with "$50 unlock" costs. Nothing explains that *unlocked items show up on customer orders* and *the prices you set affect tip/satisfaction/sales*. Two huge mechanics, zero copy. The intro tooltip on the price button is just "Click to edit price" (`MenuPanel.tsx:77`).
- **Fix:** one helper line under the "Your Menu" header: "Customers order from these. Click a price to change it." And one under "Available to Unlock": "Unlock more dishes — customers will start ordering them tomorrow."

#### P1-7. Reviews modal greets new players with "No reviews yet" and no path forward
- **Where:** `ReviewsPanel.tsx:170-173`. Empty state: "No reviews yet. Your first customers will share their thoughts tonight."
- **Why new gamer fails:** "Tonight" is ambiguous — does this mean real-tonight (close the game and come back)? Or in-game tonight (wait the 4 minutes until quiet hours)? The cozy promise says no countdown, but a hint of *when* is fine.
- **Fix:** "Reviews show up after each day ends. Day 1 ends at 5 AM in-game (~4 minutes from now)." Then auto-update when reviews exist.

#### P1-8. Leaderboard for a new player is empty/intimidating
- **Where:** `LeaderboardPanel.tsx`. Empty state: "No scores yet — play a full day to appear here."
- **Why new gamer fails:** Day 1 player sees an empty board. Day 2 player sees themselves at #1 with a tiny score because they're the only player. Day N with other players might see themselves NOT in the top 10 — design §10.5 deliberately doesn't say "you are rank #N" but also doesn't surface their actual score for self-comparison. The leaderboard, on first open, is mostly a confusing piece of furniture.
- **Fix:** lower-priority. Could hide the Leaderboard icon entirely until the player has completed day 3, OR add a subtle "Your rolling score: 743 (you're not in the top 10 yet)" footer. Design §10.5 forbids the "you are rank #N" — but a personal-score footer that doesn't reveal rank is allowed.

#### P1-9. The Pause button toggles between two glyphs (||, ▶) that look like media-player controls, not a "game pause"
- **Where:** `TopBar.tsx:175-196`. Pause uses pure SVG `||` and play uses `▶`.
- **Why new gamer fails:** Player thinks the game has background music or a video. Some players associate pause with "save and quit," some with "things stop." It's not labeled. The pause button uses the sunset-orange highlight when paused which is nice but unexplained.
- **Fix:** add a visible "Paused" label that appears next to the icon when paused (or as a soft overlay banner on the canvas like "Paused — click ▶ to resume"). The cozy promise means pause is rarely needed, but when the player accidentally pauses, the canvas just stops looking alive and they need a clear way back.

#### P1-10. There's no "what changed" feedback when the player takes an action
- **Where:** Cross-cutting. Coaching: no on-canvas effect (well, a speech bubble for 4 sec — but only if the state-poll catches the coaching_count uptick fast enough — see `Scene.tsx:51-69`). Clean: no animation. Unlock recipe: modal updates, but nothing visible in the world. Hire: new worker pops into the sidebar.
- **Why new gamer fails:** Actions feel like submitting forms, not playing a game. There's no satisfaction loop. A coffee-and-keyboard player wants tiny dopamine hits.
- **Fix:** at least three quick wins —
  - On Clean: floating "+10 🧼" near the top-bar cleanliness chip.
  - On Coach: small +/- mood/XP floater above the worker sprite on canvas (not just the speech bubble).
  - On Unlock recipe: brief toast "Spicy Fries unlocked. Customers will start ordering tomorrow."

### P2 — polish / would-be-nice / discoverability

#### P2-1. The collapsed TEAM sidebar is a 40px gray column with one chevron — easy to miss
- **Where:** `WorkerPanel.tsx:100-127`. Collapsed width is 40px, contains only the toggle chevron.
- **Why new gamer fails:** If they collapse it accidentally, they may not realize it can be expanded back. The chevron has no label.
- **Fix:** add a vertical "TEAM" text in the collapsed column or a person-icon. Bigger hit target.

#### P2-2. "🍦 Desserts" and similar emoji station labels in the Hire `<select>` are nice — but unexplained
- **Where:** `HirePanel.tsx:15-23`.
- **Why new gamer fails:** Player picks "Floor" because the broom emoji is intuitive, then later realizes the design doesn't really do much with "floor" workers. There's no preview of which station the candidate is "good at" beyond `suggested_station`.
- **Fix:** add a one-liner under the station select: "Suggested for {candidate.name}: Grill (better speed)." Or just bold the suggested option.

#### P2-3. The CoachingModal speech-bubble system shows the same bubble text regardless of preset
- **Where:** `drawWorkers.ts:35-42` — bubble dictionary works. BUT `Scene.tsx:62-66` hardcodes `presetKey: 'praise'` regardless of what was clicked, because the state snapshot only carries `coaching_count` not the last preset. So clicking "Watch your station's heat" shows the speech bubble "Thanks! 😊" instead of "On it!".
- **Why new gamer fails:** Player praises Alex once, sees "Thanks! 😊" — good. Then they correct Alex with "Watch your station's heat" — and still see "Thanks! 😊". Either they think the action was wrong or they assume the bubble is purely decorative.
- **Fix:** server endpoint `POST /api/workers/:id/coach` should return the preset and the client should push the correct bubble event from the response, not infer from polling. (The comment on `Scene.tsx:64` already acknowledges this is a stub.)

#### P2-4. The 6 score dimensions are introduced in the Day Summary modal with no glossary
- **Where:** `DaySummaryModal.tsx:124-131`. Six radial gauges labeled "Taste / Clean / Seating / Service / Vibe / Timing."
- **Why new gamer fails:** Why is "Vibe" different from "Service"? Why is "Seating" a dimension if I only have 2 tables? On hover, no tooltip.
- **Fix:** small tooltip on each gauge with the design §7 rubric one-liner. "Vibe — atmosphere, music, lighting."

#### P2-5. Improvement hint in reviews is a 💡 light-bulb line with no action affordance
- **Where:** `ReviewsPanel.tsx:102-106`. Shows server-provided `improvement_hint`.
- **Why new gamer fails:** Hint says e.g. "Coach Alex on speed" — but player can't click the hint to jump to coaching Alex. They have to close the modal, scroll the TEAM sidebar, find Alex, click. Friction kills the loop.
- **Fix:** if the hint text contains a worker name, make it an inline action that opens the CoachingModal for that worker. Same for "Unlock more dessert items."

#### P2-6. The Settings modal mixes account info, logout, and API key — but the TopBar already has a separate Logout icon
- **Where:** `SettingsModal.tsx:127-137` shows display name + "Log out" link. `TopBar.tsx:212-221` also has a dedicated Logout icon.
- **Why new gamer fails:** Two logout buttons, two places. Mild confusion. Not blocking.
- **Fix:** remove the Logout icon from the TopBar (it's the lowest-frequency action in the game), keep it in Settings. Frees a TopBar slot for a "Help" button (which the game badly needs — see P0-2).

#### P2-7. The "AI scored" purple badge on reviews is unexplained
- **Where:** `ReviewsPanel.tsx:81-85`.
- **Why new gamer fails:** Player thinks "wait, who's scoring my reviews? An AI? Is that a feature or a leak?" Without context, "AI scored" sounds like a debug label.
- **Fix:** rephrase to "Scored by Claude" or move to a small badge with tooltip "This review was scored by your Claude API key — for richer nuance." OR show this badge only in Settings/dev contexts.

#### P2-8. Day-night overlay applies to UI in confusing ways during sunset/night
- **Where:** `drawDayNightOverlay.ts` (not read, but referenced from `Scene.tsx:96-97`).
- **Why new gamer fails:** During the night-time portion (~9 PM – 5 AM in-game = ~150 real-sec stretch), the whole canvas dims. A player who logged in during their first "evening" sees a dark blue scene and may interpret it as a bug or "the shop is closed."
- **Fix:** lamp glow inside the restaurant (warm-orange light cone from each station) so the kitchen reads as still-active even when the beach overlay is dark. Per design §1.55 "lantern warm-glow" — verify the overlay actually has this.

#### P2-9. Customer order content is never displayed
- **Where:** Nowhere in the UI. Customers seat and eat with no thought-bubble showing what they ordered.
- **Why new gamer fails:** Player has no idea what's being made for whom. With 4 customers seated, can't tell who's waiting on the burger and who's waiting on the lemonade. This makes the "watch your shop work" mode boring — there's nothing to track.
- **Fix:** thought bubble above each seated customer showing their order item emoji (🍔🍟🥤). Closes when they enter "eating" phase.

#### P2-10. The price-edit input in the menu has no min/max guidance
- **Where:** `MenuPanel.tsx:56-71`. `type="number" min={1}` no max.
- **Why new gamer fails:** Player sets Classic Burger to $200. No warning. Customers tip less, reviews tank — but the connection is invisible.
- **Fix:** show a recommended range as placeholder text in the input ("typically $6–$12") sourced from the recipe's `default_price` ± 30%.

#### P2-11. The "Score: 65" updates live but customers/sales don't have visible counters
- **Where:** `TopBar.tsx`. Shows cash + cleanliness + score. No "customers served today" or "sales today."
- **Why new gamer fails:** Player wants a sense of progress. Cash updates feel arbitrary because the player doesn't see ticket totals. The Day Summary at end-of-day shows totals, but during the day there's no running tally.
- **Fix:** add a small "Today: 7 served · $52" running totals in the TopBar center area. Or below the score.

#### P2-12. The empty-state silhouette NPCs walk past forever during long pauses
- **Where:** `Scene.tsx:151-174`. The silhouettes appear at T+3s and T+8s on a modulo loop.
- **Why new gamer fails:** If a player pauses the game (or just gets stuck on day 1 onboarding with no workers visible due to sprite issues), the silhouettes keep parading past in a loop. Combined with the pulsing "shop is quiet" text, the whole canvas reads as a loading screen.
- **Fix:** silhouettes should appear *once* (T+3, T+8) and not loop. Once both have passed, the empty cue is just the text.

---

## 3. What to NOT change (the game already does this well — preserve in any redesign)

These design choices land correctly. Don't lose them when reworking the UI.

- **No fail-states anywhere.** The Hire modal says "Earn $X more" instead of "insufficient funds." The cooldown is a "let it land 🌱" tooltip not a countdown. The Day Summary even reframes mistakes as "that's how you learn" (`DaySummaryModal.tsx:138`). This tonality is consistent and *correct* per DECISIONS §10.
- **No `you are rank #N` on the leaderboard.** Per design §10.5, the leaderboard is celebratory not competitive. `LeaderboardPanel.tsx` correctly omits user highlighting. Keep this.
- **Worker mood is a colored bar with no number on the sidebar row.** `WorkerPanel.tsx:69-74` — visual only, no "Mood: 53" anxious value. Correct per design §4.3.
- **Login is one field, no password, autofocus, "Continue."** Friction-free. Don't add a password.
- **Cleanliness chip is small and gray-to-green gradient, not a giant red alert when low.** Almost right — only fix is softening the red below 40 (P0-5).
- **Coaching has 6 presets, not free text.** Correct call per design §4.3 (zero-latency, zero-cost, easy to localize). Don't add free-text in MVP.
- **Quiet hours don't auto-advance.** `DaySummaryModal.tsx:147-159` requires explicit "Open Tomorrow" click. Correct per design §9.
- **Customer reviews show the raw text plus six scores.** `ReviewsPanel.tsx:89-99` — text and numbers side-by-side. Players can read the human-readable review and verify the scoring. This is the heart of the game; don't hide either side.
- **Tutorial is dismissible and never blocks gameplay.** `OnboardingToasts.tsx:154-162`. Toasts auto-dismiss after 6 seconds; world simulates underneath. Correct per design §2.1.
- **The "AI scored" badge on reviews indicates whether Claude was used.** Once relabeled (P2-7) it's a nice transparency signal — players who paste their API key see the difference. Keep the visibility.
- **No on-canvas "struggling worker" sad icon.** `drawWorkers.ts` has zero status icons. Correct per design §4.4 / critique §2.4.
- **Empty review state copy is gentle.** "Your first customers will share their thoughts tonight" — warm tone. Keep, but fix ambiguity (P1-7).

---

## 4. Quick reference — file-by-file finding map

| File | P0 findings | P1 findings | P2 findings |
| --- | --- | --- | --- |
| `apps/web/src/canvas/Scene.tsx` | P0-1, P0-6 | — | P2-12 |
| `apps/web/src/canvas/render/drawShop.ts` | P0-6 (fallback rectangles) | — | — |
| `apps/web/src/canvas/render/drawWorkers.ts` | P0-7 | — | P2-3 |
| `apps/web/src/canvas/render/drawCustomers.ts` | P0-7, P0-8 | — | P2-9 |
| `apps/web/src/canvas/render/drawDayNightOverlay.ts` | — | — | P2-8 |
| `apps/web/src/ui/TopBar.tsx` | P0-3, P0-4, P0-5 | P1-9 | P2-6, P2-11 |
| `apps/web/src/ui/OnboardingToasts.tsx` | P0-2 | P1-1 | — |
| `apps/web/src/ui/WorkerPanel.tsx` | — | P1-1 | P2-1 |
| `apps/web/src/ui/CoachingModal.tsx` | — | P1-2, P1-3 | — |
| `apps/web/src/ui/MenuPanel.tsx` | — | P1-6 | P2-10 |
| `apps/web/src/ui/HirePanel.tsx` | — | P1-5 | P2-2 |
| `apps/web/src/ui/ReviewsPanel.tsx` | — | P1-7 | P2-5, P2-7 |
| `apps/web/src/ui/LeaderboardPanel.tsx` | — | P1-8 | — |
| `apps/web/src/ui/DaySummaryModal.tsx` | — | P1-4 | P2-4 |
| `apps/web/src/ui/SettingsModal.tsx` | — | — | P2-6 |

---

## 5. Surprises worth flagging to the lead

1. **The canvas is fully decorative right now.** The design doc treats it as the main interaction surface (every entry in §8 is a click-on-canvas action). The implemented Scene.tsx has zero click handling. This is the single biggest gap between design and shipped UI — it's not a polish issue, it's a structural one. The right-panel TEAM list is currently doing 100% of the interaction work the design assigned to the canvas.
2. **The first onboarding toast says Alex will arrive at 8 AM, but the world initializes at 8 AM and Alex should already be on canvas.** If the sprite atlas isn't loading (current screenshot suggests colored circles, so it isn't), Alex appears as a blue circle labeled "A." Player has been told Alex "will arrive" — but Alex is already there as an ambiguous dot. The tutorial line is technically correct for the cold-start, but in practice the dot is on-screen during the toast.
3. **The speech-bubble for coaching always says "Thanks! 😊" regardless of the actual coaching phrase.** Server response doesn't carry the preset back to the canvas. The dictionary in `drawWorkers.ts:35-42` is wired correctly but only the `'praise'` entry ever fires (`Scene.tsx:64` — explicit comment admits the stub). Subtle but undermines the praise/correction trade-off the player is supposed to learn.
4. **The Logout icon is the rightmost TopBar button, immediately next to Settings.** A new player exploring the icons is one mis-click away from logging themselves out mid-day. There's no confirmation prompt. With username-only auth (no password), they can log back in instantly — but state poll has to re-establish and any unsaved local UI state is lost.
5. **The empty-state "shop is quiet..." overlay is rendered when EITHER `customers_in_scene` OR `workers` is empty.** During fast-forward through the night (1 AM – 5 AM, customers sparse), if a moment passes with both arrays empty, the empty-state silhouettes re-trigger over the live shop. Easy to fix (check `r?.in_game_minute` and only show pre-opening cue), but currently can produce a visual glitch.
6. **No persistent help/about button anywhere.** Once the tutorial toasts are dismissed (or auto-completed at T+18s), there is no path back to "what is this game / what do I do." Settings only contains API key + logout. Adding a `?` icon to the TopBar that re-opens the welcome card (P0-2) costs almost nothing and rescues the "I don't understand" user without committing to a redesign.
