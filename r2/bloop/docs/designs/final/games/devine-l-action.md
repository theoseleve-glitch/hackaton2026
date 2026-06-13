# Devine l'Action / Guess the Action — FINAL DESIGN

| Field | Value |
|---|---|
| **Game id** | `devine-l-action` |
| **Name FR / EN** | Devine l'Action / Guess the Action |
| **Template + mode** | `PERFORM_JUDGE` `guided` (one reducer, four configs; this is the `guided` config — moved off the original TRUTH_DARE@2 proposal per wave-2 design §5.4) |
| **Players (from module)** | **min 3, max 16** (`DEVINE_L_ACTION_CONFIG.minPlayers = 3`; `createPerformJudge.maxPlayers = 16`) |
| **Spicy tier** | **0** (ships `soft` + `party` only; `allowedIntensities: ['soft','party']`). 18+ tier is a separate sibling config — see §5. |
| **Physical** | **standup** (the performer physically attempts the action IRL; same-room play) |
| **Status** | **SHIPPED** — implemented in `packages/games/perform-judge/`, content pack authored, tested (leakedSecrets + field-level redaction audits) |

> Authority note: where the old by-game JSON (`docs/designs/wave2-raw/by-game/devine-l-action.json`) still says `template: "TRUTH_DARE"` and phase keys `choose/prompt/verdict/score`, it is **stale**. The shipped module (`PERFORM_JUDGE guided`, phases `ready/perform/judge/reveal`) is the single source of truth, ratified by wave-2 design §5.4.

---

## 1. Pitch + room fantasy

**One-liner.** The whole room knows your secret action — except you. They have to drag you into doing it using only one crippled communication channel (mime only / sound effects only / 3 words each / forbidden words / freeze-frames), and then vote on whether you actually pulled it off.

**The room fantasy.** This is the *consensual sacrificial lamb* game (voice guide §5.9: "the room gangs up on one body"). One player stands up, defenseless and information-starved; everyone else becomes a co-conspiring puppet-master trying to make them mime walking an invisible dog that just spotted a squirrel and chose violence — but the helper holding the answer can only honk like a fire truck, or has spent two of their three lifetime words and is now physically suffering. The manufactured laugh is the gap between what the room knows and what the body on display is flailing toward, plus the channel-handicap comedy (a helper biting their tongue not to say the forbidden word). The manufactured argument is the **verdict vote**: "did they actually do it, guided *only* through the channel — or did Marc just say the word out loud and cheat?" The reveal — finally showing the performer the action text they were blindly performing — is the payoff drop.

---

## 2. Shipped ruleset (AUTHORITATIVE)

All numbers quoted from `DEVINE_L_ACTION_CONFIG` in `packages/games/perform-judge/src/state.ts` (lines 104–130) and the reducer in `perform-judge.ts`.

### Phases (real `phaseKey` + durations)

`phaseKey(state)` = `` `${phase}:${turnSeq}` `` (and the literal `'over'` at game end). `turnSeq` increments once per turn entry, so every phase key is per-turn-unique — the client diffs it for transitions and the ad slot.

| Phase | `phaseKey` | Duration (ms) | Beat |
|---|---|---|---|
| `ready` | `ready:{turnSeq}` | **6 000** (`readyMs`) | Performer (next connected seat in the seeded rotation) stands. **Helpers** see the SECRET action card + constraint card (+ forbidden words if taboo). The **performer** sees ONLY the constraint card. Performer may tap "Prêt / Ready" to end early (`canReady`, `action.kind:'ready'`); deadline auto-advances (a passive performer never blocks). |
| `perform` | `perform:{turnSeq}` | **75 000** (`performMs`) | Helpers guide via the allowed channel only; performer physically attempts the action. Performer-only actions: `claimDone` ("Je l'ai fait !") → judge; `giveUp` ("J'abandonne") → fail/0; `pass` (if `passesLeft > 0`) → passed/+2, burns one pass. Deadline → auto-fail (0, no pass spent). |
| `judge` | `judge:{turnSeq}` | **15 000** (`judgeMs`) | Every connected helper (`eligibleJudges` = connected minus performer) votes Réussi/Raté (`vote: 'yes'\|'no'`). First vote locks. Resolves on all-voted OR deadline. Counts only live (`votesIn`/`votersExpected`); individual ballots hidden. |
| `reveal` | `reveal:{turnSeq}` | **7 000** (`revealMs`) | Atomic reveal: the action text is finally shown to the performer, with the verdict stamp, the aggregate tally, and the points burst. Deadline → next turn, or `over` after 2 laps. |
| `over` | `over` | null | Final scoreboard; `gameOver(scores)` effect emitted. |

**No `scoreboard` phase** for this config: `scoreboardEvery = 0` and `scoreboardMs = 0`, so the periodic scoreboard beat is disabled (that's a puppet-mode feature). The reveal beat carries the scores forward directly.

**Session shape.** `laps = 2` → everyone performs twice. Typical turn ≈ 75 s (6 ready + perform usually ended early by "Je l'ai fait !" + up to 15 judge + 7 reveal); 103 s absolute worst case. Rooms of 3–7 → ~8–14 min. (Auto-scale to 1 lap at 8+ players is a host-tunable / roadmap item — see §4, §6.)

### Scoring (exact constants)

Resolved in `resolveVerdict` → `verdictPoints` (`perform-judge.ts` lines 57–83).

- **Réussi (`success`):** performer **+10** (`successPoints`); **every connected helper +5** (`helperPoints`, cooperative — `commanders(state)` = connected non-performers). `fastBonusPoints = 0` (no speed bonus in guided).
- **Pass (`passed`):** performer **+2** (`passPoints`); burns 1 of `passesPerPlayer = 1`. Everyone else 0.
- **Fail / give-up / timeout (`fail`):** **0 for all**.
- **Void (`void`):** performer left during `ready` → 0 for all, answer still revealed, rotation advances. (In `judge` with an empty eligible set, `zeroVotesSucceed` resolves it — see below — so `void` here is the `ready`-leave path via `onLeft`.)

### Win / draw / tie

Pure high-score over the match (`scores` map; `gameOver(over.scores)` at `over`). No tie-break inside the game module — **ties are allowed and reported as-is**. Cross-game session ranking is placement-based at the shell level (platform invariant): the shell maps this match's final placement → session XP, so the internal +10/+5/+2 scale never leaks across games. Cooperative scoring means scores cluster (helpers all gain +5 on every réussi); the *spread* comes from who performs successfully vs. fails/passes.

### Presence / disconnect behaviour (`onLeft`, lines 297–334)

- **Performer leaves during `ready`** → `void` (0 pts, answer revealed, advance).
- **Performer leaves during `perform`** → `fail` (0 pts, advance). Never blocks the room.
- **Performer leaves during `judge` / `reveal`** → no special handling; the votes/timers resolve the turn normally.
- **Helper leaves during `judge`** → a leave can *complete or empty* the expected voter set; if `allActed(eligibleJudges, votes)` is now true, resolve immediately. Never blocks on an absent voter.
- **Zero votes cast at resolve** (`cast.length === 0`): `zeroVotesSucceed = true` → **réussi by default** (benefit of the doubt; "funny never cruel"). Because `zeroVotesSucceed` is true, the empty-eligible-set `void` branch (line 73–75) does **not** trigger for guided — an emptied voter set also resolves réussi.
- **Verdict tie / majority:** `yes / cast.length >= verdictThreshold` with `verdictThreshold = 0.5`, so **ties are generous (réussi)**.
- **Rejoin** flips `connected` true with no turn effect.

### Redaction (what's secret from whom) — the load-bearing surface

`promptVisibility = 'others'` → in `projectView` (`views.ts`), `entitled = isRoster && !isPerformer`. So:

- **Secret card** (`prompt` = the action, plus `hint`, `category`, `forbidden`/taboo words) is delivered to **roster non-performers (helpers) only**, during `ready`, `perform`, and `judge`. The **performer never receives it** until `reveal`.
- **Unknown / non-roster viewers** are treated as the performer's possible second device → also blind (defensive: `entitled` requires `isRoster`).
- **Constraint card** (`constraintLabel` + `constraintRule`) is **public on every phone, every phase** — including the performer's. This is the only channel info the performer gets.
- **Forbidden words** (taboo channel) ride inside the secret card → secret from the performer exactly like the action; helper phones only.
- **At `reveal`** the action becomes fully public (`TurnResult.item`), shown to the performer for the first time.
- **Judgment buffer** (`votes`) is hidden during `judge` (counts only: `votesIn`/`votersExpected`); the public `TurnResult.tally` at reveal is **aggregate yes/no only** — individual ballots are never published.

Tested by the platform `leakedSecrets` replay audit + a field-level serialization test that the performer's serialized view contains no `action`/`forbiddenWords` strings (design risks §1).

---

## 3. Content model

### Pack item shape

Authored shape (bilingual master, `content/packs/devine-l-action.json`), normalized at runtime into `PerformJudgeItem` (`state.ts` lines 22–36):

```
{ id: string,
  action: { fr, en },            // THE secret — maps to PerformJudgeItem.prompt; helper-only until reveal
  channel: 'mime'|'sounds'|'three-words'|'taboo'|'statues',
  channelLabel: { fr, en },      // → constraintLabel — PUBLIC big card title, every phone
  channelRule:  { fr, en },      // → constraintRule  — PUBLIC one-line rule, every phone
  forbiddenWords?: { fr:[3], en:[3] },  // → forbidden — REQUIRED iff channel==='taboo'; helper-only, secret like the action
  intensity: 'soft'|'party'|'spicy',    // spicy ships ONLY in the 18+ sibling pack
  difficulty: 1|2|3,             // pre-computed offline by AI, human-reviewed
  props: boolean,                // needs physical objects — filterable per room
  tags: string[] }
```

The runtime `PerformJudgeItem.category`/`hint` fields are unused by `guided` (they belong to credit/puppet/rate). The publish pipeline splits the bilingual master into single-locale sibling packs (`gda-classic-fr` / `gda-classic-en`) per the platform single-locale `data.locale` convention.

### How many items ship

**132 items** in the authored master (verified by counting the pack):

- **By intensity:** soft **60**, party **72**, spicy **0** (correctly — spicy lives in the sibling pack, §5).
- **By channel:** mime **40**, sounds **26**, taboo **27**, statues **20**, three-words **19**.
- **By difficulty:** d1 **27**, d2 **85**, d3 **20**.
- **props:true:** **9** (filterable).

This clears the sizing floor with margin: deck-draw-without-repeat needs ≥ `maxPlayers × laps` = 16 × 2 = **32** items to avoid early pool exhaustion; 132 > 32, and exceeds the "author 60+/tier" guidance per the two shipped tiers combined.

### AI-precomputed offline

`needsOfflineAiPipeline: true`. The offline pipeline pre-computes, per item: the **action × help-channel pre-pairing** (only combos that are feasible AND funny — never rolled at runtime, which would produce duds like a sound-based action under a silent channel), the **`difficulty` score (1–3)**, and the **physical-safety lint** (rejects climbing / chugging / blindfolds / actions involving non-players). Every pack is human-reviewed before `enabled:true`. **No live AI at runtime** — the deterministic-replay contract forbids it; the constraint card is plain pack data, shuffled by the seeded deck draw.

### Voice / tone note (voice guide §5.9)

> "**`devine-l-action` — the room gangs up on one body.** The performer is the consenting sacrificial lamb; copy addresses the helpers as co-conspirators (« Il sait pas. Vous savez tous. Faites-le souffrir proprement. »). Actions should be absurd-physical with one humiliating precision. Hype is allowed here ONLY as ironic sports-commentary on a doomed athlete."

The shipped pack honours this: actions are hyper-specific absurd-physical bits ("walk an invisible dog that spots a squirrel and chooses violence. you lose the leash war"), channel rules are deadpan-lowercase ("no words. noises only. you're a sound effect with legs now."). Deck composition leans absurd-physical (clean-hands spicy-0): betrayal/exposure energy is light because the body, not a confession, is the content.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / host-tunable item from §2.9, §5.4 and the by-game `recommendations[]` — each given a FINAL ruling.

| # | Was (deferred / open / proposed) | FINAL decision | Why |
|---|---|---|---|
| D1 | *Open: which "moyens d'aide autorisés" mechanism?* | **Ship v1.** Per-round CONSTRAINT CARD, **pre-paired offline** with each action (never rolled at runtime). Launch catalog of **5 channels: mime / sounds / three-words / taboo / statues** — all shipped. | Pre-pairing guarantees every combo is feasible + funny, keeps runtime deterministic, gives content-ops a difficulty dial. Confirmed in shipped pack (all 5 channels present). |
| D2 | *Open: adjudication with zero runtime AI / no mic?* | **Ship v1.** Group verdict verbatim: performer taps "Je l'ai fait !", connected helpers vote within 15 s, `≥0.5` (ties/zero → réussi). | Deterministic, never blocks, peer judgment is itself a party beat. Shipped as `adjudication:'verdict'`, `verdictThreshold:0.5`, `zeroVotesSucceed:true`. |
| D3 | *Open: new template or reuse? (TRUTH_DARE@2 vs …)* | **Resolved — PERFORM_JUDGE `guided`.** The TRUTH_DARE@2 path is **cut/superseded** (§5.4). | devine-l-objet's redaction-footgun argument won: conditional prompt-visibility belongs on PERFORM_JUDGE's first-class `promptVisibility` axis, not bolted onto TRUTH_DARE. Same mechanic, shared module with the PERFORM_JUDGE family. |
| D4 | *Open: helpers profit from réussi — verdict bias?* | **Ship v1 as-is** (accept generosity bias; tally public at reveal). **Roadmap v2.1:** a third "on a triché / we cheated" verdict option (voids helper points, performer keeps theirs) gated on the réussi-rate analytic exceeding **~95%**. | Cooperative game; the verdict's job is stopping blatant fails + channel cheating, not precision. A punitive economy would incentivize voting friends down (brand-forbidden). Public tally makes rubber-stamping socially visible. |
| D5 | *Open: session length / round structure?* | **Ship v1.** `laps = 2` (everyone performs twice), `passesPerPlayer = 1`. **Lap auto-scale to 1 at 8+ players → host-tunable** (see §6), not auto in v1. | TikTok-native (~75 s beats); deadline chain caps a frozen performer at one act-timer. Shipped `laps:2`, `passesPerPlayer:1`. |
| D6 | *Defer: V2 channels — DRAW IN THE AIR + ONE MOUTH* | **Roadmap v2** (both). Spec: pure config/content additions — add `'draw-air'` and `'one-mouth'` to the channel enum + pack items. ONE MOUTH = phone secretly designates the single helper allowed to speak (a phone-kept sub-role, new view field). | Both are content-cheap (DRAW IN THE AIR is pure pack data). ONE MOUTH needs a new redaction sub-role + degenerates at the 3-player floor (only 2 helpers) → carries a `minPlayers` hint in pack data. Not in shipped enum (current: mime/sounds/three-words/taboo/statues). |
| D7 | *Spicy content?* | **Roadmap v1.x sibling** — `devine-l-action-spicy`, 18+ age-gated, pure config + spicy pack. Default ships soft+party (`spicyLevel:0`). See §5 for the concrete diff. | Physical dares escalate fast; spice in a separate age-gated catalog entry matches the gameConfigSchema refinement (spicy ⇒ minAge≥18) + store compliance, zero extra code. |
| D8 | *Defer: difficulty as a content-ops knob* | **Ship v1 (data only).** `difficulty:1\|2\|3` is authored + AI-pre-scored on every item and lints sizing; **not yet a runtime filter/host control.** Roadmap v2: optional host difficulty filter. | The dial exists in data (27/85/20 across d1/d2/d3) for content balance; runtime filtering is additive and unproven-needed at launch. |
| D9 | *Defer: props:true filtering per room* | **Ship v1 (data only) → host-tunable v2.** `props` flag is authored (9 items true); a "no-props" room toggle is a v2 host-tunable. | Most rooms have *some* objects; a hard filter is rarely needed at launch but trivial to add as content metadata already exists. |
| D10 | *Future PERFORM_JUDGE packs: emotions/jobs/movies/songs (themed)* | **Roadmap v2+ (pure content).** Themed `gda-*` sibling packs, same `guided` config, zero code. | After the module ships, every variant is Cadence-B config/content. Not a v1 deliverable. |

No item left as "TBD".

---

## 5. The 18+ spicy sibling config (concrete)

**Decision: a spicy tier IS warranted** (physical dares escalate naturally; the genre — Truth-or-Drink "Extra Dirty" tier — has clear adult demand). It ships as a **separate sibling game_config, not a tier toggle inside the default game**, per the platform's `spicy ⇒ minAge≥18` refinement and store compliance.

### Concrete sibling config: `devine-l-action-spicy`

```jsonc
// game_config (KV) — pure config + pack swap, NO code change
{
  "id": "devine-l-action-spicy",
  "module": "perform-judge",
  "config": "DEVINE_L_ACTION_CONFIG",   // IDENTICAL reducer config — mechanics unchanged
  "pack": "gda-spicy-fr | gda-spicy-en", // separate pack ids; spicy items only
  "tone": "spicy",
  "minAge": 18,                          // age gate (store + in-app)
  "allowedIntensities": ["spicy"],       // overrides the default soft+party
  "anonymity": "unchanged"               // identity stays fully anonymous (platform invariant)
}
```

**What changes vs. the default:**
- **Pack only.** `tone:'spicy'`, `minAge:18`, separate `gda-spicy-*` pack ids, `allowedIntensities:['spicy']`. Items carry `intensity:'spicy'` (the schema already supports it; the default pack just contains zero).
- **No mechanic change.** Same `DEVINE_L_ACTION_CONFIG` reducer config (durations, scoring, verdict, laps all identical). The reducer is config-agnostic to tone.
- **publicPicks / anonymity:** unchanged. Bloop is anonymous-forever (platform invariant) — there is no public-picks concept to flip here; the only addition is the age gate.
- **Content edge (voice guide §3 Spicy 2 + §5.9):** spicy actions add adult-physical frankness and intimacy-implication, but stay within the hard floor — no real-device dares, nothing involving non-players, no protected-trait punching, no consent-boundary or excessive-drinking framing. Physical-safety lint stays mandatory and is *stricter* here (the offline pipeline must reject anything coercive or that touches another player's body without the existing "performer is the consenting sacrificial lamb" frame).

This is the §2.9 recommendation made concrete: "a separate sibling game_config (`devine-l-action-spicy`) pins an 18+ pack with `tone:'spicy'`, `minAge:18`, behind the platform age gate — same template, pure config."

---

## 6. Host-tunable params (lobby allowlist for THIS game)

Conservative allowlist — only knobs that are safe to expose and map to existing config fields, with safe ranges:

| Param | Maps to | Default | Safe range | Notes |
|---|---|---|---|---|
| **Laps (rounds)** | `laps` | 2 | **1–3** | 1 lap for big/short rooms; 3 max to keep sessions TikTok-length. Recommend the client auto-suggest 1 at 8+ players (D5). |
| **Spicy / 18+ pack** | sibling config swap | off (soft+party) | off / on | "on" loads `devine-l-action-spicy` behind the age gate — not an in-game toggle; it's a config selection. |
| **Verdict length** | `judgeMs` | 15 000 ms | **10 000–20 000** | Shorter for snappy rooms; never below 10 s (voters need to read the channel-cheat question). |
| **Perform length** | `performMs` | 75 000 ms | **45 000–90 000** | Lower bound matches the credit-mode 45 s; upper bound keeps worst-case turn near ~2 min. |
| **No-props room** | content filter on `props` | off | off / on | v2 host-tunable (D9) — filters out the 9 props:true items for prop-less rooms. |

**Locked / NOT host-exposed** (to protect game integrity): `successPoints`/`helperPoints`/`passPoints` (scoring scale), `verdictThreshold`, `zeroVotesSucceed`, `promptVisibility`, `adjudication`, `readyMs`/`revealMs`, `passesPerPlayer` (fixed at 1). Difficulty filtering stays content-ops, not host-facing, in v1 (D8).

---

## 7. Future modes roadmap

Each as one decided line.

- **v2 — ONE MOUTH channel:** SHIP-LATER. Add `'one-mouth'` to the channel enum; phone secretly designates the single helper allowed to speak (new redaction sub-role + one view field). Carries a `minPlayers:4` hint (degenerates with only 2 helpers).
- **v2 — DRAW IN THE AIR channel:** SHIP-LATER (pure content). Add `'draw-air'` to the enum + pack items; no code beyond the enum widening.
- **v2.1 — "On a triché" third verdict option:** ROADMAP, conditional. Ship only if the réussi-rate analytic exceeds ~95% (verdict-is-theater signal). Adds a third vote value that voids helper points while the performer keeps theirs.
- **v2 — Host difficulty filter:** SHIP-LATER. Expose the existing `difficulty:1\|2\|3` data as an optional lobby filter (easy/medium/hard rooms).
- **v2 — No-props room toggle:** SHIP-LATER. Host-tunable filter on the existing `props` flag.
- **v1.x — `devine-l-action-spicy` (18+):** SHIP-LATER (pure config + pack), per §5.
- **v2+ — Themed packs (emotions / jobs / movies / songs):** SHIP-LATER (pure content), same `guided` config.
- **CUT — Independent runtime channel draw:** CUT permanently. Rolling channel separately from action produces infeasible duds; pre-pairing is the ruling (D1).
- **CUT — TRUTH_DARE@2 / `promptHiddenFromActive` implementation:** CUT (superseded by PERFORM_JUDGE `guided`, §5.4).
- **CUT — "AI decides if you did it":** CUT. The room is the referee, the phone is timer+scorer; no live AI at runtime (platform invariant + D2).

---

## 8. Risks & content-ops notes

- **Redaction is THE load-bearing surface.** The action text and taboo `forbiddenWords` must NEVER appear in the performer's view during `ready`/`perform`/`judge`. Guarded by `promptVisibility:'others'` + `entitled` projection, audited by the platform `leakedSecrets` replay test and a field-level serialization assertion. Any view change must re-run both.
- **Pack sizing lint.** Deck-draw-without-repeat needs ≥ `maxPlayers × laps` = **32** items or the game ends early on pool exhaustion (`advanceTurn` → `pool_exhausted` analytics, graceful but short). Current pack = **132** (soft 60 / party 72) — comfortable. Lint should fail any future pack edit dropping below 32 per active intensity set; keep authoring at 60+/tier as the freshness buffer.
- **Verdict generosity bias.** Helpers profit from voting réussi, so the verdict skews yes. Accepted by design (cooperative); **monitor the réussi-rate analytic** — `>95%` triggers the v2.1 "on a triché" option (D4). Tally is public at reveal so rubber-stamping is socially visible.
- **Channel enforcement is social-only.** The app cannot hear the room. Mitigation (shipped): the constraint card is unmissable on every phone every phase (big `channelLabel` + one-line `channelRule`); verdict copy must instruct "vote Raté if the helpers cheated the channel." Content-ops must keep rule copy unambiguous per locale.
- **Physical safety (moderation surface).** Actions are performed for real in a living room. The offline pipeline **must** lint out risky verbs (climbing, chugging, running blindfolded, anything involving non-players) and a human reviews every pack. `props:true` items are flagged for room-level filtering. This lint is the primary moderation gate — runtime has **zero free-text surface** (the action schema is enum-only; no typed gameplay text).
- **3-player floor.** With only 2 helpers, mime/sounds/taboo/statues still work; the verdict is a 2-vote majority (ties → réussi). The ONE MOUTH channel degenerates at this floor and is correctly deferred to v2 with a `minPlayers` pack hint.
- **Disconnect griefing.** A wave of helper disconnects during `judge` can empty the voter set → resolves réussi by default (`zeroVotesSucceed:true`). A griefing duo could exploit this in tiny rooms. Acceptable at these (cooperative, low-stakes) stakes; monitor. Performer disconnect mid-turn always resolves fail/void-and-advance — never blocks.
- **Freshness / decay.** Channel formats are TikTok-native and durable; the decay risk is action *repetition* across sessions in the same room (room SQLite is TTL-wiped, so no cross-session memory — repetition shows only within a long session, bounded by the 132-item without-repeat deck). Themed packs (roadmap) are the freshness lever.
