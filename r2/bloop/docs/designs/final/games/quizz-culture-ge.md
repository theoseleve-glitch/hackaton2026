# Au Pif ! / Ballpark! — Final Design (SHIPPED)

| | |
|---|---|
| **Game id** | `quizz-culture-ge` |
| **Names** | FR **Au Pif !** · EN **Ballpark!** |
| **Template + mode** | `INPUT_GUESS` · mode `closest-number` (1st mode built on the template) |
| **Players** | **2–16** (`minPlayers: 2`, `maxPlayers: 16` from the module) |
| **Spicy tier** | **0** (no 18+ content; see §5) |
| **Physical** | **seated** (phone-in-hand, around a table) |
| **Status** | **SHIPPED** — implemented, reducer-tested, playable |

Module: `packages/games/input-guess/src/input-guess.ts` · `state.ts` · `actions.ts`
Config: `QUIZZ_CULTURE_GE_CONFIG` (`state.ts:108`) · Content: `content/packs/quizz-culture-ge.json` (v1, 156 items)

---

## 1. Pitch & room fantasy

**One-liner:** Trivia where *nobody knows the answer* — an off-beat culture-gé question with a verified number ("the world's shortest scheduled flight, in seconds?"); everyone secretly types a guess; all guesses pop onto a number line, the true answer slams in, **closest takes the round.**

**Room fantasy.** Au Pif! removes trivia's party-killer: nobody is ever blocked by not knowing, because **guessing IS the game.** A 2-player room and a 16-player room both stay live. The fantasy is the table collectively bluffing confidence about numbers no one could possibly know, then the number line exposing exactly *how wrong* everyone was. The manufactured laugh is two-stage: (1) the reveal animation ranks everyone's hubris in public, and (2) the **funFact punchline** roasts the world *and* the players ("the T-Rex is closer in time to your phone than to the Stegosaurus — yes, Jurassic Park lied to you"). The argument it manufactures is the post-reveal "no way, that can't be right" — which the funFact pre-empts by doubling as the answer's justification, so the table can't relitigate the fact, only their own bad guess. The number-line reveal is the designed shareable/TikTok beat.

---

## 2. Shipped ruleset (AUTHORITATIVE)

All numbers below are quoted from `QUIZZ_CULTURE_GE_CONFIG` and the reducer.

### Phases

| Internal phase | `phaseKey` | Duration | What happens |
|---|---|---|---|
| `guess` | `guess:r{n}` | **20 000 ms** (`guessMs`) | Off-beat numeric question shown. Each player types an integer on a numeric keypad (≤ 9 digits, integers only). Submission lands in the **HIDDEN** `submissions` buffer; only `hasSubmitted` (booleans) + the owner's own echo (`mySubmission`) are viewable. Early-resolves the instant `allActed(connectedPlayers)` is true (`earlyAdvanceOnAllSubmitted: true`). |
| `reveal` | `reveal:r{n}` | **12 000 ms** (`revealMs`) | Atomic promotion of the hidden buffer into `lastResult`: all guesses + the true `answer` + per-player points + the bilingual `funFact` become public. Emits `round_revealed` on entry; emits `round_completed` on the deadline exit — **this exit is the shell's client-side ad-cue boundary.** |
| `over` | `over` | **untimed** (`phaseDurationMs` returns `null`) | Final podium with per-match `scores`; the `gameOver` effect carries a defensively cloned scores map. Shell fires the interstitial off the `phaseKey → 'over'` transition + shows replay CTA. Session XP is **placement-based**, not raw points (platform convention). |

`totalRounds: 8`, but `init` clamps it to `min(8, items.length)`; with a 156-item pack a full match is always 8 rounds. The pool is **seed-shuffled once at init** (`shuffle(rng, items.filter(isNumberItem))`), deterministic and identical for all viewers; items past `totalRounds` are never reached.

### Scoring (exact constants)

Per round, over the **connected answerers** (a non-submitter simply has no entry):
1. Rank answerers by `|guess − answer|` ascending. Stable sort → roster order breaks ties deterministically.
2. **Competition ranking** with `pointsByRank: [100, 50, 25]` — 1st **100**, 2nd **50**, 3rd **25**, everyone else **0**. Ties share the rank's full points and **skip** the next rank (two tied closest → both 100, the next distinct player gets 25, i.e. `pointsByRank[2]`).
3. **Exact hit** (`d === 0`) adds **+50** "Pile !" bonus (`exactBonus`).
4. **Final round** (`round === totalRounds − 1`): all points **×2** (`finalRoundMultiplier`).
5. `bustIfOver: false` — over-bidding is **not** punished at launch (the `busted[]` path exists in the reducer but is inert for this config).

Worked: single answerer → 100 (or 200 in the finale). Zero answerers → nothing awarded, round still advances on the reveal deadline. Exact hit in the finale → `(100 + 50) × 2 = 300`.

### Win / draw / tie

The match winner is the highest cumulative `scores` entry at `over`. The reducer does **no tie-break at the match level** — equal final totals are a genuine shared podium (the cloned `scores` map is what the shell ranks). Within a round, distance ties are resolved by shared points + skipped ranks as above; the roster-order stable sort only affects the displayed `ranking[]` order, never points.

### Presence / disconnect

- `init` seeds presence via `initPresence(players)`; all listed players start connected.
- `playerLeft` / `playerRejoined` flip `connected[playerId]`; unknown players and no-op transitions return the **same state reference**.
- **A disconnected or passive player never blocks the room.** `allActed` is evaluated over `connectedPlayers` only, so early-advance fires when every *connected* player has submitted. A `playerLeft` that completes the expected set during `guess` triggers an immediate `resolve`.
- Timeout fallback is absolute: on the `guess` deadline the round resolves with whatever's in the buffer; on the `reveal` deadline it advances. A fully passive room rolls forward to `over` on deadlines alone.

### Redaction (what's secret from whom)

- During `guess`: `answer` and `funFact` are **never** in the view. Other players' guesses are hidden — only `hasSubmitted: Record<PlayerId, boolean>` (who's locked in) and the viewer's own `mySubmission` are exposed. This is the HiddenBuffer convention.
- At `reveal`: the buffer is promoted atomically into `ClosestRoundResult` — every guess, the answer, per-player points, exact hits, and the funFact all become public simultaneously. There is no per-viewer secrecy at reveal.
- Authoring-only fields (`tags`, `difficulty`, `spicy`, `verifiedAt`, `source`) are stripped by the pack adapter and never reach any view.
- Server-authoritative throughout; the keypad is the only input and it is numeric-only → **zero free-text moderation surface.**

---

## 3. Content model

### Item shape (authored, bilingual)

```jsonc
{
  "id": "kebab-slug",                       // unique
  "question": { "fr": "...", "en": "..." }, // the deadpan-baroque prompt
  "answer": 90,                             // integer, canonical verified truth — the ONLY scoring input
  "unit":   { "fr": "secondes", "en": "seconds" } | null,  // null for years
  "format": "plain" | "year",               // 'year' renders the reveal as a timeline
  "scale":  "linear" | "log",               // number-line rendering hint for huge ranges
  "funFact": { "fr": "...", "en": "..." },   // reveal punchline; doubles as the answer's justification
  "tags": ["geography","wtf"],              // authoring-only
  "difficulty": 1 | 2 | 3,                  // authoring-only
  "spicy": 0,                               // authoring-only
  "verifiedAt": "2026-06",                  // fact-check stamp, authoring-only
  "source": "..."                           // provenance, never shown to players
}
```

### Counts (shipped pack, `version: 1`, `generatedAt: 2026-06-11`)

- **156 items.** Format: 114 `plain`, 42 `year`. Scale: 143 `linear`, 13 `log`. Spicy: **all 0.**
- Difficulty tiers: **24 × D1**, **81 × D2**, **51 × D3**. No duplicate ids; no answer exceeds 9 digits; BC dates carried as positive integers with a localized unit (`rome-founded-bc = 753`, unit "av. J.-C." / "BC").
- **Sizing lint** (synthesis §3.5: ≥ `totalRounds × 3` = **24** per difficulty tier so a max session never repeats): D2/D3 clear it comfortably; **D1 sits exactly at the floor (24).** Flagged in §8.

### What's AI-precomputed offline

`needsOfflineAiPipeline: true`. AI drafts the estimation questions + funFact punchlines **offline only — never at runtime.** Every item carries `answer` + `source` + `verifiedAt`. The pack passes the content gate (schema, sizing lint, profanity scan, replay smoke, **human fact-check — non-negotiable**) before `enabled: true` at `rolloutPct 5`. Runtime is a pure deterministic reducer; corrections ship as immutable pack version bumps via the KV kill switch, no deploy. Publish pipeline splits the bilingual master into single-locale packs `quizz-culture-ge-fr` / `quizz-culture-ge-en` (one pack id = one locale, shell-resolved at `startGame`); FR/EN parity is a pipeline lint.

### Voice / tone (content-voice-guide §5, item 4)

**Smug-encyclopedia.** Questions are deadpan-baroque ("in SECONDS?"). funFacts are punchlines that roast the players' guesses *and* the world ("plus court que ta story Insta"; "Jurassic Park lied to you"). The voice knows everything and is unimpressed by everyone — never dry textbook copy; **every funFact ends on a drop.** Numbers/facts re-localize, not just translate: units swap (km ↔ miles), and FR/EN funFacts must be **natively funny in each language**, not machine-translated.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / hostTunable item, ruled.

| # | Was (open/deferred item) | FINAL decision | Why |
|---|---|---|---|
| D1 | *Which twist format wins (brief: pick ONE)?* | **Ship v1 — Twist A "closest wins"** numeric estimation, as shipped. | Removes trivia's party flaw, zero moderation surface, deterministic scoring, best shareable reveal. Done. |
| D2 | *Twist B — Fibbage-style "fool the others"* | **Roadmap v2 — `fool` mode** on the same INPUT_GUESS catalog entry. Spec: write-a-fake → shuffle fakes+truth → vote; +80 find-truth, +60 per player fooled. **Gated on the hardened DO text-moderation path** (obscenity filter, `normalizeText` collision handling, vote sub-phase). | Highest comedy ceiling but heaviest free-text surface; closest-number ships sooner and safer. Not v1. |
| D3 | *Twist C — "Le Piège" hivemind-trap MCQ* | **Cut as a mode; roadmap v3 as a content-pack flavor only.** No new mechanic — a later MCQ-flavored pack at most. | Weakest differentiation (MCQ feels generic), hardest content to generate, predict-the-room overlaps Hot Seat. Not worth fragmenting launch. |
| D4 | *Template fit — is this a new template?* | **Ship v1 — third mode `closest-number` of INPUT_GUESS, built FIRST.** | New-params effort (one reveal-resolver branch + numeric keypad), not a new template; simplest mode de-risks the skeleton. Shipped. |
| D5 | *Exact scoring / anti-runaway balance* | **Ship v1 as coded:** `[100,50,25]` competition ranking, `+50` exact, `×2` finale. | Flat top-3 keeps rounds swingy at any count; ×2 finale keeps trailers alive; exact bonus = scream moment. Verified in reducer tests. |
| D6 | *`bustIfOver` (price-is-right over-bid elimination)* | **Ship v1 = false; roadmap v2 as a "Juste Prix" sibling config** (`bustIfOver: true`). Param already exists + reducer path is live. | Iconic but brutal for casuals; config-only variant costs nothing once the param exists. Host-toggle deferred to the themed sibling, not the base game. |
| D7 | *Original culture-gé at scale without runtime AI* | **Ship v1 — offline pipeline as built.** AI offline only; verified `answer`/`source`/`verifiedAt`; human fact-check gate; KV kill switch for corrections. | The "original" feel is a content problem the offline-pack + staged-rollout machinery already solves. Runtime stays pure. |
| D8 | *Huge-range answers / troll inputs* | **Ship v1 — per-item `scale:'log'` (13 items use it) + hard `maxInputDigits: 9`** clamped in both the zod schema (`max(999_999_999)`) and the reducer. | Renders million-vs-single-digit ranges readably; the digit clamp blocks troll mega-inputs. Done. |
| D9 | *Tie / precision edge cases* | **Ship v1 — locked in reducer tests:** integers only, competition ranking, single answerer → 100, zero answerers → nothing + round advances on deadline, exact = `d===0`. | Edge cases must be frozen before content scales. Verified. |
| D10 | *Skill spread (strong estimator runs away)* | **Ship v1 mitigation as coded** (flat payout + ×2 finale); **operational rule:** watch `round_completed` / abandon analytics at `rolloutPct 5` before promoting. No mechanic change at launch. | Math keeps trailers alive; promotion is data-gated, not a redesign. |
| D11 | *FR/EN funFact parity* | **Ship v1 — FR/EN parity is a pipeline lint;** funFacts authored natively-funny per locale, not machine-translated. | Quality gate, already enforced in the publish split. |
| D12 | *Host-tunable surface (round count, spicy toggle, debate length)* | **Ship v1 lobby allowlist = §6** (rounds, reveal length; no spicy toggle since no spicy tier). | Keeps host controls to safe, balance-neutral knobs. |

No "TBD" remains.

---

## 5. 18+ spicy sibling config

**Ruling: NO spicy tier for the base game (`spicy: 0` across all 156 items, ships as-is).**

Reasoned: the fun here is *estimation hubris + a factual roast*, not innuendo. The voice already lands its edge through smug factual punchlines ("the Revolution kicked off by freeing the cast of a sitcom"), which need no 18+ register. A pure-numeric keypad + verified-fact content has **no free-text surface and no suggestive mechanic** to make spicy, so an 18+ tier would only mean swapping in racier *facts* — low payoff, and it dilutes the family-table inclusivity that is the template's whole point.

**Concrete fallback if an 18+ sibling is ever greenlit (roadmap, not v1):** it is a **separate pack id**, not an in-game toggle — `quizz-culture-ge-spicy-fr` / `-en`, `minAge: 18`, items tagged `spicy: 1|2`, gated by the shell's age wall and surfaced as a distinct catalog entry. **Zero mechanic change** — same reducer, same scoring, same redaction; only the content pool differs (e.g. "guess the number" facts about anatomy, world records of a saucier kind). No `publicPicks`/anonymity change is relevant — guesses are already private until the simultaneous reveal. Default posture: **do not build it** unless content analytics show demand.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

Allowlist (everything else in the config is fixed for balance/determinism):

| Param | Default | Safe range | Notes |
|---|---|---|---|
| `totalRounds` | **8** | **5–12** | Auto-clamped to `min(value, items.length)`; pack (156) never limits this. |
| `revealMs` | **12 000** | **8 000–20 000** | "Debate length" — how long the funFact + number line stay up for table arguing. |
| `difficultyMix` | balanced | preset: `chill` (D1-weighted) / `balanced` / `brutal` (D3-weighted) | Selects the seed-shuffle filter pool; never changes scoring. |

**Locked / not host-tunable:** `guessMs` (20 000 — tuned for the keypad beat), `pointsByRank`, `exactBonus`, `finalRoundMultiplier`, `maxInputDigits`, `bustIfOver` (sibling-config only), `earlyAdvanceOnAllSubmitted`. **No spicy toggle** (no spicy tier). Ranges are advisory caps the lobby UI enforces; the reducer is config-agnostic and trusts the validated config.

---

## 7. Future modes roadmap

| Mode / variant | Decision | One-line spec |
|---|---|---|
| `closest-number` (base) | **Shipped v1** | The game as documented above. |
| "Juste Prix" sibling | **Roadmap v2** | Same module, sibling config `bustIfOver: true` (over-bidders eliminated from the round); price-is-right themed pack. Reducer path already live. |
| `fool` (Fibbage-style) | **Roadmap v2** | New mode on this catalog entry; write-a-fake → vote; needs the hardened DO text-moderation path first (D2). |
| Spicy sibling pack | **Roadmap v3 / on-demand** | Separate `…-spicy` pack id, `minAge: 18`, no mechanic change (D5/§5). Build only on demonstrated demand. |
| "Le Piège" MCQ flavor | **Cut as a mode** | Roadmap at most as a later MCQ-flavored content pack, never a distinct mechanic (D3). |
| `crowd-target` (sibling game) | **Already shipped separately** | Same INPUT_GUESS template, different game (`cinquante-cinquante`); listed only to note the template's second mode is live. |

---

## 8. Risks & content-ops notes

- **Sizing-lint risk (D1 at the floor).** Difficulty 1 has **exactly 24** items = the `totalRounds × 3` minimum. Any single D1 item being pulled (fact correction, lint failure) drops the tier below the no-repeat threshold for a max-rounds `chill` session. **Action:** treat D1 as the priority authoring backlog; keep a ≥ 6-item buffer above the floor per tier before promoting past `rolloutPct 5`.
- **Fact drift = the headline reputational risk.** Numeric answers can silently go wrong (records broken, surveys updated). The **time-stable-facts authoring rule is hard** (no live populations, prices, breakable records); `verifiedAt` + `source` on every item; immutable pack versioning + KV kill switch for instant correction without deploy. A viral wrong answer is a reputational hit — the **human fact-check gate is non-negotiable.** Already two items lean on "official 2020/2022 survey" figures (`everest-height-m: 8849`, `eiffel-tower-height-m: 330`) — these are the freshness-decay watch items.
- **Disputed answers spark table arguments.** Mitigation is structural: every funFact doubles as the answer's justification, and the offline gate rejects any question whose answer has credible competing values.
- **Moderation surface: effectively zero.** Numeric keypad only; no player free-text reaches any view; authoring fields stripped by the adapter. The only moderation is the **offline profanity scan over authored question/funFact strings** at pack-publish time — not a runtime concern.
- **Localization decay.** FR/EN funFacts must stay natively funny; unit localization (km↔miles, French-inches gotcha in `napoleon-height-cm`) is a per-locale authoring responsibility enforced by the FR/EN-parity pipeline lint.
- **Determinism guardrails (already satisfied):** seed-shuffled pool at init, no wall-clock, no ambient RNG, no runtime AI — pack corrections are the only live lever, via KV.
