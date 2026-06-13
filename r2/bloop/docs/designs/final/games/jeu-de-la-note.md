# jeu-de-la-note — La Note / On a Scale — FINAL DESIGN

| Field | Value |
|---|---|
| **Game id** | `jeu-de-la-note` (catalog id; module id `'jeu-de-la-note'`, pack id `jeu-de-la-note-core` v1) |
| **Names** | FR **La Note** · EN **On a Scale** |
| **Template + mode** | `SPOTLIGHT_GUESS` (package `@bloop/game-spotlight-guess`), mode **`scale`**, domain **`scale10`** (per-item override → `wheel100` allowed) |
| **Players** | **3–16** (module `minPlayers: 3`, `maxPlayers: 16`) |
| **Spicy tier** | **0** — none shipped (all 152 pack items `intensity: "classic"`); ruling below: **no separate 18+ sibling — section 5** |
| **Physical** | **seated** (verbal in-room talk beat; phones are secret-keepers/controllers) |
| **Status** | **SHIPPED** — reducer, views, redaction audit, scoring/phase/presence/actions tests, 152-item pack, mobile view + catalog tile all present on branch `r3` |
| **Sibling config** | `la-roue` (wheel100) — **designed, NOT registered in the shipped catalog** (see §4 / §7) |

---

## 1. Pitch & room fantasy

**Pitch.** One player secretly draws a number; they perform a prompt *calibrated* to that exact number ("describe the meal you'd cook for a date who deserves exactly this score"); everyone else secretly dials in the number they think the performance deserves; closeness scores everyone.

**Room fantasy.** This is *petty-precision judging* turned into a party mechanic. The manufactured argument is **"that was NOT a 7"** — the entire table watching one friend describe a 7/10 first-date meal and silently, violently disagreeing about whether it was a 7. The performer is forced into the uniquely funny tightrope of calibrating absurdity ("how do I make this dish sound like *exactly* a 4?"), and the reveal is built to be a roast: the voice guide (§5.10) explicitly treats decimal gaps as moral failures — *"T'as mis 7. C'était un 4. Vous devez parler."* The fun is the quantified-judgment register (aura points, W/L culture) applied to your friends' improv. No one types, no one reads a card aloud; the comedy is wholly in the room and the phone is just the secret-keeper and the dial.

---

## 2. Shipped ruleset (AUTHORITATIVE — from `JEU_DE_LA_NOTE_CONFIG` + reducer)

### Config constants (`state.ts` → `JEU_DE_LA_NOTE_CONFIG`)
`mode: 'scale'`, `totalRounds: 8`, `domain: 'scale10'`, `targetReadMs: 8_000`, `talkMs: 45_000`, `guessMs: 20_000`, `revealMs: 8_000`, `speakerCanEndTalk: true`, `lockOnSubmit: false`. All reverse-mode knobs are inert: `answerMs/hintIntervalMs/decoyCount/readerPointsPerCorrectGuess/scoreboardMs/scoreboardEvery = 0`, `hintTiers: 1`, `tierPoints: []` → **no scoreboard beat in this game** (only `target/talk/guess/reveal`, terminal `over`).

`init` clamps `totalRounds = min(config.totalRounds, items.length)` = `min(8, 152)` = **8 rounds**. First RNG draw is the spotlight rotation (`turnOrder`), independent of the pack. Items are seed-shuffled; `targets[]` are **pre-drawn for ALL 8 rounds at init** (`scale10` → `1 + floor(rng()*10)` = 1..10; `wheel100` → `floor(rng()*101)` = 0..100) so determinism never depends on event order.

### Phases (real `phaseKey` + `phaseDurationMs`)
The phaseKey is `${phase}:r${round}` (`target:r0` … `reveal:r7`), terminal `over`. One spotlight per round, so the round index alone makes each phase instance unique. **The key never embeds the target.**

| phaseKey | Duration | Beat | Advance |
|---|---|---|---|
| `target:r{n}` | **8 000 ms** | Spotlight (rotating via `turnOrder`/`spotIndex`) privately sees the secret `myTarget`; everyone else sees only prompt + low/high anchors. | `ready` (spotlight only) or deadline → `talk`. Spotlight-left → **void**. |
| `talk:r{n}` | **45 000 ms** | Fully verbal in-room performance calibrated to the secret number. Phones show the scale; only the spotlight's phone keeps the number. | `openVotes` (spotlight only, `speakerCanEndTalk=true`) or deadline → `guess`. Spotlight-left → **void**. |
| `guess:r{n}` | **20 000 ms** | Connected non-spotlights set a dial (integer, clamped to the item's domain) into the HIDDEN buffer. `lockOnSubmit=false` → **overwrites allowed until resolve**. Others see only `hasGuessed` booleans + owner echo `myGuess`. | `allActed(connected non-spotlights)` early-resolves; else deadline → `resolveScale`. Missing guesses simply score 0. |
| `reveal:r{n}` | **8 000 ms** | Atomic promotion: target + every submitted guess plotted; bands applied; `lastGained` public. | deadline → next round's `target` (rotate seat) or, after round 8, `over`. |
| `over` | **null** (untimed, terminal) | `gameOver(cloned scores)`; absolute no-op reducer. | — |

**Round length** ≈ 8 + 45 + 20 + 8 = **81 s** worst case, shorter with `ready`/`openVotes`/`allActed` early-exits.

### Scoring (exact — `resolve.ts` `band()` + `resolveScale()`)
Per guesser: `d = |guess − targets[round]|`, then `band(domain, d)`:
- **scale10**: d=0 → **4**, d=1 → **2**, d=2 → **1**, d≥3 → **0**.
- **wheel100**: d≤5 → **4**, d≤10 → **3**, d≤20 → **2**, d≤33 → **1**, else **0**.

**Spotlight score:** sort SUBMITTED guess distances ascending → `D`; if `D` empty or round voided → **0**; else spotlight gets `band(domain, D[floor((D.length−1)/2)])` — the **lower-median** distance band (rewards calibrating the *whole* room, not one lucky friend). Max **4 pts/round for everyone**.

**Ties / win / draw:** every guesser in the best band scores it — *all closest win, never a single cruel loser* (voice north-star "funny never cruel"). Game has no internal tiebreak/winner declaration; `over` returns cloned `scores`. The **shell** ranks by placement and awards **placement-based session XP** (cross-game §1.7) — internal 0–4/round scale stays the game's own.

### Presence / disconnect
`playerLeft`/`playerRejoined` flip `connected` only (roster + scores untouched; seat greyed):
- **Spotlight leaves during `target`/`talk`** → `voidRound`: jump to a voided `reveal`, zero points, buffer dropped, `round_skipped` analytics. The room never stalls on a ghost.
- **Spotlight leaves during `guess`** → round resolves normally (target fixed, talk already happened).
- **Guesser leaves during `guess`** → re-check `allActed(expectedGuessers)`; if they were the last awaited, resolve immediately. A passive/disconnected guesser never blocks (deadline scores them 0).
- A rejoined guesser in `guess` is expected again.

### Redaction (what is secret from whom)
`targets[]` is the load-bearing secret. `myTarget = isSpot ? state.targets[round] : null` — the number reaches **only the spotlight's view** during `target`/`talk`/`guess`. The `guesses` buffer is hidden cross-player pre-reveal: guessers get `hasGuessed` booleans + owner-only `myGuess`; never anyone else's pick. The target is published to everyone only at `reveal` (and is `null` on a voided round). The target never appears in `phaseKey` or analytics props. Covered by `redaction.test.ts` + the server `redaction-audit.test.ts` (stringified speaker-only field absent from every non-spotlight/spectator view JSON).

---

## 3. Content model

**Pack item (authoring source, bilingual).**
```ts
{ id: string; kind: 'scale10' | 'wheel100';
  prompt: {fr,en};   // the instruction performed out loud, calibrated to the number
  low: {fr,en};      // anchor for 1 / left end of the wheel
  high: {fr,en};     // anchor for 10 / right end
  tags?: string[]; intensity?: 'classic' | 'spicy' }
```
At runtime the engine reads `content.data = { mode:'scale', items: ScaleItem[] }`; only `id/kind/prompt/low/high` are mapped into `ScaleRound`. **Targets are NOT in the pack** — drawn at init from the seeded RNG (pure-math scoring, no precomputed answer).

**How many ship.** `jeu-de-la-note-core` v1 ships **152 items**: **102 `scale10`** + **50 `wheel100`** (verified in both `content/packs/jeu-de-la-note.json` and the generated `apps/server/src/content/spotlight-guess-packs.ts`). Far above the sizing lint floor (`items ≥ totalRounds=8`, recommend ≥ 24). All 152 are `intensity: "classic"`; the authoring JSON tags items (food/social/love/tech/performance/debate/improv/…). The 50 `wheel100` items are the inventory for the `la-roue` rider.

**AI-precomputed offline.** **None.** `needsOfflineAiPipeline: false`. The talk beat is verbal → no moderation surface; no decoys/hints to generate (that is the *reverse-question* sibling). AI is recommended only as an *assisted-drafting at volume* aid behind the human gate (wave2 table: "AI-ASSISTED drafting at volume … behind the same human gate"), never at runtime.

**Voice / tone (guide §5.10 — "petty-precision judging").** Celebrate the absurdity of grading everything; prompts invite *calibrated pettiness*; reveal copy treats decimal gaps as moral failures (*"T'as mis 7. C'était un 4. Vous devez parler."*). Quantified-judgment culture (aura, W/L) is the native register. Anchors must be genuinely **graduated** (a vivid 1 and a vivid 10) or guesses cluster mid-scale and bands flatten — the difficulty knob.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / host-tunable item from §2.10, its recommendations[] and risks[], decided. No TBD.

| # | Was (deferred / open) | FINAL decision | Why |
|---|---|---|---|
| D1 | *Two brief variants (secret-number Q&A / labeled 1–10 scale) — which ships?* | **Ship v1: scale10 as `jeu-de-la-note`.** wheel100 = config rider (D2). | One mode + per-item `kind` discriminant; scale10 with labeled anchors is most legible on first play. Shipped. |
| D2 | *`la-roue` wheel100 rider config* | **Roadmap v1.1 (config-only, ~0 code).** Register a catalog entry `la-roue` `{ domain implied by wheel100 items, talkMs: 60_000 }` pointing at a wheel100-only pack; no deploy. **Currently NOT in the shipped catalog.** | The reducer, `wheel100` bands, snap-tick dial and 50 wheel100 items already ship; only the catalog tile + a kind-filtered pack are missing. Pure Cadence-B. |
| D3 | *One pack = one kind (authoring lint)* | **Ship v1 RELAXED: a single mixed-kind `jeu-de-la-note-core` is shipped (102 scale10 + 50 wheel100); `currentDomain` rules per round.** For the `la-roue` rider, ship a **wheel100-only** pack so its tile reads as a pure wheel game. | The reducer already keys the domain off each item's `kind` (`currentDomain`), so a mixed pack is correct and harmless for the scale tile. Keep the one-kind rule as the *catalog-↔-pack-presentation* convention, not an engine invariant. |
| D4 | *Bilingual authoring → single-locale runtime split (la-note-fr / la-note-en)* | **Roadmap v1.1 with the locale picker.** Ship v1 keeps the bilingual `{fr,en}` runtime pack; the client renders the chosen locale at view time (`LText`). | All views are bilingual `LText`; the client already picks a locale. The single-locale split is a loader optimization, not a correctness gate, and can ride the same release as `la-roue`. |
| D5 | *"Les autres posent des questions" without typed text / stalls* | **Ship v1: single timer-boxed verbal `talk` (45 s) + `openVotes` early-end; deadline always advances.** | Phones stay controllers/secret-keepers → zero moderation surface, zero stall vector; disconnected spotlight voids instead of freezing. Shipped exactly. |
| D6 | *"Le plus proche gagne" exact scoring* | **Ship v1: bands above; spotlight = lower-median band; ties share the top band.** | Pure deterministic integer math, no judge/AI, capped 4/round so scales stay comparable for placement XP. Shipped. |
| D7 | *Does the speaker guess / type?* | **Ship v1: never.** Spotlight excluded from `expectedGuessers` + `allActed`; phone only holds the secret; scores via the median band. | Self-guessing is degenerate; typing kills the in-room performance and opens moderation. Shipped (`playerId !== spot` guards). |
| D8 | *Wheel continuous or discrete?* | **Ship v1 (for `la-roue`): integer 0..100, dial render, snap ticks every 5 + haptics.** | JSON-safe, replay-deterministic, readable on phone; the ±5 bullseye band must be physically reachable. The integer domain is shipped in `inDomain`/scoring. |
| D9 | *Reuse HOT_SEAT / INPUT_GUESS instead of new template?* | **Cut — kept as NEW `SPOTLIGHT_GUESS`.** | Numeric dial + per-round single-holder secret + closeness bands needed a different reducer; both brief variants and all future packs are now config-only. Shipped. |
| D10 | *Round count (`totalRounds: 8`)* | **Ship v1: 8, host-tunable 4–12 (§6).** | ~81 s/round → ~11 min full game; keeps TikTok pacing while letting hosts trim. |
| D11 | *Talk-phase drag in shy rooms* | **Ship v1: 45 s cap + `openVotes`; monitor round-abandon at rolloutPct 5 before 100.** Host can shorten `talkMs` (§6). | Mitigation is structural; analytics gate confirms feel before full rollout. |
| D12 | *3-player rooms → coarse lower-median spotlight score* | **Ship v1: accept as-is.** No special-casing. | With 2 guessers the lower-median equals the better guess — acceptable; verify in playtest before lowering timers. Not worth reducer complexity. |
| D13 | *Spicy / 18+ tier* | **Cut — no 18+ sibling (see §5).** | The talk beat is verbal and player-authored; a separate adult pack adds no mechanic and little content lift over what hosts already say out loud. |
| D14 | *Future "sprint" 2-tier configs / themed scales* | **Roadmap v2 (config + pack only): "Vitesse" sprint config + themed packs (see §7).** | Pure Cadence-B levers (timers down, themed pack ids); no reducer change. |

---

## 5. The 18+ spicy sibling config

**Decision: NO spicy tier.** Reasoned, not a default.

- **The game has no text surface to make spicy.** Unlike `truth-or-dare-2` or `pires-potes`, La Note ships zero gameplay text the app speaks — the *prompts* are the only authored copy, and the comedy is whatever a consenting player improvises out loud. An adult pack would only swap prompt nouns; the room is already free to push the performance as far as the table wants (the shipped pack already leans adult-adjacent: ex-stalking, breakup texts, 3 a.m. search history). A separate `minAge: 18` SKU buys almost no incremental content for real moderation/age-gating cost.
- **`spicyLevel: 0` is the shipped truth** and every one of the 152 items is `intensity: "classic"`.
- **If ever revisited (roadmap-only, not shipped):** the *cheapest viable* spicy variant is **content-only, zero mechanic change** — a sibling catalog config `jeu-de-la-note-18` `{ tone:'spicy', minAge:18 }` pointing at a separate pack id `jeu-de-la-note-spicy` whose items carry `intensity:'spicy'` and raunchier prompts/anchors (sexual-history calibration, body-count scales). No `publicPicks`/anonymity change (guesses are already hidden-then-public; identity is anonymous-forever), no scoring/phase change, no `lockOnSubmit` change. It would ship behind the same human content gate as the other 18+ decks. **Status: not warranted for v1 — left as an optional content SKU only if analytics show demand.**

---

## 6. Host-tunable params (lobby allowlist for THIS game)

Bounds come from the protocol `templateParamsSchema` (the template-wide hard caps); the lobby exposes a **safe subset**:

| Param | Default | Safe range (lobby) | Schema hard cap |
|---|---|---|---|
| `totalRounds` | 8 | **4–12** | int 1–16 |
| `talkMs` | 45 000 | **30 000–75 000** | int 20 000–120 000 |
| `guessMs` | 20 000 | **15 000–30 000** | int 10 000–45 000 |
| `targetReadMs` | 8 000 | **5 000–10 000** | int 3 000–15 000 |
| `revealMs` | 8 000 | **6 000–10 000** | int 4 000–15 000 |
| `speakerCanEndTalk` | `true` | **toggle** (default on) | bool |
| domain (`scale10`/`wheel100`) | scale10 | **not host-tunable** — fixed by the chosen catalog tile (`jeu-de-la-note` vs `la-roue`) so domain always matches the pack | enum |

**Not exposed:** spicy toggle (no spicy pack — §5), `lockOnSubmit` (must stay `false` for the overwrite-until-resolve UX), reverse-only knobs (inert). All ranges keep a round in the ~50–110 s band so placement XP and pacing stay stable.

---

## 7. Future modes roadmap

| Mode | Decision | One-line spec |
|---|---|---|
| **`la-roue` (wheel100 rider)** | **Ship v1.1 — config + pack only** | Catalog entry `la-roue` `{ talkMs: 60_000 }` over a wheel100-only pack carved from the 50 existing wheel items; dial render with ±5 snap ticks + haptics. No deploy. |
| **"Vitesse" sprint config** | **Roadmap v2 — config only** | `{ totalRounds: 6, talkMs: 30_000, guessMs: 15_000, targetReadMs: 5_000 }` for a ~45 s/round fast table; pure Cadence-B knob, no reducer change. |
| **Themed packs** | **Roadmap v2 — pack only** | New pack ids (e.g. `la-note-cuisine`, `la-note-cinema`) reusing tagged subsets; ships with no code. |
| **Single-locale pack split (la-note-fr / la-note-en)** | **Roadmap v1.1 — build pipeline** | Build step splits the bilingual source into single-locale runtime packs per the loader convention; client behaviour unchanged. |
| **18+ spicy SKU** | **Cut for v1 (roadmap-only)** | Optional content-only sibling `{tone:'spicy', minAge:18}` + `jeu-de-la-note-spicy` pack; only if demand shows (see §5). |
| **Live AI hint/host commentary** | **Cut** | Violates the no-live-AI-at-runtime invariant; any AI is offline drafting only. |
| **Remote play** | **Inherited, no work** | Verbal talk beat works over the room's existing realtime layer; zero realtime-layer change needed (platform invariant). |

---

## 8. Risks & content-ops notes

- **Redaction is the #1 surface.** `targets[round]` must appear only in the spotlight view pre-reveal; the stringified-target audit (`redaction.test.ts` + server `redaction-audit.test.ts`) must stay green on every pack/config change. Never let the number into `phaseKey`/analytics.
- **Spotlight-disconnect voiding** (`target`/`talk` → `voidRound` + `round_skipped`) is load-bearing against stalls; keep the `presence.test.ts` branches.
- **Pack-sizing lint:** enforce `items ≥ totalRounds` (recommend ≥ 24). Shipped 152 ≫ 8. For the `la-roue` rider, lint the wheel100-only carve-out separately so it isn't starved below 8 wheel items.
- **Anchor-quality decay (freshness):** the difficulty knob is *graduated anchors*. Flat or non-graduated anchors collapse guesses to mid-scale and flatten bands — the AI-gate playtest rubric must score anchor spread, not just safety. Rotate/refresh prompts as the pack ages; the per-locale gate must hold independently if/when the single-locale split lands.
- **Moderation surface: minimal.** Zero typed gameplay text and `needsOfflineAiPipeline: false` → the only moderation surface is the authored prompts/anchors themselves (one human gate), not user input. This is the lowest-risk content profile in the wave.
- **Ad cue:** the interstitial fires **client-side** off the `phaseKey` transition into `over` (server-shell design), never a reducer effect; analytics `round_completed`/`round_revealed`/`round_skipped` are PostHog-only.
- **Catalog gap to close:** `la-roue` is designed but not registered; shipping it is the cheapest next content lever (D2/§7).
