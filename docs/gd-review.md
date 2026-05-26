# Kitchen Rush — Game-Design Review

**Reviewer lens:** cozy/management genre designer.
**Scope:** moment-to-moment loop and onboarding. UI-discoverability nits are out of scope (UXR is covering those).
**Constraint:** every recommendation respects DECISIONS §10 — no time pressure, no fail state, no scarcity, mentorship over management.

---

## 1. The "what's the verb" problem

A new gamer who opens Kitchen Rush today is staring at a beach diorama that simulates itself. Customers walk in, workers cook, reviews materialise, cash ticks up — all server-authoritative, all invisible-by-design. The player's actual verbs (coach, clean, unlock, hire, price) are **administrative and disclosed only through icons in a top bar**, none of which a brand-new player has a reason to touch in minute 1. The 5-real-minute day means *something is always happening on the canvas*, but the player has no **prompted next action** and no **micro-celebration** when something good happens. The result is a watch-it-play experience that reads as "screensaver with menus." The cozy genre tolerates a slow loop, but it does **not** tolerate a *passive* loop — Stardew gives you a hoe and a 9x9 patch on minute 1; Animal Crossing gives you a debt and a shovel. Kitchen Rush currently gives you a top-bar of cogs and a polite toast saying "Alex will arrive at 8 AM" while nothing visible happens for the next ten real seconds. The verb is missing.

The fix is **not** to add stress. It's to (a) put one obvious, satisfying verb in front of the player in the first 20 seconds, (b) make the world *react* visibly when good things happen so the player feels causal even when the sim is doing the work, and (c) surface a tiny, ever-present goal-pill so the player always knows what "playing well" looks like this minute.

---

## 2. First 60-second redesign

Replace the current 4-toast OnboardingToasts sequence with a **guided opening beat** that gives the player one verb, one win, and one promise. Toasts stay (per design §2.1) but become anchored to actions, not the wall clock.

### The opening beat — beat by beat

| T+ | What the player sees on canvas | What the player is invited to do | What feedback they get |
|---|---|---|---|
| 0.0 s | Black fade-in to the beach. Ocean shimmer. A friendly hand-drawn "Welcome to **Driftwood Diner**, Day 1" banner glides across the top for 2 sec then settles into the TopBar as the day-number chip. | Nothing. Watch. | Soft ambient surf sound (if audio lands) or a 600 ms title swell. |
| 2.0 s | Alex (the starter worker) walks in from the door, sets up at the grill. A speech bubble: *"Morning, boss!"* | Nothing. Watch. | Alex's sprite gets a 200 ms scale-pop when they land on station. |
| 4.5 s | A **subtle yellow pulse ring** appears under Alex. A coach-mark anchored to Alex says: *"Click Alex to say good morning."* | **CLICK ALEX.** | On click, the coaching radial opens. The *Praise* phrase is pre-highlighted with a gentle bounce. |
| ~7 s | Player clicks "Nice work, keep it up!" | Tutorial-only: only Praise is enabled this first time; the other 5 phrases are dim with a "later" tag. | Alex shows a heart particle, +8 mood floats up, the radial closes, and a **soft chime** plays. A coach-mark on the TopBar score chip: *"You just gave Alex +8 mood. That's the whole game — small, kind nudges."* |
| 12 s | First customer (a Beach Bum, chosen for low patience-sensitivity) is **walking up the path from off-canvas**, not yet inside. A coach-mark with an arrow: *"Your first customer is on the way."* | Nothing. Watch. | The customer waves at the door before entering. |
| 16 s | Customer enters, walks to a seat. A small *order ticket* card flies up from the customer to a new HUD element in the top-right: a **"Today's Diner Log"** counter that ticks from `0` to `1` with a 200 ms bounce. | Optional click: *"Click them to greet — extra tip!"* (greeting is already in §8 of design.md but never surfaced) | If clicked: green sparkle + a "+3 service" float. If ignored: no penalty, just no bonus. |
| 25 s | Alex starts cooking. A tiny **plate icon with a circular progress ring** sits over Alex's head (no number, no timer text). | Nothing. Watch. | The plate icon fills with colour as prep advances — purely cosmetic, gives the canvas a heartbeat. |
| ~38 s | Order completes. A plate slides from Alex to the customer's seat with a 400 ms tween. Coin particles burst from the customer (+$8). The cash counter in the TopBar **animates the +8 delta** with a brief gold glow. | Nothing. Watch — the player **just earned money** by doing nothing actively wrong, which is the whole cozy promise. | This is the first dopamine hit and it must land. Sound: cash-register ding. Visual: cash chip pulses gold for 1 sec. |
| ~50 s | Customer eats (8 sec). A thought bubble with the dish icon appears, then a heart. Customer stands up. | Nothing. | Customer waves on the way out. |
| ~58 s | A **letter icon in the TopBar pulses** for the first time. Coach-mark: *"Your first review is in — read it later or now."* | Click the letter (or ignore, and the pulse fades after 10 sec; the badge stays). | If clicked: review panel opens, the new review has a "NEW" ribbon and gentle fade-in animation. If ignored: it just sits as a `(1)` badge. |

### What the player has learned by T+60

- The verb is **coach** (and later: clean, unlock, hire).
- Customers handle themselves; you make the *experience* nicer.
- The TopBar is where score, cash, customers-today, and reviews live.
- **Good things happen visibly** when you do the right thing.
- There is no fail state — they ignored the greet opportunity and the customer was fine.

### Concrete affordances to add (each ≤30 LOC)

1. **Yellow pulse ring** under interactive sprites (workers, dirty stations, ready-to-serve plates). Single `ctx.arc` with `sin(t)` alpha. Toggled by tutorial step or by a per-element "has new affordance" flag.
2. **Coach-marks** — replace the current top-of-screen toast list with anchored arrows that point at the target (Alex sprite, TopBar letter, customer). Two new fields per toast: `anchor: 'worker:1' | 'topbar:reviews' | 'customer:beach_bum'` and `dismissOn: 'click-target' | 'timeout'`. Drives auto-advance when the player completes the suggested action — far better than fixed 6-sec timers.
3. **Tutorial gating of the coaching radial** — for first-ever click only, dim the 5 non-praise phrases. One extra prop on `CoachingModal`.
4. **First-review pulse** — when `last_review_ids.length` goes from 0 to 1, animate the letter icon for 10 sec. Trivial diff in TopBar via a `useRef`.

---

## 3. Daily loop redesign — rhythm within 5 real minutes

Today the player's day has **no perceptible internal rhythm** unless they happen to notice the day-night gradient. The simulation does have great rhythm baked in (design §1 beat table), but none of it surfaces. Here's the rhythm to surface, **without adding pressure**.

### Macro rhythm (real seconds → in-game beat → player nudge)

| Real-sec | In-game beat | Canvas/HUD signal | Optional player action |
|---|---|---|---|
| 0–25 | Morning warm-up | Sun-rays particle drift; *"Good morning!"* greeting from each on-shift worker on day-rollover. | Coach mood-up before the wave. |
| 25–50 | Pre-lunch build | A new **"customers waiting" pip-counter** in the top-right starts ticking from 1 → 3 → 5. | Greet incoming customers for tips. |
| 50–75 | **Lunch peak** | A subtle parchment banner crosses the top: *"Lunchtime — 12 PM"*. The Diner Log counter hits its first multiple-of-5 with a tiny confetti puff. No urgency words. | None needed — sim handles it. The *celebration* of the peak is the rhythm. |
| 75–100 | Afternoon dip | Day-night tint warms; the canvas literally exhales. **A "Quiet stretch — good time to tidy" pill** fades in over the TopBar for 8 sec (dismissible). | Click clean, or open the unlock panel and finally afford that Cheeseburger. |
| 100–125 | Pre-dinner build | Lantern sprites on the beach path **light up one by one** (5 lanterns over 25 real sec). This is the signature mood beat. | None. Just look at it. |
| 125–162 | **Dinner peak** | Sunset gradient is in full force; a Date Couple animation (two customers walking in together holding hands) plays once. Diner Log ticks faster. | Coach workers who've been busy — their level might bump. |
| 162–225 | Evening glide | Music softens (when audio lands). | Read reviews. |
| 225–250 | Wind-down | Last-light tint; chairs visibly empty. | None. |
| 250 | **Day ends** | A gentle bell sound + the day-summary modal slides up with the day's totals counting up Stardew-style (`$0 → $247` over 1.5 sec). | Dismiss → quiet hours begin. |
| 250–300 | Quiet hours | Day-summary closes into a "Tonight's Choices" card with 3 big buttons: **Unlock a recipe / Coach 1-on-1 / Open Tomorrow**. | Pick one (or several), or skip. |

### Why this works for cozy

- The peaks **announce themselves** (lanterns lighting, sunset sweep, parchment banner) but the announcements are *celebratory*, not *demanding*. "Lunchtime!" not "Rush incoming!"
- The dip is **explicitly suggested** as a clean/unlock window. The player gets a verb for the quiet 25 seconds that otherwise feels empty.
- The day-end count-up is the **single biggest dopamine moment** of the day. Stardew nails this. Today the day-summary modal is dry numbers.

### Within-the-minute rhythm (the heartbeat)

Even between the macro beats, the player needs a heartbeat. Add these:

- **Cooking ring on each worker** — fills as the order cooks (above). Multiple plates queue visibly behind them as a small sprite stack (max 3).
- **Plate-slide animation** when an order completes — currently invisible.
- **Coin particles** on every served order — 5–8 small `+$` sprites floating from customer to TopBar cash chip over 600 ms. This single change probably does more for "I'm playing a game" than anything else on this list.

---

## 4. Feedback & juice list — micro-celebrations to add

Each is implementable in <100 LOC. Listed in **ship-first priority**.

1. **Cash delta floats.** When the polled `restaurant.cash` increases between snapshots, spawn a "+$N" green sprite at the customer's seat (or center-screen if customer already left) that floats up to the TopBar cash chip and fades. Chip pulses gold for 600 ms.
2. **Order-served plate slide.** When `open_orders` loses an entry (status `served` or removed), tween a plate sprite from the worker's station to the customer's seat over 400 ms with an arc. Ends in a small white *poof*.
3. **Review-landed gold halo.** When a new review with average ≥80 lands (diff `last_review_ids`), the entire canvas gets a soft 200 ms gold vignette + a 200 ms chime + the letter icon does a 3-frame wiggle. For avg 60–80: silver halo, softer chime. For <40: a soft blue halo and a *"They had feedback"* tooltip on the letter — never a sad sound.
4. **Worker level-up burst.** When `xpToLevel(worker.xp)` increases between snapshots, the worker gets a 400 ms scale-up + 6 star particles + a "Lv N" banner above their head for 2 sec. Quiet, not arcade-y. Should also trigger a TopBar toast: *"Alex reached Level 2 — orders 15% faster now."*
5. **Cleanliness sparkle.** When the clean action lands, the sprite of the owner (or just a generic broom particle) sweeps across the canvas, leaving sparkles. Cleanliness chip pulses green and the number animates up.
6. **Diner Log counter.** New TopBar element: "🍽 12 today" — increments with a 200 ms bounce + soft tick sound each time a new customer enters the scene. At multiples of 5: confetti puff. At multiples of 10: a parchment-y "Big day!" banner.
7. **Coaching heart particle.** Already partially there (speech bubble); add a +N mood float and a heart particle drifting up from the worker for 800 ms. Make praise feel *good to do*.
8. **Customer thought-bubble during eating.** While `phase === 'eating'`, periodically cycle a small thought bubble: dish icon → heart (if their experience was good) or `...` (neutral). Drives the feeling that customers *have an opinion* and you can sense it before the written review arrives.
9. **Sunset moment.** Once per in-game day, at minute 1080 (6 PM), the lanterns light up sequentially over 5 real sec. No interactivity. Just a moment. This is the *Animal Crossing 7pm K.K. Slider* of Kitchen Rush.
10. **Day-summary count-up.** Day-summary modal numbers (cash earned, customers served, avg review) count from 0 to their final value over 1.5 sec, staggered 200 ms each. Numbers ≥ previous-day's bump in green with a small ▲.
11. **First-of-day bell.** At T+0 of a new day, a single soft bell tone + a brief 800 ms parchment-banner: *"Day 3 — your regulars are back."* (the wording can vary by milestone).
12. **Unlock celebration.** When the player unlocks a new menu item, the recipe card flips, lands on a "shelf" sprite, and **the corresponding station glows for 5 sec the next time it's used**. Onboards the connection between unlock → station → output.
13. **Tip floater (distinct from base price).** When `tip_amount > 0`, the coin particles are gold instead of copper, and a smaller "+$2 tip" sub-float trails behind the main "+$8" float. Reinforces that nice service = more money.
14. **Empty-state breath.** Already partially there ("The shop is quiet..."). Add: a single seagull sprite that flies across the sky once every ~45 real seconds when no customer is present. Tiny detail; signals "we're awake, just calm."
15. **First-time milestone toasts.** First customer ever, first review ever, first $100 in the bank, first level-up, first unlock — each fires a small parchment banner ("Your first customer!"). One per restaurant lifetime; stored as boolean flags in `settings`.

### Server-side prerequisite

The client today only sees snapshots; it can diff `cash`, `last_review_ids`, `worker.coaching_count`, `worker.xp`, etc. between polls — which is enough for items 1, 3, 4, 6, 8, 10, 11, 13. But **items 2 (plate slide) and 7 (mood float) need an event stream**, not just a snapshot. The cheapest path: add an `events: SimEvent[]` array to the `GET /api/restaurant/state` response containing events since the last poll (filtered by `If-None-Match` ETag). Event shapes:

```ts
type SimEvent =
  | { kind: 'order_served'; worker_id: number; customer_seat: {x:number;y:number}; price: number; tip: number; minute: number }
  | { kind: 'review_landed'; review_id: number; avg_score: number; minute: number }
  | { kind: 'worker_level_up'; worker_id: number; new_level: number; minute: number }
  | { kind: 'coaching_applied'; worker_id: number; preset_key: PresetKey; mood_delta: number; minute: number };
```

Each event is buffered server-side for ~10 sec and drained per client. ~50 LOC server-side; the visuals consume them by ephemeral id. Without this, the canvas can only react ~once per poll-second and can't precisely position effects.

---

## 5. The "I'm playing a game" HUD surface

What's missing that would orient a new gamer instantly:

1. **Today's Diner Log** — a "🍽 N today" counter top-right. Concrete, growing, satisfying. Better than the abstract `current_score`.
2. **Today's Goal pill** — a single, gentle, rotating suggestion like *"Today: serve 10 customers"*, *"Today: try cleaning"*, *"Today: unlock something new"*. Pulled from a list of ~8 cozy goals (never failable; you just don't get the satisfying check). When achieved, the pill morphs to a **check ✓** for 4 sec then fades. Goal generation is trivial: pick one each morning based on day-number and what the player hasn't done yet.
3. **Cash delta tail** — when cash changes, the chip shows `$152 (+$8)` for 2 sec, then collapses back. Currently it just silently updates.
4. **Workers row** — a small thumbnail strip beneath the TopBar showing each worker's portrait + an XP bar (visible XP progress is *huge* for cozy genre — Stardew skill bars are the entire pull). Click → coach. Today the player has no idea workers level up at all.
5. **Tip jar visualisation** — a small jar sprite on the counter that fills with coins as the day progresses. Empties at end of day with a `+$N tips` flourish in the day-summary.
6. **In-game clock as a *parchment scroll* not a digital readout** — current `08:00` mono font reads as a timer (= pressure). Replace with a sun-arc UI: a sun icon sliding across an arc representing 8AM→5AM. Visceral, ambient, anti-pressure.
7. **Subtle "next event" hint** — not a countdown. Something like a faded "🌅 Lunch crowd soon" line that appears 5 real sec before lunch peak and fades after. Gives the day shape.
8. **Review badge with avg-score colour** — the letter icon already exists. When there are unread reviews, the badge number takes the colour of the *worst* unread review's avg (green/yellow/blue/never red — even bad reviews are blue, not red, per cozy guardrail). Tells the player "you've got fan mail" with a hint of tone.

These together give the player **6 always-visible signals** (day, clock-arc, cash, customers-today, goal-pill, score) that a normal management-sim player expects to see and currently mostly doesn't.

---

## 6. What NOT to add — cozy guardrails to enforce

Restating DECISIONS §10 and listing genre anti-patterns to *actively reject*:

- **No countdown timers, anywhere.** Not on orders, not on coaching cooldowns, not on quiet hours, not on "tip ends in...". The cooking ring above worker heads is a *progress fill*, not a depleting bar — and it has **no number**. Coaching cooldowns stay as soft-fade buttons (design §4.3).
- **No customer walk-out animation.** Even slow service ends in a served plate; the review may be salty but the customer paid and ate. Do not add an "angry customer leaves" sprite, ever.
- **No red anywhere except brand-critical errors.** Low cleanliness can use a muted amber, never red. Negative reviews use blue or grey, not red. Worker mood can dip; the mood indicator goes pastel-pink (low) to pastel-green (high), never red.
- **No "rush" language.** No "Lunch RUSH!", "Hurry!", "Quick!". The word *rush* in the game title is the only place it appears — the in-game copy is calm. "Lunchtime", "A wave of guests", "Things are picking up".
- **No streaks that break.** Don't show "5 days in a row of 4-star reviews — DON'T BREAK IT!" The cozy genre treats consistency as a quiet long-term metric (design §10 already does this), not a Snapchat streak.
- **No notifications when the player isn't in the tab.** No browser-notif "Your shop misses you!". Sim runs server-side regardless (DECISIONS §9 + design §9), but the *invitation* to return is the next-day's fresh start, not a guilt-trip.
- **No daily goal that you can FAIL.** The Today's Goal pill must always be *cumulative and trivially achievable in the day's natural flow*. Goal "serve 10 customers" works because the average day has ~50; "earn $300" works because the average day grosses ~$500. A player who afk's still hits these — the check is a high-five for being present, not a hurdle.
- **No sad faces on workers during open hours.** Already enforced in design §4.4 (no struggling-icon on canvas). The mood thumbnail in the new workers-row should never go below pastel pink — and the *only* surface for "this worker is struggling" remains the quiet-hours 1:1 panel.
- **No pop-ups that block the canvas during open hours.** Modals are owner-initiated only (menu, hire, settings). The world simulates underneath, always. Tutorial uses coach-marks, not modals.
- **No leaderboard rank shown to the player.** Already in design §10.5. Don't add a "You're #47!" anywhere, ever — even as a celebration.
- **No "tutorial mission list" sidebar.** The opening 60-sec sequence (§2) is invisible to the player after it auto-completes. Don't replace it with a permanent quest log. Today's Goal pill is the *one* persistent prompt and it's gentle.

---

## Deliverable summary

- **File written:** `/Users/mamun/Documents/kitchen-rush/docs/gd-review.md`
- **The big idea:** the simulation is already good; the **client is too quiet about what the simulation is doing**. Add an event stream and ~10 micro-celebrations, gate the first-minute on a single coachable action, and the game goes from "screensaver with menus" to "cozy diner I run."
