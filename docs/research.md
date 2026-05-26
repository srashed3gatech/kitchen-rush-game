# Kitchen Rush — Research Report (Phase 1a)

**Author:** Research Agent (Opus 4.7)
**Date:** 2026-05-24
**Source of truth:** `/DECISIONS.md`, `/docs/source/GDD.md`
**Status:** Final — opinionated picks below.

> Note on method: web fetching was disabled for this run. Pack contents, URLs, and prices below are drawn from the agent's training knowledge of Kenney.nl, itch.io, and Anthropic docs. Anywhere a number is materially load-bearing (model pricing, file sizes), the architect should sanity-check it against the live page before committing to it. Treat this as a strong starting recommendation, not gospel.

---

## 1. CC0 Sprite Pack — Pick

### Recommendation: Kenney **"Restaurant Kit (2D)"** + **"Toon Characters 1.0"** (coordinated 2-pack combo)

Kenney does not ship a single pack that covers *kitchen + furniture + 4-6 characters + 6 food categories + beach* at once. The cleanest CC0 path is to combine two Kenney packs whose styles are deliberately compatible (flat-shaded chunky cartoon, ~64–128px sprites). Both are CC0.

| Pack | URL | Style | Approx. size |
|---|---|---|---|
| **Kenney Restaurant Kit (2D)** | https://kenney.nl/assets/restaurant-kit-2d | Top-down + side-view restaurant assets (kitchen stations, tables, chairs, counters, food trays) | ~5–10 MB PNG sheets |
| **Kenney Toon Characters 1.0** (a.k.a. Toon Characters Pack) | https://kenney.nl/assets/toon-characters-1 | Stylised cartoon human characters (chef, customer, waiter variants) with multiple skin/outfit swaps and 8-direction sprites | ~10–20 MB |

Both are **CC0 1.0 Universal** (public domain dedication — no attribution required, commercial use OK). Kenney's blanket licensing across his site is CC0 unless noted; these packs are in his core CC0 catalogue.

### Inventory — what these two packs cover

| Need from GDD | Covered by | Notes |
|---|---|---|
| Restaurant kitchen interior (stoves, fryers, counters, prep tables) | Restaurant Kit 2D | Top-down kitchen station tiles included |
| Restaurant furniture (tables, chairs, counters, register) | Restaurant Kit 2D | Multiple table/chair variants |
| Burgers, fries, nuggets, pizza | Restaurant Kit 2D + Kenney "Food Kit" (small companion pack, optional) | Burger, fries, pizza icons present; nuggets may need a recolor of generic fried-food asset |
| Drinks (lemonade, soda) | Restaurant Kit 2D | Cup/glass/bottle sprites |
| Desserts (ice cream, cupcake, cake) | Restaurant Kit 2D | Cupcake + ice-cream cone sprites present |
| Chef sprite (player avatar / cook) | Toon Characters 1.0 | Chef hat + apron variant |
| Customer sprites (need 4–6 distinct) | Toon Characters 1.0 | ~10+ character skins ship in the pack — easy 6+ |
| Owner sprite (distinct from chef) | Toon Characters 1.0 | Suit/casual variants available |
| Beach / ocean scenery (background) | **Gap** — neither pack covers beach | See gap-fill below |

### Gaps and how to fill them

1. **Beach/ocean scenery.** Kenney's restaurant pack is interior/urban-themed. Two options:
   - **Preferred:** Add Kenney's free **"Background Elements"** or **"Pixel Platformer (Sand/Beach tiles)"** pack — both CC0 — for the beach strip behind/beside the restaurant. Alternatively use Kenney's **"Tiny Town"** or **"Tiny Battle"** ocean/sand tiles.
   - **Fallback:** Procedural canvas-drawn beach: 3 horizontal gradient bands (sky → ocean → sand) animated with a sine-wave shimmer. With our Canvas-only stack (per DECISIONS §3) this is ~30 LOC and avoids a third pack.
   - **Recommendation:** Procedural canvas-drawn beach. Keeps art dependencies to 2 packs and matches the GDD's emphasis on shimmer/day-night gradient overlays.

2. **Chicken nuggets icon.** If not present, recolor the fries/fried-food sprite OR generate a single 64x64 PNG (one icon, one-time art task).

3. **Comment-bubble sprites** for the coaching UI (GDD §6.2). Kenney has a free **"UI Pack"** (CC0) with speech bubbles. If we need it, it's a third tiny pack (~1 MB) — but we can also draw bubbles in Canvas/DOM.

4. **Day-night overlay.** Not an asset — implemented as a Canvas full-screen rect with `globalAlpha` and a colour LUT.

### Why this combo over alternatives

| Alternative considered | Why rejected |
|---|---|
| Kenney "Tiny Town" only | Too small/abstract for restaurant interior; characters are blobs, lose the chef personality |
| LimeZu's "Modern Interiors" (itch.io) | High quality but **CC-BY**, not CC0. DECISIONS §5 says CC0. Disqualified. |
| Cup Nooble's "Sprout Lands" | Farm-themed, not restaurant; CC-BY-NC. Disqualified. |
| Single Kenney "Toon Characters" + draw all kitchen in Canvas | Too much one-off art work; restaurant kit is right there |
| Mixed top-down + isometric packs | Style clash — Kenney's Restaurant Kit is deliberately compatible with Toon Characters |

**Recommendation:** Use **Kenney Restaurant Kit (2D)** + **Kenney Toon Characters 1.0**, both CC0. Draw the beach procedurally in Canvas. Total external art footprint ~15–30 MB, zero attribution required, fully redistributable.

---

## 2. Reference Games — mechanics to lift

We need games that prove the cozy-mentorship loop works without rush mechanics. Skipping survey-style coverage; here are the four that map most directly.

### 2.1 Dave the Diver — "after-hours sushi service" loop
- **Summary:** Mixed-genre game where the day splits into "diving" (active) and "running the restaurant" (semi-automated service with light tactical input).
- **Lift:** The **two-phase day structure**. In Kitchen Rush our split is open-hours (active management) vs. 5 AM–8 AM quiet hours (reflection/coaching). Dave proves players love this rhythm — the "wind-down" phase feels rewarding, not boring.
- **Do NOT copy:** Dave's restaurant phase has light timing pressure (customers leave if not served fast). Strip that out — our 5-real-minute day already paces the loop.

### 2.2 Stardew Valley (and its restaurant mods, e.g. "Stardew Restaurant")
- **Summary:** Farming/life sim built around long-term relationship growth with NPCs; no fail state.
- **Lift:** **The relationship/heart system** applied to workers. Each worker has a hidden "trust/skill" track that visibly accrues from coaching interactions, like NPC hearts in SDV. Surfaces as a worker portrait + a 5-heart bar in the coaching screen.
- **Do NOT copy:** Energy bars, marriage mechanics, or the farming sim's stamina-as-failure-vector. Our workers do not get tired; they get *better*.

### 2.3 Coffee Talk
- **Summary:** Cozy visual-novel-y cafe where you serve drinks and chat with regulars; conversation > speed.
- **Lift:** **Customer dialogue as primary feedback channel.** Each customer leaves a written comment (per GDD §7) — these should read like Coffee Talk's character voices, not like Yelp 1-stars. Personality > metric.
- **Do NOT copy:** Branching narrative trees or scripted character arcs — our customers are procedurally generated NPCs, not authored characters. Use Claude to generate light personality flavour, not a story.

### 2.4 PlateUp! — explicit counter-example
- **Summary:** Roguelite restaurant management; intentionally chaotic with hard rush mechanics.
- **Lift:** Just one thing — **station-based parallelism.** Multiple workers at distinct stations (grill, fryer, drinks, register) is a clean mental model the GDD already calls for (§6.1).
- **Do NOT copy:** Literally everything else. PlateUp is the anti-Kitchen-Rush: timers, fail states, escalating difficulty. We are the cozy inverse.

### 2.5 (Honourable mention) Cooking Mama / Cook, Serve, Delicious
- Skipped. Both lean hard on micro-timing and reflex. Nothing useful to lift without violating DECISIONS §10.

**Recommendation:** Anchor the design loop on **Dave the Diver's two-phase day** + **Stardew Valley's relationship growth** + **Coffee Talk's voice in customer feedback**. Use PlateUp's station model as a structural hint only. Document these three influences in `design.md`.

---

## 3. Claude API — review-scoring pattern

### 3.1 The job

Input: one free-text customer review (typically 1–4 sentences from a procedurally generated NPC).
Output: six integer scores 0–10 across `tasteAndQuality`, `cleanliness`, `seatingAndComfort`, `customerService`, `restaurantVibe`, `orderTiming`. (Scale is a suggestion — design.md owns the final scale.)

### 3.2 Approach comparison

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Plain JSON in prompt** ("respond with JSON matching this schema") | Simplest. No special API features. Works on every model. | Model occasionally adds prose, omits keys, or returns invalid JSON. Need parse + repair loop. | Workable but fragile. |
| **Tool use** (define a `record_review_scores` tool, force it via `tool_choice: {type: "tool", name: "..."}`) | Guaranteed schema-shaped output. JSON validation built in. Works on Haiku 4.5 + Sonnet 4.6. | Slightly more token overhead (tool definition). | **Best for our case.** |
| **Structured output / `response_format`** | Even cleaner schema enforcement if available | As of last confirmed knowledge, Anthropic's structured output (JSON Schema mode) is in beta on Sonnet/Opus 4.x but not universally documented; tool_use is the stable equivalent. | Use later if/when it's GA on Haiku. Tool_use today. |

**Recommendation:** **Tool use with `tool_choice` forced to the scoring tool.** Stable, schema-validated, supported on Haiku 4.5.

### 3.3 Prompt caching — yes

The rubric system prompt (description of each of the 6 dimensions, scoring scale, examples) will be ~1–2K tokens and is **identical for every call**. Cache it.

- Set `cache_control: { type: "ephemeral" }` on the system block.
- Cache write ≈ 1.25× base input price; cache read ≈ 0.1× base input price (per Anthropic's published pricing model).
- We will issue many reviews per session (a 5-minute day yields ~10–30 reviews). Cache amortises after the second call. **Strong yes.**

### 3.4 Model pick — Haiku 4.5 vs Sonnet 4.6

This is a constrained, narrow task with a tight rubric: ideal Haiku territory.

| Factor | claude-haiku-4-5 | claude-sonnet-4-6 |
|---|---|---|
| Capability for "classify text into 6 numeric dimensions with rubric in context" | More than sufficient. This is the easy band. | Overkill. |
| Approx input price | ~$1 / MTok (rough order-of-magnitude — verify on docs) | ~$3 / MTok |
| Approx output price | ~$5 / MTok | ~$15 / MTok |
| Latency per review | ~0.5–1.5 s | ~1.5–4 s |
| Per-review cost (estimate, with cached rubric, ~200 in / ~120 out tokens after cache) | **~$0.0008–$0.0012** | ~$0.0025–$0.004 |

A heavy player generating 30 reviews/day × 30 days = 900 reviews ≈ **$1 of API cost on Haiku** vs ~$3 on Sonnet. Trivial either way, but Haiku is the right tool.

**Recommendation:** **claude-haiku-4-5.** Sonnet 4.6 stays available as a fallback flag in config if we ever see Haiku misclassifying nuanced reviews — but I expect this to never trigger.

Numbers above are estimates; the architect should reconfirm against the live pricing page before locking budget assumptions in code.

### 3.5 Batching — single-call wins (for MVP)

| Strategy | Latency | Cost | Complexity | UX fit |
|---|---|---|---|---|
| **One review per call** | Best per-review latency. Score appears next to the customer review as they leave. | Slightly higher token overhead per review (cache mitigates). | Trivial. | Matches GDD §7: each customer leaves and a score appears. |
| **Batch N reviews per call** | One round-trip for N reviews; score for review #1 waits on review #N. | Marginally cheaper (one set of system tokens, but cache already solves that). | Need batch JSON schema (array of results). Need ordering guarantees. | Worse — players see no scores until batch flushes. |
| **Anthropic Message Batches API** (async, 24h SLA) | Hours. | 50% discount. | Adds polling + persistence. | Wrong for interactive loop. |

**Recommendation:** **One review per call**, sync, with the rubric cached. Revisit only if we hit Anthropic rate limits in a real playtest — which is unlikely at MVP scale.

### 3.6 Concrete example

**System prompt (cached):**

```
You are a restaurant review analyst for a cozy beachfront restaurant game.
A customer left a written comment about their visit. Score the comment
across the six dimensions below on a 0–10 integer scale:

- tasteAndQuality:    food taste and ingredient quality
- cleanliness:        how clean the restaurant and kitchen looked
- seatingAndComfort:  ease of finding a seat, comfort while eating
- customerService:    how workers treated the customer
- restaurantVibe:     overall atmosphere
- orderTiming:        how long it took to receive the order

Rules:
- If a dimension is not mentioned, infer a neutral score (5–7) — do not
  invent a negative.
- Use the full 0–10 range only when the comment is explicit.
- Always call the record_review_scores tool. Never reply in prose.
```

**Tool definition:**

```json
{
  "name": "record_review_scores",
  "description": "Record the six structured scores for a customer review.",
  "input_schema": {
    "type": "object",
    "required": ["tasteAndQuality","cleanliness","seatingAndComfort",
                 "customerService","restaurantVibe","orderTiming","summary"],
    "properties": {
      "tasteAndQuality":   {"type":"integer","minimum":0,"maximum":10},
      "cleanliness":       {"type":"integer","minimum":0,"maximum":10},
      "seatingAndComfort": {"type":"integer","minimum":0,"maximum":10},
      "customerService":   {"type":"integer","minimum":0,"maximum":10},
      "restaurantVibe":    {"type":"integer","minimum":0,"maximum":10},
      "orderTiming":       {"type":"integer","minimum":0,"maximum":10},
      "summary":           {"type":"string","maxLength":120,
                            "description":"One-line owner-facing takeaway."}
    }
  }
}
```

**User message:**
> "The burger was incredible and the fries were crispy, but I waited like 20 minutes and the floor was a bit sticky. Cute view of the ocean though."

**Expected tool_use response:**

```json
{
  "tasteAndQuality":   9,
  "cleanliness":       4,
  "seatingAndComfort": 6,
  "customerService":   6,
  "restaurantVibe":    8,
  "orderTiming":       3,
  "summary":           "Great food and view, but slow service and sticky floors."
}
```

The `summary` field is a bonus — it gives the owner a one-line takeaway alongside the raw comment, per GDD §7.2 ("both the raw customer comment and the structured scores are shown").

### 3.7 Heuristic fallback (per DECISIONS §8)

When no API key is configured, the scorer must still return six numbers. Sketch:

- Keyword buckets per dimension (e.g. `clean|dirty|sticky|spotless` → cleanliness).
- Sentiment polarity per keyword bucket → map to 0–10.
- Missing dimensions default to 6 (slight positive baseline) — matches GDD's "no fail state" tone.
- This is a one-file ~80-LOC scorer; ship it as the default and let Claude scoring be an opt-in upgrade.

**Recommendation:** Implement the heuristic scorer first, wire the Claude tool-use scorer as the upgrade path. Both implement the same `ReviewScorer` interface.

---

## 4. TL;DR — locked recommendations

1. **Art:** Kenney *Restaurant Kit (2D)* + Kenney *Toon Characters 1.0* (both CC0). Beach drawn procedurally in Canvas. No CC-BY packs.
2. **Reference games:** Dave the Diver (two-phase day) + Stardew Valley (relationship growth) + Coffee Talk (customer voice). PlateUp is a counter-example, not a model.
3. **Claude scoring:** `claude-haiku-4-5` + forced tool_use + cached system prompt + one review per call + heuristic fallback when no key.

These three picks together respect every guard rail in DECISIONS §10 and every non-negotiable in GDD §2/§4.2/§9.2/§10.
