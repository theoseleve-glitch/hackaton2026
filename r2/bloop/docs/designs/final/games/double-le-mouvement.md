# double-le-mouvement — DOUBLE LE MOUVEMENT / DUB THE MOVE — FINAL DESIGN

| Field | Value |
|---|---|
| **Game id** | `double-le-mouvement` |
| **Names** | FR **DOUBLE LE MOUVEMENT** · EN **DUB THE MOVE** |
| **Template + mode** | `PERFORM_JUDGE` (module id `perform-judge`, version 1) — mode `rate`, `adjudication: 'stars'`, `crewSize: 2` |
| **Config export** | `DOUBLE_LE_MOUVEMENT_CONFIG` in `packages/games/perform-judge/src/state.ts` |
| **Players** | min **4**, max **16** (module `minPlayers = config.minPlayers = 4`, `maxPlayers = 16`) |
| **Spicy tier** | **0** (safe-only; `allowedIntensities: ['safe']`) |
| **Physical** | **standup** (live IRL performance + live vocal dub) |
| **Status** | **SHIPPED** — reducer + zod schema + per-viewer redaction implemented and tested on branch `r3` |

> Reconciliation note (authoritative): the wave-2 design doc and the by-game JSON describe the loop with phase names `brief / perform / rate / reveal`. The SHIPPED module reuses the shared PERFORM_JUDGE phase machine, so the real `phaseKey` prefixes are **`ready` / `perform` / `judge` / `reveal`** (this config sets `scoreboardEvery: 0`, so there is no `scoreboard` beat). `ready` == "brief", `judge` == "rate". Numbers below are quoted from `DOUBLE_LE_MOUVEMENT_CONFIG`, not from the older proposal.

---

## 1. Pitch & room fantasy

**One-line pitch:** One friend silently performs a secret absurd movement; their partner improvises the live sound dub *blind* — never having seen the prompt — and the room rates the duo 1–5 stars before the prompt flips public for the second laugh.

**Room fantasy.** This is a two-person improv machine that manufactures its laugh from a *guaranteed mismatch*. The mover (X) knows the secret ("a cat discovering a cucumber"); the dubber (Y) is committing full voice to something they cannot see and are desperately reverse-engineering in real time. The comedy engine is structural, not written: Y's sound *cannot* match X's movement because Y is flying blind, and the harder Y commits, the funnier the divergence. Then the **reveal** is a second, separate punchline — the prompt text flips public and the room realizes "THAT was supposed to be a cat?!" The scoring is cooperative by construction (both crew score *identically*), so the table isn't pitting X against Y — it's two friends going down together, and the audience is the jury of a tiny, doomed talent show. The app plays a deadpan producer with zero faith in the act, which makes any success feel stolen and any failure feel pre-ordained.

---

## 2. Shipped ruleset (AUTHORITATIVE)

All constants from `DOUBLE_LE_MOUVEMENT_CONFIG`. The reducer is `packages/games/perform-judge/src/perform-judge.ts`; redaction is `views.ts`.

### Phases (real `phaseKey` = `${phase}:${turnSeq}`)

| Phase (`phaseKey`) | Duration (ms) | What happens |
|---|---|---|
| `ready:{turnSeq}` ("brief") | **15 000** (`readyMs`) | The mover sees **2** prompts (`promptChoices: 2`) on their phone only (`offers` in the view) and taps one (`{kind:'pick', index}`); `pick` sets `chosenIndex` and immediately enters `perform`. The dubber sees a "YOU ARE THE VOICE" role card (`secret: null`). Audience sees "X is choosing". There is **no** early-ready button for the mover beyond `pick` (`canReady` is false in `rate` mode — that flag is guided-only). Deadline → deterministic auto-pick `chosenIndex = 0` (`offer[0]`), enter `perform`. |
| `perform:{turnSeq}` | **30 000** (`performMs`) | Phones down. X performs IRL; Y dubs blind. The mover's view echoes its own `secret` (`chosenPrompt`); dubber + audience see no prompt. Both crew members can tap **Done** (`{kind:'done'}`, crew-only, first tap locks). When **all connected crew** have tapped Done (`allActed`) → enter `judge`. Deadline → enter `judge`. |
| `judge:{turnSeq}` ("rate") | **15 000** (`judgeMs`) | Every connected non-crew player casts 1–5 stars (`{kind:'rate', stars}`, **first write locks**, duplicates ignored). View shows `votesIn / votersExpected` **counts only** + the rater's own `myStars` echo; never another player's value, never the prompt. Crew sees a suspense card (`myStars: null`). When `allActed(eligibleJudges, stars)` → resolve. Deadline → resolve with cast ballots. **Entry guard:** if `eligibleJudges` is empty at entry (`enterJudge` calls `allActed` on an empty set, which is vacuously true) → resolve immediately with the default. |
| `reveal:{turnSeq}` | **7 000** (`revealMs`) | `lastResult` is public and identical for every viewer: prompt text (`item`), star `avg` (1 decimal) + `cast` count + `ovation` flag, and the per-player `points` burst. On lap-wrap the rotation step emits the `round_completed` analytics effect — **the shell's client-side interstitial ad boundary** (fires off the `phaseKey` transition into the next turn / `over`, never as a reducer effect). Deadline → next turn or `over`. |
| `over` | `null` (untimed) | `phaseKey === 'over'` (terminal). View is identical final `scores` for all. Emits `gameOver(clonedScores)`. |

`scoreboardMs: 0` / `scoreboardEvery: 0` → **no scoreboard beat** for this game (unlike `mime-inverse`).

### Scoring (exact — `resolveStars` in `perform-judge.ts`)

- `cast` = the array of star ballots actually submitted.
- `rawAvg = cast.length > 0 ? mean(cast) : noVoteDefaultStars` → default **3** (`noVoteDefaultStars: 3`).
- `ovation = cast.length >= 2 && cast.every(v => v === 5)` (unanimous 5★ with **≥ 2** ballots).
- `points = round(rawAvg × starMultiplier) + (ovation ? ovationBonus : 0)` → `round(avg × 20)` **+ 25** on ovation.
  - **`starMultiplier: 20`** → base range **20 (avg 1.0) … 100 (avg 5.0)**.
  - **`ovationBonus: 25`** → a 5★ sweep pays **125** each.
- Points are awarded **identically** to `performer` (mover) AND `partner` (dubber) when `partner !== null`. If the dubber left mid-perform and there is no partner, only the mover scores.
- `lastResult.stars = { avg: round(rawAvg×10)/10, cast: cast.length, ovation }`. Outcome stamp is always **`success`** (stars never "fail"); a voided turn never reaches `resolveStars`.
- **Rating earns the rater nothing.** `successPoints / helperPoints / passPoints / fastBonusPoints` are all **0** for this config — none of the verdict/credit/puppet economies apply.

### Win / draw / tie

- The game ends after **`laps: 1`** — `advanceTurn` flips to `over` when `lap >= config.laps`, or early on pool exhaustion (`cursor + promptChoices > deck.length` → `pool_exhausted` + `gameOver`). One lap = everyone is mover exactly once; each player is dubber for the *following* connected seat roughly once.
- Winner = highest cumulative `scores` at `over`. **Cross-game session XP is PLACEMENT-based** (shell-level, cross-game-synthesis §1.7) — the raw 20–125-per-turn scale stays internal to this game; the shell awards XP off final placement.
- **Ties:** the module does not break ties — `over` exposes raw `scores` and the shell/leaderboard ranks them. Co-leaders share the placement (placement-based XP handles ties cleanly). No tiebreaker mechanic ships; none is warranted for a 1-lap co-op rating game.

### Presence / disconnect (`onLeft` in `perform-judge.ts`)

| Who leaves | When | Behaviour |
|---|---|---|
| **Mover** | `ready` or `perform` | Turn **voided** — `advanceTurn` rotates immediately, nobody scores, emits `crew_left` analytics. Abrupt by design (mirrors truth-or-dare's active-left rule). |
| **Mover** | `judge` / `reveal` | Not special-cased here — the in-flight ratings stand; if the leave completes the eligible set, `resolveJudge` fires. |
| **Dubber (partner)** | `ready` | Reassigned: `partner = pickPartner(rotation, seatIndex, connected)` (next connected non-mover seat, or `null`). |
| **Dubber (partner)** | `perform` | Performance **finishes solo**, still scored. If the remaining connected crew have all tapped Done, `enterJudge` fires. With `partner === null` at resolve, only the mover scores. |
| **Rater** | `judge` | Shrinks `eligibleJudges`; the leave re-checks `allActed` so the room never stalls on an absent rater. |
| **Anyone** | — | `playerRejoined` flips `connected` back to true, no other state change. Roster is fixed at `init`; rejoin re-enters the eligible/rotation sets going forward. |

### Redaction (what is secret from whom — `views.ts`)

`promptVisibility: 'performer'` → the secret is the **mover's own echo**; everyone else (including unknown/spectator ids, treated as a possible mover second-device) is **blind until reveal**.

- **`ready`:** `offers` (the 2-prompt list with text + hint) is returned **only to the mover** (`isPerformer`). Dubber/audience/unknown get `offers: null`, `secret: null`.
- **`perform`:** `secret` (prompt + hint) returned **only to the mover** (`entitled` = `isPerformer` here). Dubber + audience get `secret: null`. `crewDone` exposes only the two crew booleans.
- **`judge`:** No viewer sees the prompt. Raters get a star picker + `votesIn / votersExpected` counts + their own `myStars`. **No viewer ever sees another player's star value.** `categoryHint: null` (rate mode does not surface category to anyone).
- **`reveal`:** Identical public `lastResult` for all — prompt text now public, `stars` **aggregate only** (`avg / cast / ovation`). **Individual star ballots are NEVER published**, even at reveal.
- **Hidden forever:** `deck`, `cursor` (leak every upcoming prompt). **Hidden until reveal:** `offer`, `chosenIndex`. **Hidden always as individuals:** the `stars` map (aggregate only).

Actions are **enum-only** (`actions.ts` zod `discriminatedUnion`): `pick` / `done` / `rate` are the only ones this mode honors → **zero free-text → zero in-game moderation surface**.

---

## 3. Content model

### Pack item shape

Authored bilingual; one movement prompt per item. From the pack (`content/packs/double-le-mouvement.json`) and `PerformJudgeItem`:

```jsonc
{
  "id": "dlm-001-robot-hiphop",      // stable unique id — no-repeat key + report/kill-switch handle
  "text": { "fr": "...", "en": "..." }, // THE SECRET movement — mover-only until reveal (≤ 120 chars; longest shipped = 97)
  "hint": { "fr": "...", "en": "..." }, // mover-only performance tip (secret like the prompt)
  "category": "animals|dance|sports|everyday|cinema|cringe",
  "difficulty": 1 | 2 | 3,            // curation metadata — IGNORED by the reducer
  "intensity": "safe" | "spicy",      // spicy ships in a separate age-gated pack; excluded by allowedIntensities:['safe']
  "props": false,                     // needs physical objects (filterable) — every shipped item is false
  "tags": ["funny","physical","tiktok"] // freeform, ≤ 8
}
```

Runtime mapping into `PerformJudgeItem`: `text → prompt`, `hint → hint`. `category/difficulty/props/tags` are curation/filter metadata not consumed by the rate-mode reducer (rate sets `categoryHint: null`). The publish pipeline splits the bilingual authored pack into single-locale packs (`double-le-mouvement-fr` / `-en`); the shell resolves locale at `startGame`.

### Counts shipped

- **125 items**, all `intensity: "safe"`, all `props: false`, version 1, generatedAt 2026-06-11.
- **By category:** everyday 25, animals 22, dance 20, sports 20, cinema 20, cringe 18.
- **By difficulty:** d1 = 59, d2 = 60, d3 = 6.
- **Pool-sizing lint (synthesis §3.5):** required minimum = `laps × maxPlayers × promptChoices = 1 × 16 × 2 = 32` per intensity tier. **125 ≫ 32** — passes with a ~3.9× headroom margin, so a full 16-player lap (16 turns × 2 prompts = 32 draws) never hits `pool_exhausted`.

### AI-precomputed offline?

**None at runtime.** `needsOfflineAiPipeline: false`. There is no live AI (platform invariant). Items were AI-*assisted* at authoring volume behind a human gate (design doc §… roster table marks this game "no pre-computed values — AI-assisted drafting recommended"), but every shipped string is human-approved static content. The reducer reads only static pack text via seeded RNG (`createRng(seed+'|deck')`).

### Voice / tone note (voice guide §5.12)

> **"talent-show host with zero faith."** The app is a deadpan producer introducing acts it expects to fail (« Eyes up. Bro is about to attempt choreography. »). Star-rating copy is brutal-precise (1 star = « C'était une expérience. »). The blind-dub reveal caption is the second punchline — write it as betrayal comedy (« THAT was supposed to be a cat?! »).

The shipped pack already executes the broader voice law (§1: specificity, escalation, hyperbolic cartoon stakes) — e.g. hints like "wake the baby and you lose custody of this performance", "the room bet on the crash — give them the full system failure". UI copy stays lowercase/deadpan and never claims to be funny (§1.8).

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / host-tunable item from §2.12 and the by-game `recommendations[]`, resolved to a FINAL ruling. No TBD.

| # | Was (deferred / open / proposed) | FINAL decision | Why |
|---|---|---|---|
| D1 | *How does the app prompt X with the secret move?* | **Ship v1.** `ready` (15 000 ms) shows the mover 2 pack prompts; tap one (`pick`); deterministic auto-pick `offer[0]` on timeout. | Curated 2-option pick keeps agency without a blank-page stall; timeout guarantees a passive mover never blocks the room. Already implemented. |
| D2 | *Does the dubber Y see the prompt?* | **Ship v1 — never.** Y dubs blind; the prompt reaches Y at reveal like everyone else. | The mismatch IS the comedy engine; an informed dubber collapses into narration. It also halves the redaction surface (only mover views carry undisclosed text). |
| D3 | *How does the room score the duo?* | **Ship v1.** Hidden 1–5 star buffer, first tap locks; both crew earn `round(avg×20)` (20–100); unanimous 5★ with ≥ 2 ballots → +25 each; 0 ballots → 3.0 default; rating earns nothing. | Identical duo score makes it cooperative; the 20-pt floor + 3★ default blunt trolling/AFK; unscored ratings stay honest. Exactly matches `resolveStars`. |
| D4 | *When is the prompt revealed?* | **Ship v1 — only after stars lock, in `reveal`.** | The room rates the *comedy*, not fidelity to a prompt it could second-guess; the reveal becomes a guaranteed second laugh beat. |
| D5 | *Player count & length.* | **Ship v1 — config 4–16, sweet spot 4–10, laps = 1.** Lobby gates Start on effective `minPlayers = 4`. Catalog copy steers very large rooms toward shorter games. | At 3 the audience is a single rater (swingy/gameable) → floor at 4. At 16 one lap ≈ 18 min — acceptable but long. `laps` is host-tunable (HT2) for rooms that want more. |
| D6 | *Should the audience also GUESS the prompt (extra mechanic)?* | **Roadmap v2** (see §7, M1). Cut from v1. | A typed guess adds free-text moderation surface + ~20 s/turn and breaks TikTok pacing. v1 stays enum-only (zero UGC). The action union can grow game-locally without contract changes. |
| D7 | *Spicy content?* | **Roadmap (content-ops only).** Launch safe-only (`spicyLevel 0`); a later `double-le-mouvement-spicy` pack ships as a separate age-gated pack id selected via `allowedIntensities`. See §5. | Physical performance prompts escalate fast; the platform tone gate (`minAge ≥ 18`) handles it as pure content ops, **no code change** (the `intensity` axis already exists). |
| D8 | *`crewSize` 1 vs 2 (template generic).* | **Ship v1 — crewSize 2** for this tile. A `crewSize: 1` "solo mime rating" config is a separate future catalog tile, not this game. | The blind-dubber mismatch is the whole point of *this* game; solo rating is a distinct experience (roadmap v3, M3). |
| D9 | *Early-end the perform beat?* | **Ship v1.** Both crew tap **Done**; `allActed(connectedCrew)` → `judge`. | Lets a duo bail out of a dead bit early; timer still guarantees flow. Implemented. |
| D10 | *Disconnect handling (mover / dubber).* | **Ship v1 as built.** Mover-left (`ready`/`perform`) voids the turn; dubber-left in `perform` = solo finish still scored; dubber-left in `ready` = reassign; rater-left shrinks the expected set. | Mirrors the platform's active-left convention; never stalls the room. |
| D11 | *Scoreboard beat between turns?* | **Cut for this config** (`scoreboardEvery: 0`). The per-turn `reveal` already shows the running `scores`. | A 1-lap co-op game doesn't need a separate standings interstitial; the reveal carries scores and the ad boundary. |
| HT-set | *Host-tunable params?* | **Ship v1 allowlist — see §6.** | Template schema already bounds every param; this game exposes a safe subset to the lobby. |

---

## 5. The 18+ spicy sibling config (concrete)

**Decision: ship a spicy sibling as content-ops only — a separate age-gated pack, zero code change.**

The `intensity` axis (`'safe' | 'spicy'`) and the `allowedIntensities` config field already exist and are wired through publish + the platform tone gate. A spicy tier is *warranted* here: physical-performance prompts have an obvious adult register (suggestive moves, drunk-archetype bits, "morning after" physical comedy) that lands hard with the 18+ cohort but cannot sit in the default family-safe pack.

Concrete sibling config (diff vs. shipped):

```jsonc
// Module config — IDENTICAL mechanics; only the content gate changes:
DOUBLE_LE_MOUVEMENT_CONFIG, but:
  allowedIntensities: ['spicy']        // (or ['safe','spicy'] for a "mixed" host toggle)

// Pack metadata (NEW separate pack, NOT mixed into the safe pack):
  packId:   "double-le-mouvement-spicy-fr" / "-spicy-en"
  tone:     "spicy"
  minAge:   18                          // platform tone gate forces minAge >= 18 for any spicy tone
  items[*].intensity: "spicy"           // excluded from the default pack by allowedIntensities:['safe']
```

What changes / what does NOT:
- **Mechanics unchanged.** No new phase, action, scoring constant, or redaction rule. Same `rate`/`stars`/crew-2 reducer.
- **Anonymity unchanged.** Ratings are already hidden-individual / aggregate-only; star ballots are never published. There is no "publicPicks" surface to harden — the only public outputs (`avg/cast/ovation`, prompt at reveal) are unchanged. Identity stays fully anonymous (platform invariant).
- **Age gate.** `minAge: 18` is enforced by the platform tone gate (template-architecture §2.7), surfaced as a lobby consent flag. The host opts in; the safe pack remains the default.
- **Pack sizing.** The spicy pack must independently clear the same lint: **≥ 32 spicy items per locale tier** before it can ship.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

The template schema bounds every param; the lobby exposes this safe subset. Defaults = shipped config.

| Param | Default | Safe range (lobby) | Notes |
|---|---|---|---|
| `laps` | **1** | 1 – 3 | 2–3 for longer sessions; 16-player rooms should stay at 1 (≈ 18 min/lap). |
| `allowedIntensities` (spicy toggle) | `['safe']` | `['safe']` · `['safe','spicy']` · `['spicy']` | `spicy` forces room `minAge ≥ 18` (consent flag). Off by default. |
| `performMs` | **30 000** | 20 000 – 45 000 | Shorter = tighter TikTok pacing; longer = slow-mo / elaborate bits. Template hard bound 10 000–60 000. |
| `rateMs` (`judgeMs`) | **15 000** | 10 000 – 20 000 | Star window length. Template bound 5 000–30 000. |
| `briefMs` (`readyMs`) | **15 000** | 10 000 – 20 000 | Pick window. Template bound 5 000–30 000. |
| `ovationBonus` | **25** | 0 – 50 | 0 disables the 5★ sweep bonus for a flatter scoreboard. Template bound 0–100. |

**Not host-tunable** (locked to preserve the design): `crewSize` (2 — defines the game), `promptVisibility` (`performer`), `adjudication` (`stars`), `starMultiplier` (20 — the internal score scale), `noVoteDefaultStars` (3 — anti-AFK floor), `promptChoices` (2). Exposing these would either break the blind-dub fantasy or destabilize the score scale that placement-based XP assumes.

---

## 7. Future modes roadmap

| Mode | Status | One-line spec |
|---|---|---|
| **M1 — Guess-the-move** | **Roadmap v2** | Optional pre-reveal phase: raters submit an *enum* guess of the prompt category (or a "closest" pick), closest wins bonus points. Enum-only to avoid free-text moderation. (Was D6.) |
| **M2 — Spicy moves pack** | **Roadmap (content-ops, ship-when-authored)** | `double-le-mouvement-spicy` age-gated pack, `minAge 18`, via `allowedIntensities` — no code change (see §5). |
| **M3 — Solo mime rating** | **Roadmap v3 (config-only)** | New catalog tile reusing PERFORM_JUDGE at `crewSize: 1` — one performer, no dubber, room rates 1–5★. Distinct experience; does not replace this game. |
| **M4 — Air-band duo** | **Roadmap v3 (config-only)** | Same crew-2 `rate` reducer + a **music/lyrics pack** — the duo air-bands a track; room rates. Pure content + pack swap. |
| **M5 — Slow-mo replay** | **Roadmap v3 (config-only)** | `everyday`-pack variant with `performMs` bumped (e.g. 45 000) for frame-by-frame physical comedy. Achievable today purely via the host `performMs` tunable; promote to a named preset if popular. |
| **M6 — Themed-pack rotations** | **Roadmap (content-ops)** | Seasonal packs (holiday, sports event, meme-of-the-month) on the same reducer to drive freshness; ship as additional safe packs. |
| **Multi-lap as a separate "mode"** | **Cut** | Already covered by the host `laps` tunable (HT/§6); no separate mode needed. |
| **Cross-room / remote play** | **Inherited (no work)** | Platform remote-later invariant applies with zero realtime-layer change; the standup IRL nature means same-room is the primary target regardless. |

---

## 8. Risks & content-ops notes

- **Redaction is load-bearing.** The 2 offered + 1 chosen prompt texts must never reach dubber/audience/spectator views before `reveal`, and individual star ballots must NEVER be published (aggregate only). Enforced in `views.ts` (`entitled = isPerformer`; `stars` surfaced as counts + owner echo). Keep the `leakedSecrets` audit + field-level "rate-phase serialized view contains no stars map" tests green on any view change.
- **The perform beat is unverifiable by the app** (phones cannot see the room). An AFK duo just burns 30 s. Mitigated by short `performMs`, the Done taps, and strong host-onboarding copy; fun ultimately depends on room energy.
- **Star griefing / inflation.** Coordinated 1★ trolling or reflex 5★ is blunted by the 20-pt floor, the shared duo score, unscored ratings, and the unanimity-gated (`≥ 2` ballots) ovation. **Content-ops: monitor `turn_resolved` / `rating_resolved` analytics for avg-star and ovation-rate per pack** to catch a degenerate pack or a griefing room.
- **Loud by design.** Live vocal dubbing fails in quiet/public venues. Catalog description must set the **standup + noisy** expectation (`physical: standup`).
- **Disconnect edges feel abrupt.** Mover-loss voids the turn (0 points) — acceptable and consistent with the platform's active-left rule, but the client should message it ("la manche est annulée, on tourne").
- **Pack sizing lint.** Each intensity tier needs **≥ 32** prompts (`laps × maxPlayers × promptChoices`). The safe pack ships **125** (passes). The future spicy pack must independently clear 32/locale before publish. Exhaustion ends the game gracefully via `pool_exhausted` + `gameOver`.
- **Freshness / decay.** No-repeat is keyed on item `id`; the seeded deck shuffle (`createRng(seed+'|deck')`) means a single session never repeats within its draw window, but heavy players will see the 125 pool recur across sessions. **Content-ops: rotate/expand the pack (M6) and watch for a "seen-it" decay signal** (declining ovation-rate or session length per cohort). `difficulty` (skewed d1/d2, only 6 d3) is curation metadata for future weighted-draw tuning if engagement data warrants it.
- **Moderation surface = effectively zero in-game.** Actions are enum-only (no free text), so there is no live obscenity-filter need; the only moderation is the **offline authoring gate** on pack text. Each item `id` is the report / kill-switch handle for pulling a bad prompt via a content update (no client deploy).
