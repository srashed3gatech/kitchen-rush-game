# Kitchen Rush — Design & Tuning Spec

**Version:** MVP / Phase 1
**Owner:** Game Designer agent
**Status:** Locked tuning baseline. Critique agent may flag; numbers may shift in Phase 2.

This document is normative for tuning numbers. It defers to `DECISIONS.md` on scope and to `GDD.md` on philosophy. Per DECISIONS §10, **no time pressure, no fail state**. Everything below was audited against that in §11.

---

## 1. Day schedule mapping (real-time ↔ in-game)

One in-game day = **5 real minutes = 300 real seconds**, spanning **24 in-game hours** (8 AM → 8 AM next).

- **Open hours:** 8 AM → 5 AM next day = **21 in-game hours = ~250 real seconds (83.3%)**.
- **Quiet hours:** 5 AM → 8 AM = **3 in-game hours = ~50 real seconds (16.7%)**.
- **Conversion:** 1 in-game hour = **12.5 real seconds**. 1 in-game minute = ~0.21 real seconds.

### Beat table

| Real-time (sec) | In-game time | Beat                    | Customer density          | Notes                                                              |
| --------------- | ------------ | ----------------------- | ------------------------- | ------------------------------------------------------------------ |
| 0               | 8:00 AM      | Shop opens              | Trickle (0.5/in-game-hr)  | Workers arrive, owner gets a "Good morning" toast.                 |
| 0 – 25          | 8 AM – 10 AM | Morning warm-up         | 0.5–1.0/in-game-hr        | First small wave. Good time to coach.                              |
| 25 – 50         | 10 AM – 12 PM| Pre-lunch build         | 1.5–3.0/in-game-hr        | Density ramps.                                                     |
| 50 – 75         | 12 PM – 2 PM | **Lunch peak**          | **5.0/in-game-hr** (peak) | Busiest stretch of the day. Mostly burgers/fries/drinks.           |
| 75 – 100        | 2 PM – 4 PM  | Afternoon dip           | 1.5/in-game-hr            | Quiet window. Owner can clean/upgrade/read reviews.                |
| 100 – 125       | 4 PM – 6 PM  | Pre-dinner build        | 2.0–3.5/in-game-hr        | Snack/dessert orders pick up; families.                            |
| 125 – 162       | 6 PM – 9 PM  | **Dinner peak**         | **4.5/in-game-hr** (peak) | Pizza orders dominate. Higher tip generosity (date crowd).         |
| 162 – 200       | 9 PM – 12 AM | Evening glide           | 2.0/in-game-hr            | Sunset overlay. Desserts & drinks favored.                         |
| 200 – 225       | 12 AM – 2 AM | Late-night              | 1.0/in-game-hr            | Night-owl persona only. Burgers + sodas.                           |
| 225 – 250       | 2 AM – 5 AM  | Midnight wind-down      | 0.3/in-game-hr            | Last stragglers. Music softens.                                    |
| 250             | 5:00 AM      | **Shop closes**         | 0                         | Workers go home. Day-end summary popup.                            |
| 250 – 300       | 5 AM – 8 AM  | **Quiet hours**         | 0                         | Reviews, one-on-ones, unlocks. See §9.                             |
| 300             | 8:00 AM      | Next day starts         | —                         | Loops. Cash & state carry over.                                    |

### Cleanliness decay (critique §1.13)

Cleanliness ticks down at **2 points per in-game hour** during open hours (8 AM – 5 AM = 21 in-game hours → up to –42/day if untended). Starting at 80, an ignored day still ends at ~38 — meaningful enough to nudge the player to clean, gentle enough never to feel urgent.
- Decay applies only while the shop is open and `is_paused = 0`.
- Decay is per-restaurant (the `cleanliness` integer), not per-station. Per-station glows in §8 ("Clean a station") are illustrative — they reset their parent station's contribution but the schema stores only the overall integer.

### Empty state — first 10–15 real seconds before any customer arrives (critique §5.2)

At 8:00 AM (T+0s), the canvas must feel alive even though the spawn-Poisson hasn't fired yet:
- Workers walk into stations from the door (5 sec animation).
- Owner sprite stretches at the counter (small idle animation).
- Ocean shimmer particles animate on the beach.
- Two non-customer NPCs walk past in the background (parallax beach path) once at T+3s and T+8s.
- No score panel is rendered yet (it only appears after the first review exists).
- The "Welcome. Alex will arrive at 8 AM." toast (§2.1) is visible.

### Visual transitions (day-night gradient overlay)

| In-game time     | Tint                                  |
| ---------------- | ------------------------------------- |
| 8 AM – 11 AM     | Cool morning blue → bright            |
| 11 AM – 4 PM     | Bright daylight, warm beach           |
| 4 PM – 7 PM      | Golden hour, orange-pink              |
| 7 PM – 9 PM      | Sunset over ocean (signature beat)    |
| 9 PM – 5 AM      | Deep blue night, lantern warm-glow    |
| 5 AM – 8 AM      | Pre-dawn purple → soft sunrise        |

---

## 2. Starting state for a brand-new owner

| Field                          | Starting value                                          |
| ------------------------------ | ------------------------------------------------------- |
| Cash                           | **$150**                                                |
| Workers                        | **1 worker** (Alex, skill level 1, mood 70)             |
| Unlocked menu items            | Classic Burger, French Fries, Cola (3 items, see §3)    |
| Cleanliness                    | **80 / 100**                                            |
| Owner mood                     | n/a (owner has no mood stat; workers do)                |
| Restaurant size                | 1 floor, 4 customer seats, 2 tables                     |
| Stations                       | 1 Grill, 1 Fry station, 1 Drink dispenser, 1 Counter    |
| Reputation (starting score)    | **60 / 100** (was 3.0/5.0; rescaled per critique §1.1)  |
| Owner tutorial                 | First-day onboarding flow (see §2.1)                    |

Rationale: $150 lets the owner buy ONE meaningful unlock (Cheeseburger $80 or Lemonade $60) after roughly 1–2 days of decent sales, so the first unlock feels earned but reachable. One worker keeps the tutorial day calm.

### 2.1 First-day onboarding flow (critique §5.1)

On a brand-new account, day 1 walks the owner through the loop via gentle toasts and pointers. All dismissible at any time via a small "skip" link; completion is stored in `settings.tutorial_seen = true`.

| Real-second | Cue                              | Pointer / message                                                |
| ----------- | -------------------------------- | ---------------------------------------------------------------- |
| T+0         | Top-of-screen toast              | "Welcome. Alex will arrive at 8 AM."                             |
| T+2         | Arrow on canvas centre           | "This is your shop. Take a moment to look around."               |
| T+5         | Arrow on Alex (worker sprite)    | "Click Alex any time to coach them."                             |
| T+12 (or on first customer) | Arrow on incoming customer | "Customers walk in on their own. No rush — they'll wait."  |
| First served order | Toast                     | "Tap the letter icon (top-bar) to read their review tonight."    |
| First quiet hours | Toast                      | "Quiet hours: catch up, coach, or hit 'Open Tomorrow' when ready."|

Tutorial NEVER blocks gameplay; the world simulates underneath. Toasts auto-dismiss after 6 seconds; pointers fade after 4.

---

## 3. Menu, recipes, unlock tree

**Skill-1 prep time is the base.** All times in **in-game seconds**, where 1 in-game minute ≈ 0.21 real seconds. A 60-sec prep is ~12.5 real seconds of work for the worker (which is fine — there is no countdown shown).

### Mains

| Item              | Price | Ingredients (cost)                                | Prep steps                          | Prep time (skill 1, in-game sec) | COGS  | Margin | Unlock cost | Prereq                |
| ----------------- | ----- | ------------------------------------------------- | ----------------------------------- | -------------------------------- | ----- | ------ | ----------- | --------------------- |
| Classic Burger    | $8    | Bun, patty, lettuce, tomato ($2.50)               | grill → assemble → plate            | 60                               | $2.50 | $5.50  | **starter** | —                     |
| Cheeseburger      | $10   | Bun, patty, cheese, lettuce, tomato ($3.20)       | grill → cheese → assemble → plate   | 70                               | $3.20 | $6.80  | $80         | Classic Burger        |
| Double Burger     | $14   | 2 patties, bun, cheese, toppings ($5.00)          | grill x2 → stack → assemble → plate | 95                               | $5.00 | $9.00  | $150        | Cheeseburger          |
| Veggie Burger     | $11   | Veggie patty, bun, toppings ($3.80)               | grill → assemble → plate            | 65                               | $3.80 | $7.20  | $120        | Classic Burger        |
| French Fries      | $4    | Potato, oil, salt ($0.90)                         | cut → season → fry                  | 50                               | $0.90 | $3.10  | **starter** | —                     |
| Spicy Fries       | $5    | Potato, oil, spice mix ($1.20)                    | cut → season → fry → toss-spice     | 60                               | $1.20 | $3.80  | $50         | French Fries          |
| Chicken Nuggets   | $6    | Chicken, breading, oil ($1.80)                    | bread → fry → plate                 | 55                               | $1.80 | $4.20  | $70         | French Fries          |
| Pizza Margherita  | $14   | Dough, sauce, cheese, basil ($3.50)               | roll dough → sauce → top → bake     | 110                              | $3.50 | $10.50 | $250        | Cheeseburger + Nuggets|
| Pizza Pepperoni   | $16   | Dough, sauce, cheese, pepperoni ($4.20)           | roll dough → sauce → top → bake     | 115                              | $4.20 | $11.80 | $180        | Pizza Margherita      |

### Drinks

| Item                 | Price | Ingredients (cost)                | Prep steps             | Prep time | COGS  | Margin | Unlock cost | Prereq            |
| -------------------- | ----- | --------------------------------- | ---------------------- | --------- | ----- | ------ | ----------- | ----------------- |
| Cola                 | $3    | Cola syrup, ice ($0.40)           | pour → ice → serve     | 20        | $0.40 | $2.60  | **starter** | —                 |
| Pepsi                | $3    | Pepsi syrup, ice ($0.40)          | pour → ice → serve     | 20        | $0.40 | $2.60  | $30         | Cola              |
| Fanta                | $3    | Fanta syrup, ice ($0.40)          | pour → ice → serve     | 20        | $0.40 | $2.60  | $30         | Cola              |
| Strawberry Lemonade  | $5    | Lemons, strawberry, sugar ($1.00) | muddle → mix → ice     | 35        | $1.00 | $4.00  | $60         | Cola              |
| Dragon Fruit Drink   | $6    | Dragon fruit, soda water ($1.40)  | scoop → blend → serve  | 40        | $1.40 | $4.60  | $90         | Strawberry Lemonade|

### Desserts

| Item             | Price | Ingredients (cost)            | Prep steps              | Prep time | COGS  | Margin | Unlock cost | Prereq          |
| ---------------- | ----- | ----------------------------- | ----------------------- | --------- | ----- | ------ | ----------- | --------------- |
| Ice Cream        | $4    | Ice cream, cone ($0.80)       | scoop → cone → serve    | 25        | $0.80 | $3.20  | $40         | any drink unlock|
| Ice Pop          | $3    | Frozen pop ($0.50)            | grab → serve            | 10        | $0.50 | $2.50  | $25         | Ice Cream       |
| Cupcake          | $5    | Batter, frosting ($1.10)      | bake → frost → plate    | 60        | $1.10 | $3.90  | $80         | Ice Cream       |
| Cake (slice)     | $7    | Batter, frosting, fruit ($1.80)| bake → layer → slice    | 90        | $1.80 | $5.20  | $130        | Cupcake         |
| Rice Pudding     | $6    | Rice, milk, sugar ($1.30)     | boil → simmer → chill   | 75        | $1.30 | $4.70  | $90         | Cupcake         |
| Kids Snack Box   | $7    | Nuggets, fries, pop ($2.20)   | combine → box           | 40        | $2.20 | $4.80  | $100        | Chicken Nuggets + Ice Pop |

### Unlock tree summary

```
Starters (free): Classic Burger, Fries, Cola
   ├─ Cheeseburger ─┬─ Double Burger
   │                └─ Pizza Margherita (needs Nuggets too) ── Pepperoni
   ├─ Veggie Burger
Fries ─┬─ Spicy Fries
       └─ Chicken Nuggets ── Kids Snack Box (needs Ice Pop too)
Cola ─┬─ Pepsi
      ├─ Fanta
      └─ Lemonade ── Dragon Fruit
Any drink ── Ice Cream ─┬─ Ice Pop
                        └─ Cupcake ─┬─ Cake
                                    └─ Rice Pudding
```

Total of **20 menu items**. A player who plays well can unlock everything in roughly **8–12 in-game days (40–60 real minutes)**.

---

## 4. Worker progression

### 4.1 Skill levels 1–5

| Level | Prep-time multiplier | Mistake probability | Mood resilience (mood decay/hr) | Description                            |
| ----- | -------------------- | ------------------- | ------------------------------- | -------------------------------------- |
| 1     | **1.00x** (baseline) | 12%                 | -3                              | New hire. Slow, fumbles.               |
| 2     | 0.85x                | 8%                  | -2                              | Getting steady.                        |
| 3     | 0.70x                | 5%                  | -1                              | Comfortable, reliable.                 |
| 4     | 0.55x                | 3%                  | 0                               | Skilled. Rare mistakes.                |
| 5     | 0.45x                | 1%                  | +1 (recovers idle)              | Mastery. Naturally happy at work.      |

**Mistakes** ≠ failures. A mistake produces a "wrong order" or "burnt" food which still gets served, but lowers the **Taste & Quality** dimension of that customer's review. No order is ever destroyed; no money is ever lost beyond opportunity cost. Each mistake is recorded on `orders.was_mistake = 1` with `orders.mistake_kind` set to one of `'burnt' | 'wrong_item' | 'undercooked' | 'slow'` — used only for the struggling-worker query in §4.4.

**Mood** is per worker, 0–100, starts at 70 for new hires.

**Mood decay rules** (revised per critique §2.2 — defuses the mood-spiral cascade):

1. **Morning floor.** On day rollover (5 AM → 8 AM the next day), every worker's mood is set to `max(current_mood, 50)`. A bad day doesn't ruin the next morning.
2. **No idle decay.** Mood only ticks down while a worker is *actively cooking* an order. An idle worker waiting at their station does not lose mood. This naturally caps daily decay to ~20 even at L1.
3. **Decay rate** per active cook-tick (in-game) follows the table above (-3/in-game-hr at L1 down to +1/in-game-hr at L5).
4. **Restoration.** Praise presets and quiet-hours one-on-ones add mood per §4.3 and §4.4.

### 4.2 Skill XP — explicit XP → Level mapping

`workers.xp` is the canonical storage column (per critique §1.10). Level is **derived** in code from XP:

| XP range  | Level |
| --------- | ----- |
| 0 – 24    | **1** |
| 25 – 74   | **2** |
| 75 – 179  | **3** |
| 180 – 399 | **4** |
| 400+      | **5** |

- Workers earn **1 XP per order completed**, +1 bonus per "Try the recipe again" / "Watch your station's heat" / "Check your order ticket" / "Cleanup when you can" preset coaching click (deltas in §4.3 table), +10 from a quiet-hours one-on-one (§4.4).
- A typical day at peak has ~30 orders shared across the team → a solo worker reaches L2 in ~1 day, L3 in ~3 days, L5 in ~12–15 in-game days.

### 4.3 Coaching UI — **PRESET PHRASES** (MVP choice)

**Decision: Preset phrases only.** Rationale: free-text would require another Claude API round-trip per click, adding $ cost and ~1 second of latency to a quick player gesture. Presets are zero-latency, free, and easy to localize. Free-text is an explicit Phase-2 candidate.

When the owner clicks a worker, a radial menu pops up with **6 preset coaching phrases**, grouped:

| Phrase                      | preset_key             | Category       | XP delta | Mood delta | Cooldown |
| --------------------------- | ---------------------- | -------------- | -------- | ---------- | -------- |
| "Nice work, keep it up!"    | `praise`               | Praise         | +0       | +8         | 8 sec real |
| "Take your time."           | `take_time`            | Reassure       | +0       | +5         | 8 sec real |
| "Try the recipe again."     | `try_again`            | Correct        | +2       | −2         | 12 sec real |
| "Watch your station's heat."| `watch_heat`           | Technique tip  | +3       | −1         | 12 sec real |
| "Check your order ticket."  | `check_ticket`         | Focus reminder | +2       |  0         | 12 sec real |
| "Cleanup when you can."     | `cleanup_when_can`     | Behavior nudge | +1, +1 station cleanliness | −1 | 15 sec real |

- Cooldown is per-worker per-phrase so the owner cannot spam.
- Praise phrases ALWAYS lift mood; correction phrases trade short-term mood for longer-term XP — the player learns to balance.
- A speech bubble appears above the worker for 4 real seconds — this is the bubble vanishing, NOT a player-action deadline. No depleting bar is drawn.
- **Cooldown UI** (critique §2.1): a phrase on cooldown shows a soft tooltip ("Just praised — let it land 🌱") on hover. **No numeric countdown is rendered.** The button is slightly faded; it becomes solid again when ready.
- **Zero Claude calls.** Preset coaching is purely a server-side state mutation — no LLM round-trip per click (per critique §1.5).

### 4.4 Struggling worker mechanic

**Trigger:** A worker is flagged "struggling" if **mood < 30 at any closing time**, OR if they had **≥ 3 mistakes in one day**, OR if their **average customer-service score has dropped ≥ 0.5 points** over the last 3 days.

**Effect during open hours:** **No on-canvas icon.** (Revised per critique §2.4 — a sad-shaped icon on a worker reads as "you failed" to a new player, violating the cozy promise.) Workers behave normally; flagged status surfaces only during quiet hours.

**Quiet-hours one-on-one UI:** During quiet hours, the owner sees a soft "Have a chat?" panel listing flagged workers as gentle suggestions ("Maya seemed off today. Have a chat?"). Clicking a worker opens a modal with their portrait and **3 conversation choices**:

| # | Choice                                           | Mood delta | XP delta | Worker reply                                  |
| - | ------------------------------------------------ | ---------- | -------- | --------------------------------------------- |
| 1 | "Tell me what happened today."                   | +20        | +10      | One-line complaint, e.g. "The grill kept burning my patties." |
| 2 | "Let's go through it together."                  | +10        | +20      | A learning, e.g. "I'll watch the timer more closely." |
| 3 | "You're doing better than you think."            | +25        | 0        | Pure encouragement.                           |

The worker reply may be **Claude-generated** (Opus 4.7 — per architecture §6) for tone-sensitive variety, OR a **template fallback** if no API key. Either way it's one short sentence.

Each conversation takes **5 real seconds** of quiet-hours time. Only one conversation per worker per night. Stored in `coaching_sessions` with `kind = 'one_on_one'`.

### 4.5 Hire cap & cost curve (resolved per critique §6 Q4)

- **Maximum workers per restaurant in MVP:** 4 (1 starter + 3 hires).
- **Hire cost curve:** hire #2 = $100, #3 = $150, #4 = $250.
- **Wage:** stays $40/day per worker.
- **Hire flow** (critique §5.8): `GET /api/workers/candidates` returns 3 procedurally-generated candidates (name from a pool, portrait from the toon-characters atlas, mood baseline 60–75, suggested station). `POST /api/workers/hire { candidateId, station }` commits and deducts cost. The other 2 candidates disappear.

---

## 5. NPC customer generation

### 5.1 Arrival rate curve

Already implied by the §1 beat table; explicit per-hour:

| In-game hour     | Customers per in-game hour | Notes              |
| ---------------- | -------------------------- | ------------------ |
| 8 AM             | 0.5                        | Opener             |
| 9 AM             | 1.0                        |                    |
| 10 AM            | 1.5                        |                    |
| 11 AM            | 3.0                        | Build              |
| 12 PM            | 5.0                        | **Lunch peak**     |
| 1 PM             | 5.0                        | **Lunch peak**     |
| 2 PM             | 3.5                        | Tail of lunch      |
| 3 PM             | 1.5                        | Quiet              |
| 4 PM             | 2.0                        |                    |
| 5 PM             | 3.0                        |                    |
| 6 PM             | 4.0                        |                    |
| 7 PM             | 4.5                        | **Dinner peak**    |
| 8 PM             | 4.5                        | **Dinner peak**    |
| 9 PM             | 3.0                        |                    |
| 10 PM            | 2.5                        |                    |
| 11 PM            | 1.5                        |                    |
| 12 AM            | 1.0                        |                    |
| 1 AM             | 1.0                        | Night owls only    |
| 2 AM             | 0.7                        |                    |
| 3 AM             | 0.4                        |                    |
| 4 AM             | 0.3                        | Last stragglers    |
| 5 AM – 7 AM      | 0                          | Closed             |

**Total customers/day (lambda sum):** ~50 customers. With ~$10 average ticket, peak gross is ~$500/day before tips. After COGS (~35%) and worker wages (~15%), net is ~$250/day at steady state.

**Reputation modifier on λ** (resolved per critique §6 Q1): the hourly λ above is for `reputation = 50`. Apply a multiplier `m = clamp(0.6 + 0.7 × reputation/100, 0.6, 1.3)` to each hour's λ. Effective values:

| Reputation | Multiplier  |
| ---------- | ----------- |
| 10         | 0.67×       |
| 30         | 0.81×       |
| 50         | 0.95×       |
| 70         | 1.09×       |
| 90         | 1.23×       |
| 100        | 1.30× (cap) |

### 5.2 Personas (6)

| Persona           | Archetype                    | Food preference                         | Patience (1–5) | Tip %  | Mood tendency   | Makes them happy                          | Makes them angry                              |
| ----------------- | ---------------------------- | --------------------------------------- | -------------- | ------ | --------------- | ----------------------------------------- | --------------------------------------------- |
| **Beach Bum**     | Sunburned local regular      | Burger + Fries + Cola                   | 5 (zen)        | 8%     | Cheerful        | Friendly service, beach view              | Almost nothing; very forgiving                |
| **Tourist Family**| Parents + 2 kids             | Kids Snack Box, Nuggets, Lemonade       | 3              | 12%    | Variable        | Clean seats, fast nuggets, kids menu      | Dirty floors, no kid items                    |
| **Date Couple**   | Dinner-time romantic         | Pizza, Cake, Dragon Fruit Drink         | 4              | 18%    | Optimistic      | Vibe, dim lights, dessert quality         | Loud staff, wrong order, slow desserts        |
| **Foodie Critic** | Picky, takes mental notes    | Cheeseburger, Spicy Fries, Lemonade     | 3              | 10%    | Skeptical       | High-quality ingredients, perfect prep    | Any mistake; mediocre Taste & Quality         |
| **Night Owl**     | Late-night student           | Double Burger, Cola, Ice Cream          | 4              | 6%     | Tired but chill | Open after midnight at all                | Closed kitchen, no late-night menu            |
| **Hangry Surfer** | Just came in from the waves  | Big portions: Double Burger, Fries, Pop | 2 (impatient)  | 9%     | Hungry, gruff   | Big portion, fast service                 | Small portions, missing fries                 |

**Important per DECISIONS §10:** "Patience" does NOT create a fail timer. It only colors the *review tone* this customer writes after eating. Patience-2 means a Hangry Surfer who waited a long in-game time writes a grumpier review — they still eat, still pay, still tip. No customer ever walks out angry without paying.

### 5.3 Order rules

- Each customer's order is sampled from their persona's **preference set** (above). 70% chance to order their primary combo; 30% chance to substitute a single item for another unlocked item that fits the persona's category (e.g., Date Couple may swap cake → cupcake).
- Customers only order **items the owner has unlocked**. If a Tourist Family's Kids Snack Box isn't unlocked, they pick the closest available combo (Nuggets + Fries + Cola).
- Group size: Beach Bum and Foodie Critic come solo. Date Couple = 2 orders. Tourist Family = 3–4 orders. Night Owl solo. Hangry Surfer solo. Personas weighted by hour (Tourist Family heavy at lunch, Date Couple heavy at dinner, Night Owl only after 10 PM).

### 5.4 Persona spawn weights by hour bucket

| Hour bucket    | Beach Bum | Tourist Family | Date Couple | Foodie Critic | Night Owl | Hangry Surfer |
| -------------- | --------- | -------------- | ----------- | ------------- | --------- | ------------- |
| 8 AM – 11 AM   | 40%       | 25%            | 0%          | 10%           | 0%        | 25%           |
| 12 PM – 2 PM   | 20%       | 40%            | 5%          | 15%           | 0%        | 20%           |
| 3 PM – 5 PM    | 30%       | 25%            | 10%         | 15%           | 0%        | 20%           |
| 6 PM – 9 PM    | 15%       | 20%            | 40%         | 20%           | 0%        | 5%            |
| 10 PM – 12 AM  | 25%       | 0%             | 25%         | 15%           | 25%       | 10%           |
| 1 AM – 4 AM    | 20%       | 0%             | 5%          | 10%           | 60%       | 5%            |

---

## 6. Review generation (before Claude scores)

**Decision: Hybrid — template-based with persona/mood interpolation. NOT LLM-generated.**

Rationale: Generating reviews via a second Claude call would cost ~$0.001–0.003 per customer x ~50 customers/day = costly and slow. Customer reviews are *inputs* to the scorer; the scorer is where Claude's intelligence matters. The customer-side text just needs enough variance and signal for the scorer to read.

### 6.1 Template structure

A review = `{opener} {experience_clause} {service_clause} {closer}`. Each slot is sampled by persona + experience metrics (cleanliness at order time, worker skill at order time, wait duration in in-game minutes, was-order-correct, ingredient tier).

### 6.2 Example templates (6)

Each template is a function of `persona` and 3 signals: `wait_quality`, `food_quality`, `vibe_quality`.

1. **Beach Bum (happy):** "Came in for a quick {item}. {wait_quality_phrase}. The place had {vibe_quality_phrase}. {tip_note}. Will be back tomorrow."
2. **Tourist Family (mixed):** "Brought the kids. The {item} was {food_quality_phrase} and the kids loved it. {cleanliness_phrase}. {service_phrase}."
3. **Date Couple (positive):** "Lovely evening. The {item} was {food_quality_phrase}. {vibe_quality_phrase}. {service_phrase} — {closer_positive}."
4. **Foodie Critic (analytic):** "Ordered the {item}. Ingredients were {ingredient_tier_phrase}. Preparation: {food_quality_phrase}. {wait_quality_phrase}. Atmosphere: {vibe_quality_phrase}."
5. **Night Owl (laid-back):** "Stopped by at {hour}. They were still serving — props. {food_quality_phrase}. {service_phrase}. Solid late-night spot."
6. **Hangry Surfer (blunt):** "{item}. {wait_quality_phrase}. Portion was {portion_phrase}. {food_quality_phrase}. {closer_blunt}."

### 6.3 Phrase banks (expanded per critique §3.3 — 8 variants per bank for ~3,000 unique-feeling reviews ≈ 60 in-game days before repetition)

Each bank is indexed by a numeric bucket derived from the experience signal (wait minutes, worker skill × ingredient tier, etc.). The heuristic fallback scorer in `apps/server/src/ai/heuristicScorer.ts` greps these exact phrases as its sentiment keywords — keep the vocabulary stable.

**`wait_quality_phrase` (8 variants, indexed by wait-in-game-minutes)**
- *Fast (≤5 min):* "Got it fast", "Came out quick", "Practically instant", "Barely sat down before it arrived"
- *Slow (≥15 min):* "Took a while", "Felt slow", "Way too slow honestly", "Stared at my empty table forever"

**`food_quality_phrase` (8 variants, indexed by worker skill × ingredient tier)**
- *Excellent:* "incredible", "really good", "perfectly done", "one of the best I've had"
- *Poor:* "a bit off", "kinda bad", "underwhelming", "couldn't finish it"

**`vibe_quality_phrase` (8 variants)**
- *Positive:* "a chill beach vibe", "a nice mellow feel", "warm and inviting", "perfect sunset glow"
- *Negative:* "an OK atmosphere", "a sterile feel", "kind of grim energy", "the music was off-putting"

**`cleanliness_phrase` (8 variants)**
- *Positive:* "spotless tables", "clean enough", "tidy and well-kept", "fresh as anything"
- *Negative:* "a sticky table", "noticeable grime", "the floor looked rough", "I wiped my own seat"

**`service_phrase` (8 variants)**
- *Positive:* "the staff was kind", "service was attentive", "they actually smiled", "warm welcome at the door"
- *Negative:* "staff seemed distracted", "staff was unfriendly", "I waited to be acknowledged", "felt invisible"

**`portion_phrase` (4 variants — Hangry Surfer persona)**
- "generous", "decent-sized", "kinda small", "honestly tiny"

**`ingredient_tier_phrase`** — tied to the restaurant's upgrade level the owner has bought.

**Openers (6 per persona)** — front of every review. Pulled from a per-persona pool. Examples for Beach Bum:
- "Came in for a quick {item}.", "Stopped by between waves.", "Same as always — {item}.", "Beach lunch run.", "Quick break from the sand.", "Order #{n} of the day."

**Closers (6 per persona)** — last sentence. Examples for Beach Bum:
- "Will be back tomorrow.", "Catch you later.", "Solid as ever.", "Eight outta ten.", "Beach approved.", "Heading back to the waves."

Other personas get matching pools (Tourist Family pool is family-tone; Foodie Critic is analytic; etc. — implementer fills with persona-appropriate phrasing).

### 6.4 Output

Each review is a 2–4 sentence string. Tagged with `customer_id`, `persona`, ground-truth experience metrics (for designer telemetry — NOT shown to scorer or owner). The scorer (§7) sees ONLY the text, just like a real human reviewer would.

---

## 7. The 6-dimension scoring rubric (for the Claude scorer)

The scorer is given the raw review text and **must return six integer scores 0–100** (locked at 0–100 per critique §1.1 — matches the SQLite CHECK constraints in `architecture.md` §2).

### Score-band convention (used in all rubric prose below)

| Band     | Range  | What the text typically looks like                                       |
| -------- | ------ | ------------------------------------------------------------------------ |
| Awful    | 0–20   | Inedible / disaster / actively bad / customer leaves a complaint         |
| Bad      | 21–40  | Negative mention; off / wrong / dirty / slow                             |
| Fine     | 41–60  | Neutral or "OK" — no strong opinion either way (default when no mention) |
| Good     | 61–80  | Mild praise / pleasant / nice / quick                                    |
| Excellent| 81–100 | Glowing — specific positive callout                                      |

**Default when the review makes no mention of a dimension: 60** (low-end of "Fine"). Reviews don't always touch every dimension; absence is mildly positive, not negative.

### Rubric (this is the system-prompt content for the scorer; cached)

**Taste & Quality.** 0–20 = inedible/wrong/burnt mentioned. 21–40 = "off," "a bit bland," "weird." 41–60 = no strong opinion / "fine." 61–80 = "really good," "tasty." 81–100 = "incredible," "perfect," "best burger." Consider ingredient quality, preparation, doneness, accuracy of the order.

**Cleanliness.** 0–20 = explicit complaint about grime / sticky tables / dirt. 21–40 = "could be cleaner." 41–60 = no comment / clean enough. 61–80 = "clean," "tidy." 81–100 = specific praise ("spotless," "fresh").

**Seating & Comfort.** 0–20 = "couldn't sit anywhere," "uncomfortable." 21–40 = "crowded," "tight squeeze." 41–60 = no comment / found a seat. 61–80 = "nice spot." 81–100 = specific praise ("great view from our table," "loved the booth").

**Customer Service.** 0–20 = rude / dismissive / wrong order delivered. 21–40 = "staff seemed off." 41–60 = no comment / neutral. 61–80 = "friendly staff," "kind." 81–100 = warm specific praise.

**Restaurant Vibe.** 0–20 = "grim," "sterile," "sad." 21–40 = "felt off." 41–60 = no comment. 61–80 = "nice atmosphere," "chill." 81–100 = specific praise of ambience / view / music / feel.

**Order Timing.** 0–20 = "waited forever," "took ages." 21–40 = "took a while." 41–60 = no timing comment. 61–80 = "came out reasonably quick." 81–100 = "fast," "timely."

### Output format Claude must return

The scorer uses `tool_use` with a forced `score_review` tool. Tool input schema:

```json
{
  "type": "object",
  "properties": {
    "taste":          { "type": "integer", "minimum": 0, "maximum": 100 },
    "cleanliness":    { "type": "integer", "minimum": 0, "maximum": 100 },
    "seating":        { "type": "integer", "minimum": 0, "maximum": 100 },
    "service":        { "type": "integer", "minimum": 0, "maximum": 100 },
    "vibe":           { "type": "integer", "minimum": 0, "maximum": 100 },
    "timing":         { "type": "integer", "minimum": 0, "maximum": 100 },
    "summary":        { "type": "string",  "maxLength": 140 }
  },
  "required": ["taste","cleanliness","seating","service","vibe","timing","summary"]
}
```

The `summary` (≤140 chars) becomes the owner-facing "improvement goal" per GDD §7.2.

### Fallback (per DECISIONS §8)

If no API key (or any Claude error per architecture §6), the server uses a deterministic heuristic scorer that string-matches the phrase banks from §6.3 to known sentiment buckets, mapping to 0–100. It will be less nuanced but functional.

---

## 8. Owner activities during open hours

All activities are **click-to-trigger**. None block anything else from happening; the world keeps simulating. None create a countdown.

| Activity                 | Trigger (click target)             | Real-time cost   | In-game effect                                                              |
| ------------------------ | ---------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| Coach a worker           | Click worker sprite                | Instant (radial menu open) | Apply preset coaching phrase (see §4.3 table).                    |
| Clean a station          | Click a dirty station glow         | 4 real sec hold  | +20 cleanliness on that station. Owner sprite plays mop animation.          |
| Clean the floor          | Click a dirt patch on floor        | 3 real sec hold  | +15 overall cleanliness. Floor patch disappears.                            |
| Accept worker question   | Click "?" bubble above worker      | Instant          | Worker gets +5 XP, +5 mood. No question = no penalty.                       |
| Greet customer           | Click customer when they enter     | Instant          | +3 to that customer's eventual Customer Service score (on the 0–100 scale). |
| Browse upgrades / unlocks| Click cash-register UI             | Modal opens; world simulates underneath | Purchase recipes, station upgrades, etc. (See §9 too.)             |
| Read latest review       | Click letter icon in HUD           | Modal opens      | Show last 5 reviews + scores + summary improvement goal.                    |
| Walk / observe           | Click an empty floor tile          | Instant          | Owner walks there. No effect. Cozy.                                         |

**Removed from MVP** (critique §4 scope creep / §5.6):
- **"Restock ingredients."** COGS is deducted automatically at served-time; running out of ingredients is a soft fail incompatible with the cozy promise. No pantry UI.
- **"Music/jukebox."** Requires audio pipeline + non-trivial sprite work; not in the chosen asset packs. Deferred to Phase 2.
- **"Decorate (place sprites)."** Free placement UI is non-trivial. Replaced by "Choose decor theme" in §9 quiet-hours.

**No activity has a fail consequence.** Worst case: not doing X means a slightly lower dimension score this day.

---

## 9. Quiet hours (5 AM – 8 AM ≈ 50 real seconds)

Quiet hours are a **slow, optional reflection period**, not a checklist with timer.

### What the owner can do

| Activity                                | Real cost | Effect                                                                              |
| --------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| Day-summary screen (default open)       | 0         | Shows totals: customers, sales, avg score per dimension, tips, mistakes.            |
| Read each individual review             | varies    | Click through reviews list. No limit.                                               |
| Hold one-on-one with worker             | 5 real sec each | See §4.4. One per worker per night.                                           |
| Purchase unlocks (menu / upgrades)      | Instant   | Spend cash earned today.                                                            |
| Hire a worker (3-candidate flow)        | Instant   | See §4.5.                                                                           |
| **Choose decor theme** (3 presets)      | Instant   | Cosmetic. Themes: *Driftwood*, *Sunset Lanterns*, *Coastal Modern*. +2 vibe next day. |
| **Skip to next day**                    | Instant   | Big "Open Tomorrow" button appears after day-summary is dismissed.                  |

**Removed:** "Decorate (place sprites)" — free placement UI is too heavy for MVP (critique §4). Replaced by the three preset themes above.

### Skippable? **YES — fast-forwardable, NOT auto-skipped.**

Per the cozy philosophy: a quiet 50-second pause is GOOD. We don't strip it out, but we never force the player to wait through it. The "Open Tomorrow" button is always available the moment they've seen the day summary. If the player walks away from the keyboard, the world simply waits at quiet hours instead of starting day N+1 — **no auto-advance**, because that could surprise a player who stepped away.

(Decision: "skippable on click, never auto-advance, never countdown.")

### Time-skip semantics (resolved per critique §6 Q4)

When the owner clicks "Open Tomorrow" during quiet hours:
1. Hard-jump the clock to 8:00 AM next in-game day.
2. Run end-of-day settlement once (wages paid, daily score computed, written to `daily_scores`).
3. Reset day-state (reset worker fatigue, refresh `cleanliness` decay floor, run the morning mood floor per §4.1 rule 1).
4. **No simulation between 5 AM and 8 AM** — the cycle skips that interval.

### Pause / reconnect (resolved per critique §6 Q5)

- The sim runs **server-side regardless of client polling state**. Closing the tab does NOT pause the world.
- A dedicated **"Pause" button** in the top-bar maps to `restaurants.is_paused`. Owner-controlled, explicit. Reopening a tab finds the current day in progress (or paused, if the owner paused).
- This is intentional: a passive "pause on tab close" mechanic creates surprise ("Why did my day jump 4 hours?") and complicates session state. Cozy means *predictable*, not *frozen-on-disconnect*.

---

## 10. Leaderboard formula

### 10.1 Per-restaurant composite score

Computed at **every in-game day end (5 AM)**:

```
DailyScore = (0.30 * AvgFeedbackScore_Normalized)
           + (0.25 * SalesScore_Normalized)
           + (0.20 * TeamScore_Normalized)
           + (0.15 * GrowthScore_Normalized)
           + (0.10 * ConsistencyScore_Normalized)
```

Where:

- `AvgFeedbackScore_Normalized` = (mean of all 6 dimensions today across all reviews) / **100.0**   → 0..1   *(0–100 scale per critique §1.1)*
- `SalesScore_Normalized` = min(1, today's_gross_sales / $500)   → 0..1
- `TeamScore_Normalized` = mean(worker_level / 5) × mean(worker_mood / 100)   → 0..1   *(worker_level is the 1–5 bucket derived from XP per §4.2)*
- `GrowthScore_Normalized` = min(1, unlocked_menu_items / 20)   → 0..1
- `ConsistencyScore_Normalized` = clamp(1 − (stddev(daily_avg_feedback_last_7_days, scale 0..100) / 25.0), 0, 1)   *(stddev units now match 0–100 scale)*

`DailyScore` ∈ [0, 1]. Multiply by 1000 for display ("**Score: 743**").

### 10.2 Rolling leaderboard rank

Leaderboard ranks owners by **`RollingScore = 0.6 * Avg(DailyScore last 7 in-game days) + 0.4 * BestDailyScore`**, multiplied by 1000.

### 10.3 Recompute frequency

- `DailyScore`: computed **once at day-end (5 AM in-game)**. Stored.
- `RollingScore` / leaderboard rank: recomputed at the same moment (day-end). Cheap.
- Leaderboard UI fetches the persisted rank — does not recompute on view.

### 10.4 No fail floor

Per DECISIONS §10: lowest possible `DailyScore` is positive (~0.05 from minimum sales). Bad days lower your rank but you cannot be "kicked off" the board.

### 10.5 Leaderboard visibility (critique §2.8)

- **Top 10 only.** Never more. The list is a celebration, not a 50-deep ladder.
- Sort by **`RollingScore`** (the forgiving 7-day metric) — not by today's `DailyScore`. Bad single days don't yank you off the list.
- **Never display "you are rank #N."** Your own restaurant appears in the top 10 only if you're actually top-10 — no special highlight, no callout.
- The owner's own score appears in the dashboard top-bar as a personal metric (`"Score: 743"`), divorced from rank.

---

## 11. No-fail / no-rush check

Audit of every numeric and mechanic above against DECISIONS §10. Borderline cases and how they were defused:

| Potential issue                                             | Defused?  | How                                                                                                                                  |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Customer "patience" sounds like a timer.                    | Yes       | Patience only colors review *tone*, never causes a walk-out, never withholds payment. No on-screen patience meter. (§5.2)            |
| Quiet hours = 50 real sec — sounds short, might rush owner. | Yes       | Quiet hours never auto-advance. The "Open Tomorrow" button is opt-in. World just waits if owner stops clicking. (§9)                 |
| Day-night cycle of 5 min — players will feel "a day ended too soon". | Yes | But no day-end *consequence* is bad. Money carries over; reviews persist; no streaks are broken; you can sit at quiet hours forever. |
| Worker "mistakes" — sounds like a fail event.               | Yes       | Mistake = worse Taste score on that one review. Customer still pays. No order is destroyed. (§4.1)                                  |
| "Struggling worker" trigger — sounds punitive.              | Yes       | It only enables a *gentle* quiet-hours conversation that gives mood/XP buffs. There is no firing, no warning, no penalty. (§4.4)     |
| Leaderboard creates competitive pressure.                   | Mostly    | Per GDD §10, leaderboard exists but is not the *reward*. We made the lowest possible score positive and emphasized rolling 7-day avg, which forgives a single bad day. (§10) |
| Coaching cooldowns — could feel restrictive.                | Yes       | Cooldowns are 8–15 sec real (short). They prevent spam-clicking the same phrase, not engagement. Praise has shortest cooldown.       |
| Unlock cost gating — could create money anxiety.            | Yes       | Lowest unlock is $25 (Ice Pop), starter cash is $150, and starter menu is *complete enough* to play indefinitely. Unlocks are bonus, not survival. (§2, §3) |
| Cleanliness ticks down → feels like maintenance pressure.   | Yes       | Cleanliness affects review scores at the margin, but not at the dimension floor (min score is 1 from a negative mention, not from a number). Owner can ignore cleaning a whole day with no fail event. (§8) |
| Customer arrival rate is high at peak (5/in-game-hr).       | Yes       | Customers do not refuse to come back; orders never expire; the simulator just queues them. If a worker is slow, customers wait. The worst outcome is grumpier reviews, not lost customers. |

| Mood spiral (L1 worker decays to 0 by day 2)                | Yes       | **Morning mood floor of 50** on day rollover + **no mood decay while idle** (§4.1). Caps daily decay at ~20 even at L1. Critique §2.2 fix applied.                                                                                              |
| "Struggling worker" sad icon over a worker (open hours)     | Yes       | **Removed** (§4.4). Flagged status surfaces only in the quiet-hours panel as a soft suggestion, never as an on-canvas tag during open hours. Critique §2.4 fix applied.                                                                          |
| Cleanliness decay rate creating urgency                     | Yes       | Locked at 2 points per in-game hour (§1). Starting at 80, an ignored day ends ~38 — meaningful but never urgent. Cleanliness never triggers a closure event. Critique §1.13 / §2.5.                                                              |
| Coaching cooldowns rendered as countdown                    | Yes       | Cooldown UI is a soft tooltip with NO numeric timer (§4.3). Critique §2.1.                                                                                                                                                                       |

**Conclusion:** Design is consistent with no-fail / no-rush. All threats neutralized, including the borderline cases the critique surfaced.

---

## 12. Open questions — RESOLVED by Phase-2 critique

All five Phase-1 open questions are now answered (see `docs/critique.md` §6). Summary:

1. **Tick rate & determinism** → 1 Hz world tick (architecture §4.1) **plus per-event scheduling for customer arrivals**. The per-event spawner uses `setTimeout` at precomputed Poisson offsets per in-game hour. Critique §1.4.
2. **State persistence frequency** → architecture §4.1 specifies every-5-tick flush for soft state + immediate transaction on every discrete event (order placed, served, review created, hire, coaching, day rollover). Worst-case crash loss = 5 in-game seconds.
3. **Claude scorer batching** → **per-review, async** (not batched). The UI shows a "scoring…" affordance on the one review card and resolves when ready. Designer's "batch at day-end" preference retracted — reviews can be opened mid-day, so they need to be scored as they arrive. Critique §1.3.
4. **Time skip semantics** → hard-jump the clock to 8 AM next day, run end-of-day settlement once, reset day-state. No simulation between 5 AM and 8 AM. (Documented in §9 above.) Critique §6.
5. **Reconnect behavior** → **sim runs server-side regardless of client.** Tab close ≠ pause. Owner-controlled `is_paused` button instead. (Documented in §9 above.) Critique §6.
