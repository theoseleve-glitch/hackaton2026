# `mime-inverse` — Mime Inversé / Reverse Mime — FINAL DESIGN

| Field | Value |
|---|---|
| **Game id** | `mime-inverse` |
| **Name (FR)** | Mime Inversé |
| **Name (EN)** | Reverse Mime |
| **Template + mode** | `PERFORM_JUDGE` (shipped module `perform-judge`, id passed at registration), `config.mode = 'puppet'` |
| **Players** | min **3** (`MIME_INVERSE_CONFIG.minPlayers = 3`) — max **16** (module `maxPlayers = 16`) |
| **Spicy tier** | **0** (all-ages, clean-hands; 184/184 pack items `spicyLevel: 0`) |
| **Physical** | **mixed** (puppet stands and performs; seated performance is explicitly legitimate for mobility-impaired players) |
| **Status** | **SHIPPED** — module + 184-item pack implemented, tested, playable |

> Ground-truth note: the design json calls the template `NEW:TIMED_VERDICT`. The code consolidated it: mime-inverse ships as one of **four** configs on the single `perform-judge` reducer (`guided` / `credit` / `puppet` / `rate`). This document is authoritative on the **shipped** `MIME_INVERSE_CONFIG` (`packages/games/perform-judge/src/state.ts` L162–188). Where the older json or §2.13 disagrees with the code, the code wins.

---

## 1. Pitch + room fantasy

**One-liner.** Inverted charades: the puppet stands up knowing *nothing*; everyone else sees the secret action on their phones and shouts imperative directions ("lift your arms! push it forward!") — never the taboo words — while the puppet blindly obeys and guesses out loud what they're being made to do.

**Room fantasy — consensual gaslighting.** The whole room becomes one collective puppeteer operating a single confused body. The laugh is manufactured twice: first live, in the gap between the room *knowing* and the puppet *flailing* ("why am I doing this?!"), and again at the reveal — the payoff beat where the puppet finally learns they just spent 30 seconds *giving birth to a fridge*. The argument it manufactures is the commanders fighting over who gave the worst instruction and the puppet protesting the betrayal. Per the voice guide §5.13: "*cruelty is structural and consented — the text can be merciless because the mechanic is kind.*"

---

## 2. Shipped ruleset (AUTHORITATIVE — from `MIME_INVERSE_CONFIG` + reducer)

### Phases (real `phaseKey` + `phaseDurationMs`)

`phaseKey = \`${phase}:${turnSeq}\`` for every live phase; terminal is the bare string `'over'`. `turnSeq` is monotonic, `++` on each turn entry (`perform:0`, `judge:0`, `reveal:0`, `scoreboard:0`, `perform:1`, …). **There is no `ready` beat** — `readyMs: 0`, so a turn enters straight at `perform`.

| Phase | `phaseKey` | Duration (ms / s) | Beat |
|---|---|---|---|
| perform | `perform:{turnSeq}` | `performMs = 30_000` / **30 s** | Puppet's phone shows category hint + timer only. Commanders (all connected non-performers) see the secret action + forbidden words and shout imperative directions. Any commander taps **`tap`** ("Trouvé !") the instant the puppet names it. Strict majority of connected commanders tapped → **`success-early`** (+speed bonus) → straight to reveal (skips judge). Deadline → `judge`. Puppet-left → `void` → reveal. |
| judge (verdict) | `judge:{turnSeq}` | `judgeMs = 10_000` / **10 s** | Last call: "did they get it (or close enough)?" Each connected commander votes `yes`/`no` (first vote locks). **Perform taps carry over as pre-cast `yes`** (`enterJudge` rebuilds votes from `taps` in puppet mode). Resolves when all eligible voters have voted, or at deadline. |
| reveal | `reveal:{turnSeq}` | `revealMs = 7_000` / **7 s** | Answer revealed to EVERYONE — the puppet finally learns what they mimed. Outcome stamp, **aggregate tally only** (`{yes, no}` — never per-voter), `+points` animation, next puppet announced. |
| scoreboard | `scoreboard:{turnSeq}` | `scoreboardMs = 6_000` / **6 s** | Standings beat. `scoreboardEvery = 4` → inserted every 4 completed turns, and always once before `over`. **Client-side ad interstitial fires here** off the `phaseKey` transition to `scoreboard:*` (server-shell design, never a reducer effect). |
| over | `'over'` | `null` (untimed) | Terminal. `gameOver(scores)` effect with a defensively-cloned scores map. Reducer is a no-op for all further events. |

**Rotation / length.** `laps = 1` → exactly **one** lap of the seeded rotation = one turn per connected player. Seat order is `shuffle(createRng(\`${seed}|rot\`), players)`; the deck is `shuffle(createRng(\`${seed}|deck\`), items)`. `promptChoices = 1` (no mover choice — `chosenIndex` fixed at 0), `passesPerPlayer = 0` (no pass mechanic in puppet). At N players the match is N turns + ⌈N/4⌉-ish scoreboards. Game also ends early if the deck can't serve the next turn (`cursor + 1 > deck.length`) — irrelevant at 184 items / max 16 turns.

### Scoring (exact constants)

On **success** / **success-early** (`verdictPoints`):
- **Puppet (performer):** `successPoints = 100`, **plus** `fastBonusPoints = 50` **iff** `success-early` (room confirmed via strict tap-majority during the command window). So puppet earns **100** (verdict success) or **150** (early success).
- **Every connected commander:** `helperPoints = 50` each, regardless of their individual vote. This is collective scoring — `verdictPoints` loops `commanders(state)` and awards 50 to each, killing any false-positive tap incentive.

On **fail** / **void** / (verdict no): **0 for everyone** (`finishTurn` with `emptyPlayerMap`).

Unused-in-puppet constants present in config: `passPoints: 0`, `starMultiplier: 0`, `ovationBonus: 0`, `noVoteDefaultStars: 3` (these belong to other modes).

### Win / draw / tie rules

No explicit winner is computed in the module — `over` emits the full cloned `scores` map and the **shell ranks** it. Highest cumulative score wins. **Ties are left tied** at the game layer; the shell's cross-game session XP is **placement-based** (cross-game-synthesis §1.7), so a tie resolves to shared placement. Internally, mime-inverse keeps its own 100/50 point scale; the shell never compares raw points across games.

### Verdict resolution edge rules (`resolveVerdict`)

- `success` iff `yes / cast >= verdictThreshold (0.5)` — **ties resolve generous → success** ("funny never cruel").
- **Zero votes cast at resolve:** `zeroVotesSucceed = false` → puppet's empty-cast resolves **fail** — UNLESS the *eligible voter set is empty* (`eligible.length === 0`), which resolves **`void`** (never fail) per the mime-inverse design. So: nobody bothered to vote = fail; nobody *could* vote (all commanders gone) = void.
- `earlyMajorityResolve = true`: strict tap-majority during perform resolves `success-early` immediately. `tapGoal = floor(commanders/2) + 1`, re-evaluated against the live connected commander set on every event.

### Presence / disconnect behaviour (`onLeft`, `commanders`, `eligibleJudges`)

- **Denominator is always live.** `commanders(state)` = connected players minus performer; `tapGoal` and `eligibleJudges` are recomputed on every event, so a disconnect shrinks both the majority denominator and the expected-voter set. A disconnected/passive player can **never block** the room — every phase is timed.
- **Puppet leaves during `perform` or `judge`** → turn resolves **`void`** (answer still revealed, 0 pts, rotation moves on). The room never stalls on an absent star.
- **Commander leaves during `perform`** → re-evaluates early-majority against the shrunk set; if the remaining taps already meet `tapGoal` (and `tapCount > 0`), resolves `success-early` immediately.
- **Commander leaves during `judge`** → re-checks `allActed(eligibleJudges, votes)`; a leave can complete the expected set and trigger resolution, or empty it → resolve with cast votes (or `void` if the eligible set is now empty with zero cast).
- **Rejoin** (`playerRejoined`) → `connected = true`, no phase change; eligible again at the next evaluation. Roster keys and scores are never deleted on leave.

### Redaction (what's secret from whom) — the load-bearing surface

`promptVisibility = 'others'`. The **secret** is `{ prompt (the action), hint, category, forbidden }`.

- **Entitled to the secret** during perform & judge: `isRoster && !isPerformer` — i.e. **roster commanders only**.
- **Puppet (performer)** sees: phase, turnSeq, scores, connected, live `tapCount` + `tapGoal` (COUNTS only — tension feedback), `myTapped`, and the **category hint** (`showCategoryToPerformer = true` → `categoryHint` populated from `item.category`). **Never** the action text or forbidden words.
- **Unknown / spectator viewer** is treated as a possible second device of the puppet → gets the **performer-redacted** view (no secret). This is the anti-cheat rule: the secret is shown only to viewers provably in `players` and provably not the performer.
- **Judgment buffers** (`votes`, `taps`) surface as **counts plus an owner-only echo** (`myVote`, `myTapped`); individual ballots are never published, even at reveal.
- **Reveal** promotes the full `TurnResult` (action text via `item`, category, outcome, aggregate `tally {yes,no}`, per-player `points`, scores) — **public to all**. Per-voter verdicts stay secret forever (nobody sees "Marie voted no on you").

---

## 3. Content model

### Pack item shape (`PerformJudgeItem`, puppet subset)

```jsonc
{
  "id": "mi-act-001",                    // stable id, mi-act-NNN
  "action": { "fr": "...", "en": "..." },// THE SECRET — commanders only; runtime field is `prompt` after the union clean
  "category": { "fr": "...", "en": "..." }, // soft hint to puppet + public at reveal
  "forbidden": { "fr": [...], "en": [...] },// 3–5 taboo words/locale, display-only honor rule (NO speech recognition)
  "difficulty": 1 | 2 | 3,               // 1 ≈ guessable in ~15s
  "spicyLevel": 0,                       // pack is uniformly 0
  "tags": ["physical", "household", ...] // physical / household / food / sports / animals / funny / work / situational / ...
}
```
The runtime `PerformJudgeItem` (state.ts) is the cleaned union of all four authored pack shapes: authored `action` becomes the runtime `prompt`; `constraintLabel`/`constraintRule` are unused by puppet (those are the guided channel). The bilingual authoring source is split at publish into single-locale runtime packs (`mime-inverse-fr` / `mime-inverse-en`, `data.locale`) per cross-game-synthesis §3.1.

### How many items ship

**184 items** in `content/packs/mime-inverse.json` (`version 1`, `generatedAt 2026-06-11`), all `spicyLevel: 0`. Difficulty spread: **84× d1, 81× d2, 19× d3**. This vastly clears the lint floor (`>= 16 = maxPlayers × roundsPerPlayer`; "ship 60+" recommendation) and gives strong anti-repeat headroom (max 16 turns/match against 184 items → ~11 matches before the deck recycles). Categories span Corvées/Chores, Cuisine/Kitchen, Voyage/Travel, Sport/Sports, Animaux/Animals, Nature/Outdoors, Spectacle/Showbiz, Musique/Music, Métiers/Jobs, Bureau/Office, Transports.

### AI-precomputed offline?

**None.** `needsOfflineAiPipeline: false`. There is **no live AI at runtime** (platform invariant) and **no offline precompute** either — items are human-authored card text. AI-assisted *drafting at volume* behind a human gate is recommended for future packs (design doc §… "no pre-computed values — but AI-ASSISTED drafting at volume is recommended"), but nothing is machine-computed into the shipped pack.

### Voice / tone note (voice-guide §5.13 — "consensual gaslighting")

The room puppeteers one clueless body; copy **leans into the puppeteering** ("Obéis. Comprends plus tard."). Commander-facing instruction framing is **imperative-military**. The **reveal is the payoff and gets the ceremonial drop** ("Tu viens de passer 45 secondes à accoucher d'un frigo."). Cruelty is structural and consented — text can be merciless because the mechanic is kind. The shipped action items already embody §1 specificity: not "mow the lawn" but "*washing exactly one fork, yours, and restacking your flatmate's dirty dishes as a monument*" — one concrete action + one absurd, humiliating precision.

---

## 4. RESOLVED DECISIONS (every former defer / v2 / open-question / spicy / hostTunable → FINAL)

| # | Was (open question / defer / risk / recommendation) | NOW — final ruling | Why |
|---|---|---|---|
| D1 | *How does the system know the puppet guessed right? (adjudication left open)* | **Ship v1 — peer-tap, two beats.** Strict tap-majority during 30 s perform → instant `success-early`; else 10 s `judge` verdict (yes/cast ≥ 0.5, ties generous). Shipped exactly as in `MIME_INVERSE_CONFIG`. | Enum-only (zero moderation surface), IRL-native, "close enough" handled generously. Typing mid-mime kills the physical comedy and adds synonym-matching. MCQ rejected. |
| D2 | *Is 30 s the right command window? — tunable 20–45 s* | **Ship v1 — `performMs = 30_000`.** Tuning window 20 000–45 000 lives in the **catalog (game_config / KV)** — a config edit, no deploy. **Not** exposed at the lobby (see §6 for what IS host-tunable). | Brief specifies 30 s; playtest tuning belongs in catalog (KV edit, no deploy). Early-majority makes good rounds pop at ~15–20 s anyway. |
| D3 | *Who scores, and how much?* | **Ship v1 — collective.** Puppet +100 (+50 speed iff early), every connected commander +50, fail/void = 0. Match-local; session XP placement-based. | Rewarding individual taps incentivizes false-positives; collective crew points make the only winning move *good instructions*. 100/50 mirrors hot-seat asymmetry. |
| D4 | *Which template — can an existing one carry it?* | **Ship v1 — consolidated.** Shipped as `PERFORM_JUDGE` `puppet` (one reducer, four configs), NOT a standalone `TIMED_VERDICT` module. | No existing template had the inverted redaction + this phase loop. Consolidating into PERFORM_JUDGE yielded one module = four tiles and a battle-tested redaction harness. |
| D5 | *How do we stop commanders saying the answer out loud?* | **Ship v1 — display-only taboo + hold-to-peek.** 3–5 forbidden words rendered on commander screens (honor rule, social enforcement, Taboo genre standard); commander secret card defaults to **hold-to-peek** (client requirement). No speech recognition ever. | Speech recognition violates the deterministic no-AI-runtime rule and is unnecessary. The real leak is physical (shoulder-surfing), addressed by hold-to-peek, not the view layer. |
| D6 | *Should the puppet get a hint? What about players who can't/won't perform?* | **Ship v1 — category hint on (`showCategoryToPerformer = true`); seated performance always legitimate; disconnect/freeze → `void`.** | A hopeless flailing puppet stops being funny — the category keeps rounds solvable ("funny never cruel"). Void-and-move-on matches the active-left rule; no phase blocks on an absent/passive player. |
| D7 | *"Name 3 in 5s" / `blitz` as a future mode (resolves template-arch §7 Q1)* | **Roadmap v2 — separate sibling config on a future module, NOT mime-inverse.** Blitz is a timed peer-tap verdict with a *public* prompt (`promptVisibility: 'all'`) — a different redaction axis. It is its own catalog tile, not a mode toggle inside mime-inverse. | Blitz never belonged in mime-inverse's inverted-redaction game; shipping it as its own config keeps the redaction matrix clean. Not yet built. |
| D8 | *Future content packs: emotions, jobs, movies, songs, solo-mime, air-band* | **Roadmap v2 — same module, new pack ids, zero code.** Each is a new `mime-inverse-<theme>-{fr,en}` pack under the same `puppet` config; ship as catalog content drops, gated on the same lint. | Pure content; no reducer change. Prioritise by playtest pull; "jobs" already partly covered by the Métiers category in v1. |
| D9 | *Risk: 16-player session ≈ 12+ min — cap turns or bump `scoreboardEvery`* | **Ship v1 default unchanged (`laps = 1`, `scoreboardEvery = 4`); add a catalog override for big rooms.** For rooms ≥ 12, catalog may bump `scoreboardEvery` to 6 (fewer ad breaks) — KV edit, no deploy. `laps = 1` already caps the match at N turns. | `laps = 1` already bounds length (one turn each). Big-room pacing is a catalog tuning concern, not a code change. |
| D10 | *Risk: bilingual sample items are an authoring shape; runtime is single-locale* | **Ship v1 — publish pipeline splits FR/EN with parallel-coverage gate.** The 184-item bilingual source publishes to `mime-inverse-fr` + `mime-inverse-en`; the catalog locale gate refuses a locale with fewer than the lint floor. | Without the split + parity gate, the locale gate strands one language. This is a publish-pipeline invariant, already required platform-wide. |
| D11 | *Risk: redaction inversion (secret must never reach puppet OR unknown viewers)* | **Ship v1 — closed in code + tests.** `entitled = isRoster && !isPerformer`; unknown ids get the performer-redacted view; per-turn `leakedSecrets` audit + field-level test that no `items`/`taps`/`votes` maps serialize into puppet/unknown views. | This is the core engineering risk; it is shipped behind the redaction harness and tests, not deferred. |
| D12 | *Risk: verdict griefing (troll majority votes down a correct guess)* | **Ship v1 — accept with structural mitigations.** Ties resolve generous; collective scoring removes any points incentive to grief; votes never publicly attributed (aggregate tally only); room social pressure is the referee. | Same accepted posture as truth-or-dare §9 Q3. No per-voter exposure to weaponize, no incentive to false-tap. |
| D13 | *Risk: venue / physical constraints (~2 m², shouting OK, no props/contact)* | **Ship v1 — authoring lint enforces safety; seated performance legit.** Lint rejects actions needing props, running, or physical contact with other players; every action authorable standing in ~2 m². Flagged as a known venue limitation (unusable in quiet venues). | Safety + inclusivity floor. The 184 shipped items already conform (no-prop, no-contact, in-place). |
| D14 | *18+ spicy pack (spicyLevel 1–2), age-gated, separate pack id — "recommend launching without it"* | **Roadmap v2 — single sibling pack `mime-inverse-spicy-{fr,en}`, tone `spicy` + `minAge ≥ 18`, no mechanic change.** Launching v1 WITHOUT it (as recommended). Full config in §5. | Mechanic is identical; only the pack content + gate change. Consent framing required for physically suggestive actions. Ships post-launch, not at v1. |
| D15 | *`claimBy: "judges"` param in the §2.13 json block* | **Cut — does not exist in shipped config.** Puppet adjudication is `verdict` with the room (commanders) as judges by construction; there is no `claimBy` knob. | The shipped `PerformJudgeConfig` has no `claimBy`; the older json param was superseded by the consolidated config's `adjudication: 'verdict'`. |

No item left as "TBD".

---

## 5. The 18+ spicy sibling config (concrete)

**Decision: warrant a spicy tier, but as a content-only sibling shipped post-launch (v2). v1 ships spicy-0 only.** Mime-inverse is a *physical performance* game, so the edge has a real ceiling — the hard floor (§3 of the voice guide) forbids forcing a player to *do X to another person's body*, which rules out the rawest sex-mime content. The spicy tier therefore lands at **tier 1 (innuendo / taboo-adjacent), not tier 2 (explicit)**.

```jsonc
// catalog entry — sibling tile, SAME module + SAME MIME_INVERSE_CONFIG (zero mechanic change)
{
  "id": "mime-inverse-spicy",            // distinct catalog id, separate tile
  "module": "perform-judge",             // identical reducer
  "config": "MIME_INVERSE_CONFIG",       // byte-identical: durations, 100/50, verdict, all unchanged
  "tone": "spicy",
  "minAge": 18,                          // age gate at lobby/store
  "packIds": ["mime-inverse-spicy-fr", "mime-inverse-spicy-en"],  // SEPARATE pack ids, never merged with the base pack
  "spicyTier": 1                          // tier-1 ceiling, NOT tier-2 — see rationale
}
```

**What changes vs base:**
- **Tone of actions:** dating/innuendo register — drunk-texting an ex, the walk of shame, "fake a phone call to escape a bad date", awkward-physical-but-clothed comedy. Taboo-ADJACENT (the room's brain finishes the dirty work); the *action text* stays screenshot-clean, the *performance* is socially radioactive.
- **`minAge`:** 18, hard age gate. **`tone: 'spicy'`** flag.
- **publicPicks / anonymity:** **unchanged** — votes remain aggregate-only and per-voter-secret in both tiers (mime-inverse never exposes individual ballots). No new anonymity surface is needed.
- **Separate pack ids** (`mime-inverse-spicy-*`), behind the `tone:'spicy' + minAge>=18` gate; never co-mingled with the base 184.
- **Mechanics that change:** **none.** Same 30/10/7/6 s phases, same 100/50 scoring, same redaction, same `laps = 1`. Only the pack content + gate differ.

**Why tier-1, not tier-2:** the §3 hard floor bars "make the player actually do X to another person's body" — a physical-mime game cannot stage explicit sex acts without crossing it. The edge comes from *implication and exposure* (the mechanic already forces a body into compromising-looking positions), not anatomy. A "no spicy tier" ruling would leave a real, safe, funny edge on the table; a tier-2 ruling would collide with the safety floor. Tier-1 is the calibrated answer.

---

## 6. Host-tunable params (lobby allowlist for `mime-inverse`)

The lobby exposes a **minimal** allowlist; performance/scoring constants stay catalog-fixed (KV, no deploy) per §7 Q4. For mime-inverse there is effectively **one** meaningful host toggle plus the pack/tier selector:

| Param | Host control | Safe range / options | Default | Notes |
|---|---|---|---|---|
| **Spicy/tone toggle** | yes | `clean` (base pack) \| `spicy` (18+ sibling) | `clean` | Selects pack id; `spicy` requires the room to confirm 18+. Available once D14 ships. |
| **Pack / theme** | yes | base \| future theme packs (emotions, movies, …) | base | Content selector only; same config. |
| `laps` (rounds per player) | **catalog-only, NOT lobby** | 1–2 | 1 | §2.13 specifies 1 lap; a 2-lap "long game" is a catalog variant, not a lobby slider, to keep the lobby uncluttered and sessions TikTok-short. |
| `performMs` | **catalog-only** | 20 000–45 000 | 30 000 | D2 — tunable in catalog, not at lobby. |
| `scoreboardEvery` | **catalog-only** | 4–6 | 4 | D9 — bumped to 6 for big rooms via catalog. |
| Scoring constants (100/50/50), `verdictThreshold`, `earlyMajorityResolve`, `showCategoryToPerformer` | **locked** | — | as config | Never host-tunable; changing these changes the game's identity. |

**Net lobby surface: spicy/tone toggle + pack selector.** Everything else is catalog-fixed or locked.

---

## 7. Future modes roadmap (v2 / v3)

| Item | Decision (one line) |
|---|---|
| **`blitz` ("Name 3 in 5s")** | **Roadmap v2** — ship as its OWN PERFORM_JUDGE config (`promptVisibility: 'all'`, public prompt, ~5 s perform, peer-tap verdict), a separate catalog tile; resolves template-arch §7 Q1. Not a mode inside mime-inverse. |
| **Spicy 18+ sibling** | **Roadmap v2** — `mime-inverse-spicy-{fr,en}`, tier-1, `minAge 18`, zero code (see §5). |
| **Theme packs** (emotions, jobs, movies, songs) | **Roadmap v2** — content-only drops on the same config; prioritise by playtest pull. |
| **`solo-mime` / `air-band` variants** | **Roadmap v3 (or cut)** — these imply a *different redaction* (performer-sees-prompt, like `rate`/`credit`). Decision: **cut as mime-inverse modes**; if pursued, fold into the existing `rate`/`guided` configs as new packs, not new mime-inverse logic. |
| **2-lap "long game"** | **Roadmap v2 — catalog variant** (`laps: 2`), not a lobby toggle; offered as a separate "Marathon" tile if demand appears. |
| **Remote / video play** | **Roadmap (platform-level)** — mime-inverse already works same-room-first; remote needs only the platform's video layer, **zero reducer change** (presence + timed phases already handle it). |

---

## 8. Risks & content-ops notes

- **Redaction inversion (closed, monitor).** Secret must never reach the puppet or any unknown viewer. Shipped behind `entitled = isRoster && !isPerformer`, unknown→performer-redacted, per-turn `leakedSecrets` audit + field-level serialization test. Treat any view-schema change to perform/judge as a redaction-regression risk → re-run the leak audit.
- **Pack sizing lint.** Floor: `>= 16` items per locale (`maxPlayers × roundsPerPlayer`), recommend 60+. **Shipped: 184**, well clear. Lint must also assert: every action no-prop / no-contact / in-place (~2 m²); 3–5 forbidden words; difficulty ∈ {1,2,3}; FR/EN parity after the publish split (D10).
- **Freshness / decay.** Repeat exposure is low (max 16 of 184 per match), but the *funniest* d1 items get sampled most. Content-ops: rotate in theme packs quarterly; track per-item `turn_resolved` outcome rates — items that never hit `success`/`success-early` are too hard (mis-tagged difficulty) and should be re-tiered or cut.
- **Moderation surface: zero free-text.** All actions are enum-only (`tap`/`vote`/…); the only UGC channel is *spoken*, in-room, unrecorded. Moderation is the lobby's report/kick/block on nicknames; nothing persists (room SQLite TTL-wiped). Forbidden-words are a display-only honor rule — no speech recognition, no runtime AI.
- **Spicy moderation (when D14 ships).** Tier-1 sibling needs the adversarial "worst-possible-hands" check on every action (§3 hard floor): no protected-trait punching, no sexual content forced onto another player's body, consent framing for suggestive actions. The age gate is necessary but not sufficient — the lint + writers-room check is the real guard.
- **Venue limitation (communicate in UI).** Needs ~2 m² and a room where shouting is OK; unusable in quiet/cramped venues. Seated performance must remain legitimate (mobility-impaired inclusivity) — already a lint requirement.
- **Big-room pacing.** 16 players → 16 turns + scoreboards ≈ 12+ min. Mitigation is catalog-only (`scoreboardEvery → 6`), not a code change (D9).
