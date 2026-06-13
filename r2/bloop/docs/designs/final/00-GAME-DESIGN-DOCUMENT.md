# Bloop — The Canonical Game Design Document

| | |
|---|---|
| **Title** | Bloop — Game Design Document (the single authoritative GDD) |
| **Date** | 2026-06-13 |
| **Status** | **FINAL.** This is the finished design, not a survey. The 18 games are shipped; their per-game finalized designs (`docs/designs/final/games/*.md`) and the 7 meta-layer designs (`docs/designs/final/meta-0*.md`) are canonical. Where this GDD and a source doc disagree on a *catalog or roadmap* fact, this GDD rules; where they disagree on a *mechanic*, the per-game doc rules. |
| **Owner** | Lead game architect (catalog / meta / canon) |
| **Product one-liner** | *Bloop is Jackbox built for the TikTok-native French + English party: pass-the-phone party games for 16–30-year-olds where the phone is the secret-keeper, timer, and scorer, the laughs happen in the room, and every game manufactures an argument or a confession.* |

**The locked platform invariants (do not relitigate).** Bloop runs on **Cloudflare Durable Objects** (one DO per room) behind a **Hono** front-door, with **KV** config and **R2** content packs. Every game is a pure-TypeScript `GameModule` (`init` / `reduce` / `view` / `phaseDurationMs` / `phaseKey`) that is **server-authoritative**, applies **per-viewer redaction**, uses only **seeded RNG** (no wall-clock, no ambient RNG), and **never invokes AI at runtime** — AI is an *offline* content pipeline only. The client is **React Native + Expo** with **EAS OTA**. Identity is **fully anonymous forever**: no accounts, no server profiles, room SQLite is TTL-wiped. Play is **same-room first, remote later with zero realtime-layer change**. Monetisation is **ads-only**: the interstitial fires **client-side** off the `phaseKey` transition into a terminal `over`/`scoreboard:*` key (server-shell design) — **never** a reducer effect. Cross-game session XP is **placement-based, not raw points** (cross-game-synthesis §1.7): each game keeps its own internal score scale and the shell awards XP off per-match placement so scales stay comparable.

**Design north star.** Five words, in priority order: **Fun · Social · Expressive · Inclusive · Easy.** Fun beats clever; the fun lives in the room, not on the screen. Social means the phone is an instigator, not a stage — it slides the knife across the table and says *« vas-y, raconte »*. Expressive means the content is transgressive in the *social* register (exposure, betrayal, shame, cartoon hyperbole) and never the *identity* register (the hard floor, §5.3). Inclusive means funny-never-cruel, a participation floor on XP, colour-independent state, and a 44pt-target / WCAG-AA / reduced-motion baseline. Easy means a stranger can be handed the phone and play in seconds — no accounts, no manual, host-config in two taps.

---

## 1. Product vision & pillars

### 1.1 What Bloop is

Bloop is a **same-room multiplayer party-game app** in the lineage of Jackbox — one host screen's worth of orchestration, but distributed across everyone's phones — fused with the **viral-YouTube/TikTok party-format** canon the target cohort already recognises (Squeezie's *Tu Préfères*, the Sidemen's *Most Likely To*, Cut's *Truth or Drink*, Delemazure's *de gauche ou de droite*). It launches **bilingual (FR + EN)**, aimed at **16–30-year-olds**, **anonymous forever**, funded **ads-only**.

The product is **18 shipped games across 10 archetype modules** (meta-07 §1), wrapped in a **session shell** (the "Night") that strings matches into an evening with placement-based XP, streaks, and an end-of-night roast (meta-01). Three more brand-book modes ship as config on existing modules (meta-06), and a ranked roadmap of originals sits behind a single remaining module gap (`RANKING`, meta-07 §2.2).

### 1.2 Who it's for

The TikTok-native 16–30 cohort that plays party formats *socially* and shares the aftermath. They arrive in a room (4-char code or QR, handed across a table or dropped in a group chat), play for a ~45-minute "Night," and screenshot the roast. They have no patience for accounts, tutorials, lanyard-energy hype copy, or prudishness — the co-founder verdict that drove the voice guide was "extremely lame and AI-like, humour really prude." They want to be *exposed, dared, and given an argument to have*.

### 1.3 The core fantasy

**The phone is the secret-keeper, the timer, and the scorer — and then it gets out of the way.** Every game offloads the three things a party host fumbles (holding the secret, watching the clock, tallying the score) onto a server-authoritative, per-viewer-redacted Durable Object, so the humans can do the only thing worth doing in a room: look each other in the eye. The reveal with names attached — *« TOI t'as voté ça ?! »* — is the payoff every game is written toward.

**Every game manufactures an argument or a laugh.** This is the editorial law (voice guide §1.6, "conflict is the product"): binary verdicts with no safe middle, dilemmas where both options cost something, rankings where someone must be last, predictions that can be publicly wrong, designations that name a person in the room. A line everyone agrees with is filler.

### 1.4 Differentiators vs Jackbox & competitors

| Differentiator | Bloop | Jackbox / typical competitor |
|---|---|---|
| **No shared screen required** | every phone is a controller *and* a stage; pure same-room-first, remote later with zero realtime change | needs a TV/host screen |
| **Anonymous forever** | no accounts, no profiles, room SQLite TTL-wiped; instant play, zero data | accounts / room codes tied to a service |
| **Edge-native, viral-format-native** | the cohort's recognised TikTok/YouTube formats, transcreated FR+EN, "inspired by {creator}" credit hooks (meta-04 §7) | Anglocentric, original IP |
| **One night, not one match** | placement-based cross-game XP + Oracle-of-the-Night roast make the *evening* the memorable unit (meta-01) | per-game scoring, no cross-game arc |
| **Edge calibrated, not prude** | transgressive-social content + an 18+ spicy tier behind a self-attested age gate, all under a hard store-policy floor (meta-03) | family-safe or uncalibrated |
| **Front-loaded engine cost** | 10 modules back the whole catalog; the catalog can ~double on content-only ops (meta-07 §5) | per-game bespoke builds |
| **Ads-only, honest** | one interstitial between games (skippable 5s), rewarded spicy unlock, £1.99 night pass; no pay-to-win, no PII (meta-02) | subscriptions / heavier monetisation |

---

## 2. The session loop & progression (the "Night")

This is meta-01, summarised. The shell never needs to understand any game's rules; it consumes exactly four signals from a match — final `gameOver.scores`, the roster frozen at `init`, the terminal `phaseKey`, and a per-game meta-manifest (display name + opt-in superlative signals).

### 2.1 The loop

```
NIGHT  (one room, ≤45-min idle TTL, soft 8-match arc)
 lobby ──startGame──▶ playing ──phaseKey→'over' + gameOver──▶ roundOver
   ▲                                                            │  │  │
   └──── nextGame / rematch ◀───────────────────────────────────┘  │  │
                                                    endNight ───────┘  │
                                                          ▼            │
                                                       summary ◀───────┘
                                                          │
                                                       ended (TTL janitor: deleteAll)
```

`lobby → game → reveal → interstitial → rematch/next → end-of-night`, driven entirely by `RoomMeta.status`. At every `roundOver` the shell, in the same DO turn (persist-before-broadcast, replay-safe), computes the **placement vector** from `gameOver.scores`, awards **session XP**, updates **streaks**, and appends a **Night-log row**.

### 2.2 Placement-based XP (the heart)

Each game keeps its internal scale (a perform-judge puppet win is ~300–600 internal points; a tracer win is ~7). The shell maps `scores` → dense-ranked placement and awards XP off **one fixed table**: `XP = round(40 + 60 × topShare)` + winner/big-room/podium bonuses, scaled by a capped streak multiplier (≤1.25×). **Everyone who plays gets ≥40 XP** (participation floor); **no negative XP ever** (the punishment is the roast, not the number); a single high-scale game can never dominate the cross-game leaderboard. All constants are remote-config.

### 2.3 The Night arc

Warmup (matches 1–2, full celebration, match-1→2 ad suppressed) → Peak (3–6, live streaks + running leaderboard) → Wind-down nudge (after match 6, soft "last one?") → Wrap (after match 8 soft cap, or host "End night," or 45-min TTL) → **Oracle of the Night**: the session-XP leader is crowned, 4–6 **superlatives** are handed out in the deadpan-ironic voice ("The Comeback," "The Anchor," "Free Fall," "Unbreakable"), and group stats are shown. The summary renders to a **client-side shareable image** — device-local nicknames + the night's roast only, no `playerId`, no room code, no server reference. Group identity is room-scoped and dies with the room.

---

## 3. The game catalog

### 3.1 The 18 shipped tiles (meta-07 §3.1)

"18 tiles" = the 17 shipped wave-2 configs + the zero-cost `who-s-most-likely` tracer tile (P0), counting the truth-or-dare lover sibling as 8b. Each links to its `games/<id>.md`.

| # | Config id | Name (FR / EN) | Category | Template (module) | Players | Spicy | Session | Physical | Doc |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `who-s-most-likely` | Qui de vous… / Most Likely To | party | VOTE@1 (`tracer`) | 2–16 | 0 | ~3 min (7×) | seated | (pack-only P0; rides `pires-potes`) |
| 2 | `pires-potes` | Pires Potes / Worst Mates | party | VOTE@1 (`tracer`) | 3–16 | 0/1 (18+ flagship + soft) | ~3 min (7×) | seated | [games/pires-potes.md](games/pires-potes.md) |
| 3 | `tu-preferes` | Tu Préfères ? / Would You Rather | party | VOTE@2 (`option-vote`) | 3–16 | 0 | ~4 min (8×) | seated | [games/tu-preferes.md](games/tu-preferes.md) |
| 4 | `gauche-ou-droite` | De gauche ou de droite ? / Left- or Right-Coded? | party | VOTE@2 (`option-vote`) | 3–16 | 0 | ~7 min (7×+debate) | seated | [games/gauche-ou-droite.md](games/gauche-ou-droite.md) |
| 5 | `quizz-culture-ge` | Au Pif ! / Ballpark! | trivia | INPUT_GUESS `closest-number` | 2–16 | 0 | ~4 min (8×) | seated | [games/quizz-culture-ge.md](games/quizz-culture-ge.md) |
| 6 | `cinquante-cinquante` | Cinquante-Cinquante / Fifty-Fifty | trivia/party | INPUT_GUESS `crowd-target` | 2–16 | 0 | ~4 min (7×) | seated | [games/cinquante-cinquante.md](games/cinquante-cinquante.md) |
| 7 | `double-jeu` | Double Jeu / Double Agent | deduction | SECRET_ROLE `accusation` | 4–16 | 0 | ~12 min (3 matches) | seated | [games/double-jeu.md](games/double-jeu.md) |
| 8 | `truth-or-dare-2` (fun) | Action ou Vérité — Fun / Truth or Dare — Fun | party/spicy | TRUTH_DARE | 2–16 | 0/1 | ~5 min (3 laps) | mixed | [games/truth-or-dare-2.md](games/truth-or-dare-2.md) |
| 8b | `truth-or-dare-lover` | …Lover | spicy | TRUTH_DARE | 2–8 | 2 (18+) | ~6 min (4 laps) | mixed | [games/truth-or-dare-2.md](games/truth-or-dare-2.md) |
| 9 | `truth-or-drink` | Vérité ou tu bois / Truth or Drink | spicy | TRUTH_DARE@2 `forfeit-draw` | 2–16 | 2 (18+) + safe sibling | ~5 min (2 laps) | seated | [games/truth-or-drink.md](games/truth-or-drink.md) |
| 10 | `devine-l-action` | Devine l'Action / Guess the Action | performance | PERFORM_JUDGE `guided` | 3–16 | 0 | ~5 min (2 laps) | standup | [games/devine-l-action.md](games/devine-l-action.md) |
| 11 | `jeu-de-la-note` | La Note / On a Scale | party | SPOTLIGHT_GUESS `scale` | 3–16 | 0 | ~5 min (8×) | seated | [games/jeu-de-la-note.md](games/jeu-de-la-note.md) |
| 12 | `devine-la-question` | Devine la Question / Guess the Question | trivia/party | SPOTLIGHT_GUESS `reverse-question` | 3–16 | 0 | ~5 min (6×) | seated | [games/devine-la-question.md](games/devine-la-question.md) |
| 13 | `double-le-mouvement` | Double le Mouvement / Dub the Move | performance | PERFORM_JUDGE `rate` (crew 2) | 4–16 | 0 | ~4 min (1 lap) | standup | [games/double-le-mouvement.md](games/double-le-mouvement.md) |
| 14 | `mime-inverse` | Mime Inversé / Reverse Mime | performance | PERFORM_JUDGE `puppet` | 3–16 | 0 | ~4 min (1 lap) | mixed | [games/mime-inverse.md](games/mime-inverse.md) |
| 15 | `jeu-du-theme` | Le Jeu du Thème / Last Word Standing | party | LAST_STANDING | 3–16 | 0 | ~9 min (3 manches) | mixed | [games/jeu-du-theme.md](games/jeu-du-theme.md) |
| 16 | `devine-l-objet` | Devine l'Objet / Guess the Object | performance | PERFORM_JUDGE `credit` | 3–16 | 0 | ~5 min (2 laps) | mixed | [games/devine-l-objet.md](games/devine-l-objet.md) |
| 17 | `trouvez-la-regle` | Trouvez la Règle / Find the Rule | deduction | RULE_HUNT | 4–16 | 0 | ~14 min (3 rounds) | mixed | [games/trouvez-la-regle.md](games/trouvez-la-regle.md) |
| 18 | `loup-garou` | Loup-Garou / Werewolf | deduction | NIGHT_DAY | 5–16 | 0 | ~10–15 min/match | seated | [games/loup-garou.md](games/loup-garou.md) |

Category roll-up: **party 6 · performance 4 · deduction 4 · trivia 3 · spicy 3** (spicy is a tone shelf orthogonal to mechanic category).

### 3.2 The 3 new brand-book modes (meta-06) — config on shipped modules, the next content wave

| Mode | id | Template | New code | Players | Spicy |
|---|---|---|---|---|---|
| **Courtroom** | `le-tribunal` | VOTE@2 `majority-herd` + debate (`option-vote`) | **none** (config) | 3–16 | 0 only |
| **Red Flag / Green Flag** | `red-flag-green-flag` | VOTE@2 `predict-majority` + debate (`option-vote`) | **none** (config) | 3–16 | 0 (+ deferred spicy-1) |
| **Who Said That?** | `qui-a-dit-ca` | VOTE@2 `attribution` (`option-vote` + 1 additive branch) | **1 small param** | 4–16 | 0 (+ deferred spicy-1) |

Net new modules: 0. Net new param branches: 1. See [meta-06](meta-06-new-modes-brand-book.md).

### 3.3 The roadmap of unbuilt originals (meta-07 §2)

| Original | Verdict | Built on | Cost | New module? |
|---|---|---|---|---|
| `the-impostor` (canonical Impostor flagship) | **Roadmap v2** | `secret-role` `elimination`/`clue` config + word-pair pack | ~2–3 days | No |
| `npc-infiltrator` (NPC Infiltrator) | **Roadmap v2** | `secret-role` `secretKind:'directive'` param + pack | ~2–3 days | No |
| `hot-seat` | **Roadmap v2** | `spotlight-guess` `predict-subject` mode (standalone HOT_SEAT module **cut**) | ~3–4 days | No (re-homed) |
| `rank-friends` | **Roadmap v2** | **new `RANKING` module** (the last code gap) | ~1 week | **Yes** |
| `guess-my-rank` | **Roadmap v2** | `RANKING` basic Borda (config) → `RANKING@2` perception-gap fast-follow | config / ~3–4 days | No / param |
| `Name 3 in 5s` / blitz | **Roadmap v2** | `perform-judge` `blitz` config + `promptVisibility:'all'` branch | ~1–2 days | No |
| Pass the Bloop (option-reveal) | **Roadmap v1.x** | `option-vote` `revealStyle:'flip-one-by-one'` | 0–1 day | No |

There is **no game on any roadmap that requires an 11th module beyond `RANKING`.**

---

## 4. The template architecture (the 10 shipped modules)

Ten `GameModule` packages under `packages/games/*` (meta-07 §1). The vision's "5 templates" and the template-architecture doc's "6" were both honest *pre-wave-2* counts; wave-2 added the five consolidated performance/deduction modules. Each module front-loads the reducer cost so its family of future tiles is config-only.

| # | Template (archetype) | Package | Serves today | Unlocks for free (config + pack) |
|---|---|---|---|---|
| 1 | **VOTE@1** | `tracer` | (runtime engine for `pires-potes`) | `who-s-most-likely` classic, any single-vote designation pack, Pass-the-Bloop-lite |
| 2 | **VOTE@2** | `option-vote` | `tu-preferes`, `gauche-ou-droite` | Courtroom, Red/Green Flag, Who Said That?, Pass the Bloop, the whole binary/option-judgment family |
| 3 | **INPUT_GUESS** | `input-guess` | `quizz-culture-ge`, `cinquante-cinquante` | "Juste Prix" (`bustIfOver`), themed trivia packs, future `fool`/`freestyle`/`collab-*` text modes |
| 4 | **SECRET_ROLE** | `secret-role` | `double-jeu` | canonical Impostor flagship, NPC Infiltrator, Undercover reskins |
| 5 | **TRUTH_DARE** | `truth-dare` (@2) | `truth-or-dare-2` (fun+lover), `truth-or-drink` (+forfeit) | any tone/age/theme ToD pack, never-have-I-ever escape variants |
| 6 | **SPOTLIGHT_GUESS** | `spotlight-guess` | `jeu-de-la-note` (+`la-roue` rider), `devine-la-question` | hot-seat (`predict-subject`), themed scales, sprint configs |
| 7 | **PERFORM_JUDGE** | `perform-judge` | `devine-l-action`, `devine-l-objet`, `mime-inverse`, `double-le-mouvement` | blitz/"Name 3 in 5s", charades/emotions/jobs/songs/air-band packs |
| 8 | **LAST_STANDING** | `last-standing` | `jeu-du-theme` | 18+ theme packs, category-survival reskins |
| 9 | **RULE_HUNT** | `rule-hunt` | `trouvez-la-regle` | rule-deck packs (gesture/verbal/social), difficulty-tiered configs |
| 10 | **NIGHT_DAY** | `night-day` | `loup-garou` | mafia / vampire / space-crew reskins (role-card + narration packs) |

**Consolidation receipts (meta-07 §1.2):** PERFORM_JUDGE absorbed PERFORM_RATE + TIMED_VERDICT + PERFORM_GUESS (4 games, 3 resolvers behind `mode`/`promptVisibility`/`adjudication`); SPOTLIGHT_GUESS absorbed SCALE_GUESS + REVERSE_GUESS; LAST_STANDING / RULE_HUNT / NIGHT_DAY each kept a distinct outer machine no other module shares. The one engine contract amendment in the whole corpus is **`phaseKey(state): string`** (cross-game-synthesis §2 A1); everything else lives in the shared `@bloop/engine` kit (`emptyPlayerMap`, `Presence`/`connectedPlayers`, `allActed`, `nextActiveSeat`, `tally`, `gameOver`, `normalizeText`). The only named-but-unbuilt module in the entire corpus is **`RANKING`** (§3.3).

**Version-axis discipline (meta-07 §1.4):** `GameModule.version` (code), param-generation `@N` (the colloquial "VOTE@2" — params, *not* code version; only `truth-dare` ships at `version:2`), and `ContentPack.version` (content) are three independent integers. A config always pins the `templateVersion` range and the `contentPackRef.version`.

---

## 5. Content & voice

### 5.1 The offline-AI content pipeline (meta-05)

The inviolable rule: **runtime is deterministic, replay-driven, seeded-RNG-only, no wall clock, no AI** — so every value a reducer scores against must already be a literal in the pack JSON at `init`. The pipeline manufactures those literals offline. A strict **6-stage funnel**: AUTHOR (bilingual master) → AI-ASSIST/PRECOMPUTE (per locale) → LINT (auto, blocking) → HUMAN-QA (the voice guide is the law) → BUILD (split + pin) → PUBLISH (R2 immutable + KV pin + flag). A pack goes `enabled:true` only after all six pass and a human signs the flag flip (the last step).

**7 of 18 games precompute AI values** (a reducer scores against them): `cinquante-cinquante` (crowd %, P0), `quizz-culture-ge` (verified numeric answer + funFact, P0), `double-jeu` (pair closeness), `jeu-du-theme` (per-letter feasibility), `devine-la-question` (decoy/hint cross-plausibility), `trouvez-la-regle` (7 decoy rules), `devine-l-action` (action×channel pre-pairing). `gauche-ou-droite` is no-precompute at launch, `crowdPct` in v2. The other 10 are authoring-only. **FR and EN are separate pack ids forever**, every AI value re-estimated per locale (transcreate, never translate). `ContentPack.version` is monotonic and immutable per R2 object; the inline→R2 migration is a drop-in behind the same registry key, triggered at the ~1.8 MiB inline budget. Trend-decaying packs refresh **monthly** as pure Cadence-B (new version + re-pin, no deploy).

### 5.2 The voice / edge system

Editorial law lives in **`docs/designs/2026-06-12-content-voice-guide.md`** ("Sah, on arrête le contenu de daron"). The north star: *Bloop is not the comedian, Bloop is the instigator.* Every line must **expose someone in the room, force an indefensible choice, or start a 30-second argument**. The three lint questions: (1) a concrete detail not a category ("le McFlurry à la main", not "en retard"); (2) somebody in the room is the target or the evidence; (3) the table could argue about it for 30 seconds. Register carries the voice (FR elisions, EN lowercase texting; hybrid grammar « elle m'a ghost »), not slang nouns (≤1 slang token per line from the ALIVE lists). Irony is the default reading — the app never hypes, it roasts itself affectionately. Each game carries a per-game tone note (e.g. `loup-garou` is the one game with **no** roast/slang register — atmosphere only).

### 5.3 The spicy / age-gate system (meta-03)

One uniform **3-tier rating model**: `spicy 0` (safe/clean-hands), `spicy 1` (taboo-adjacent, screenshot-clean — opt-in toggle, **not** age-gated), `spicy 2` (18+ explicit, `tone:'spicy' ⇒ minAge ≥ 18`, schema-enforced). The 18+ surface is **always a separate sibling `game_config` + separate pack ids** — never a tier toggle inside a family-safe tile; the reducer is byte-untouched (the only ever code add across all designs is `tu-preferes`'s ~0.5-day `publicPicks:false` view-redaction flip). Of the 18 families, **9 warrant an 18+ sibling** (4 launch/launch-adjacent: `pires-potes` flagship, `truth-or-dare-lover`, `truth-or-drink`, `devine-l-action-spicy`; 5 deferred), **2 get a tier-1 age-bump** (`trouvez-la-regle-spicy` minAge 17, `devine-la-question-spicy` no-gate), **7 are correctly spicy-0-forever**.

Age-gating under anonymous-forever = **self-attestation + a per-device flag**; the server never stores age (it only rechecks `enabled`/region at `startGame`, defense-in-depth). The **HARD FLOOR** is a blocking offline lint at every tier: no protected-trait punching, no real private individuals (celebrities only as non-sexual/non-criminal absurd yardsticks; **no real politicians ever**), nothing sexual near minors, no incitement, punch at behaviours not identities, assault never played straight. Alcohol gets a sub-floor (one-sip phrasing only, answering always available, never auto-assign a drink, always-on water/no-driving footer, region-suppressible). The sexual ceiling is `spicy 2` ("suggestive, partner-directed, room-judgeable"); **no `spicy 3` exists or is planned**. The **long-press report** flow (content-keyed, never identity) and the **two-level KV kill-switch** (whole-tile `enabled:false` + per-card `blocklist`, both deploy-free, replay-safe) are the universal remediation.

---

## 6. Monetisation (meta-02)

**Ads-only, store-compliant, anonymous.** Exactly **two ad touchpoints**, both client-side:

- **Between-games interstitial** (passive): an AdMob interstitial wrapped in Bloop chrome, fired off the `phaseKey` transition into a terminal key — never a reducer effect, never mid-gameplay. **Skippable after 5s** (our own countdown over the ad). **Frequency cap:** ≥2 completed games AND ≥4 minutes since last, hard floor 90s, max 8/session, **no interstitial before the 2nd game-over of a device's first session ever**. All counters are device-local and anonymous; all numbers are remote-config. No-fill / consent-declined / timeout auto-advances within ≤2.5s. AdMob runs **behind the UMP consent flow**, **non-personalised ads by default**, no PII, no publisher user id, no targeting signals.
- **Rewarded-video spicy unlock** (active, user-initiated): watch one rewarded ad → unlock one spicy pack for the session/device. It **never bypasses the 18+ age gate** (age-attested → rewarded OR night-pass → play).

**£1.99 Night Pass**: a non-consumable, device-scoped, no-account IAP (restore via the store's native flow) that **removes all interstitials for the device** and **unlocks all spicy packs** without per-session rewarded gating (age gate still applies). It is a remove-ads + unlock pass, **not a subscription** and **not pay-to-win** — it buys no XP or placement edge. Compliance posture: rate the binary for the 18+ tier present, `tagForChildDirectedTreatment=false`, `maxAdContentRating=PG` always, single binary with on-device gating.

---

## 7. Host, social & accessibility (meta-04)

**Host controls.** The host is a **roster flag** on the authoritative RoomDO, not a special client (host migration reassigns to the longest-connected player; the meta-loop is unaffected). The host owns flow control (pick next, start, rematch/next/end-night) and **kick** (capability-gated, confirm-modal long-press, between-matches only, room-scoped hash block — never a cross-room ban). The host does **not** get bonus XP. Room settings are deliberately tiny: room lock, locale, and the game-settings card.

**The `hostTunable` allowlist** is a fourth `gameConfigSchema` field defaulting to `[]` (fully fixed). A param is host-adjustable only if the config lists it with a safe range the host **cannot exceed** (the server clamps; the host requests, the server adjudicates, the reducer trusts). The 18 games' raw knobs consolidate to **three launch axes** — **`roundCount`**, **`intensity`** (within the tile's legal ceiling — never crosses the age gate), **`debateLength`** — plus an optional **`pace`** axis (per-game opt-in for timer-feel games). Presented as a collapsible 2–4-row "Game settings" card, defaults pre-selected.

**Social / virality.** The room-code + QR (deep link `bloop://join/ABCD` + web fallback `bloop.app/j/ABCD`) is the top of the funnel — no referral code, no attribution (anonymous). The **"inspired by {creator}"** credit chip is a discovery hook and rights-compliant by construction (thumbnail + credit + link-out only, honoring each entry's `rightsNote`; KV-suppressible). The **shareable result card** is the organic growth engine and **ships at launch** (this domain overrides meta-01's fast-follow stance): a client-side image of the night's superlatives + a join-nudge, with **zero server/anonymity risk**.

**Accessibility** is a hard launch gate, not aspiration: **WCAG-AA** contrast via a fixed `onColor()` safe-pairing table + CI lint (Ink-on-bright is the brand default; white-on-Coral *fails* at 2.73:1 and is banned; Cobalt is large-text-only at 3.67:1); **44pt** minimum touch targets; **reduced-motion** collapses springs to a 120ms fade and suppresses confetti; dynamic-type with clamps on tight chrome; **colour-independent state everywhere** (vote sides, host, "you", timer urgency, truth/dare, red/green-flag all carry a label/icon/shape, never colour alone — critical for ~8% red/green colour-blind play); screen-reader labels; the spicy age-gate and long-press report are the two brand-mandated a11y affordances.

---

## 8. The MASTER DECISIONS LOG

This is the centrepiece — every former "defer / v2 / open-question / spicy / TBD" across all 18 games and all 7 meta docs, each with its **FINAL ruling** (Ship v1 / Roadmap vN / Cut) and a one-line why. It is the proof the design is finished. **295 decisions resolved** (some rows consolidate multiple former items, e.g. TK16 folds three cuts). Genuinely-open *product* calls that still need a human are **not** counted here — they live in §9.4.

Ruling legend: **S1** = Ship v1 · **R1.x / R2 / R3** = Roadmap version · **C** = Cut.

### 8.1 Engine / contract & shared-kit (cross-game-synthesis)

| # | Item | Ruling | Why |
|---|---|---|---|
| E1 | `phaseKey(state):string` contract method | **S1 (additive)** | The only contract amendment; shell can't generically detect transitions otherwise. tracer updated same-change. |
| E2 | `emptyPlayerMap`, `Presence`/`connectedPlayers`, `allActed`, `nextActiveSeat`, `tally`, `gameOver`, `normalizeText` | **S1 (shared kit)** | Build once in `@bloop/engine`; the four wave-1 docs re-derived all of them. |
| E3 | `Effect: adSlot` for mid-session ads | **C** | Ads are 100% client-side off `phaseKey`; no effect type needed. |
| E4 | multi-timer primitive (impostor) | **C** | `phaseDurationMs` + per-turn `phaseKey` already express it. |
| E5 | engine-level disconnect/eviction | **C** | Reducer logic on existing `playerLeft`/`playerRejoined`. |
| E6 | new effect for ToD ad cue | **C** | Reuse `analytics`; the ad fires off `phaseKey`. |
| E7 | phaseKey-from-view as a contract hedge | **C (fallback note only)** | Ship `phaseKey`; never design the shell around two key sources. |
| E8 | nickname/`subjectId` engine need | **C (convention)** | Engine never sees nicknames; client substitutes. |
| E9 | `hotSeatAnswer` null "refinement" | **C (game-local view type)** | Not a shared-contract change. |
| E10 | atomic hidden→view promotion | **C (already in spec §6)** | Nothing to add. |
| E11 | new events for join/reconnect/skip-reveal | **C** | Game-local actions or out of scope; roster is fixed at `init`. |
| E12 | presence field-name split (`connected`/`disconnected`/`left`) | **S1** | Standardise on `connected: Presence`. |
| E13 | ad-cue analytics name split (`round_revealed` vs `round_completed`) | **S1** | Distinct meanings; ad fires off `phaseKey`, analytics for PostHog only. |
| E14 | pack locale field split (`lang`/`data.lang`/`data.locale`) | **S1** | `data.locale`, required, single-locale packs. |
| E15 | impostor blank-mode `leakedSecrets` empty-string crash | **S1 (doc/test fix)** | Omit the empty `impostorWord` from the audited secrets. |
| E16 | build order (rank → hot-seat → ToD → impostor) | **S1** | Reuse-gradient + demo value; impostor's redaction lands on proven rails. |

### 8.2 Per-game resolved decisions

**`who-s-most-likely` / `pires-potes` (tracer / VOTE@1)**

| # | Item | Ruling | Why |
|---|---|---|---|
| PP1 | name vs "Amis de merde" trademark | **S1: "Pires Potes" / "Worst Mates"** | Lexically distant; alliterative; alternates archived. |
| PP2 | win condition (original "first to 5") | **S1: fixed 7 rounds**; classic `targetScore` **R2** | First-to-N unbounded in big rooms; fixed 7 ≈ 3 min. |
| PP3 | rotating card-drawer turn | **C** | Simultaneous vote is faster and never stalls. |
| PP4 | max-vote tie | **S1: all tied +1, no revote** | Deterministic; drama is *who*, not tiebreak. |
| PP5 | reveal style | **S1: instant**; `flip-one-by-one` **R2** | Keeps rounds <30s; flip is a config A/B. |
| PP6 | edgy tone vs age gating | **S1: two siblings** (`pires-potes` 18+ flagship + `pires-potes-soft`) | Schema forces spicy⇒minAge≥18; standard tiering. |
| PP7 | `voteMs`/`revealMs` not in `templateParamsSchema(VOTE)` | **R2** (grow schema) | Module already reads them; schema growth only unlocks host-tuning. |
| PP8 | pack sizing / authoring | **S1: 210 cards** | ~30 rematches before repeats; AI drafting behind the gate. |
| PP9 | copyright / trade-dress | **S1: zero text reuse + similarity audit** | Mechanic unprotectable; texts/name are — audit is content-ops. |
| PP10 | pile-on / bullying | **S1: comedic-win framing + funny-never-cruel lint + kill switch** | Behaviour/choices only, never identity/appearance/trauma. |
| PP11 | small-room ties | **S1: accept inflation, celebrate co-winners** | Acceptable; crown copy supports co-Pires-Potes. |
| PP12 | all-timeout round | **S1: client "nobody voted" beat** | Engine advances correctly; UI must explain. |
| PP13 | transcreate vs translate | **S1: transcreated** | Literal EN of FR jokes falls flat. |
| PP14 | `who-s-most-likely` tile on tracer | **S1 (P0, pack-only)** | tracer is a module with no tile; ship the classic VOTE@1 flagship. |
| PP15 | "predict the verdict" sub-bet | **R3 (evaluate)** | Changes phase shape; only if metrics want a second beat. |
| PP16 | themed packs (festival/couples/colleagues) | **R2 (content-only)** | Tag-curated subsets, one KV row each. |
| PP17 | remote/online rooms | **R2 (platform)** | Same reducer, zero realtime change. |

**`tu-preferes` (VOTE@2)**

| # | Item | Ruling | Why |
|---|---|---|---|
| TP1 | scoring model | **S1: predict-majority** | Only model where honesty is dominant + a real skill axis; conformity/minority/contrarian variants rejected. |
| TP2 | tie handling | **S1: nobody scores + "PERFECT SPLIT" banner** | Converts the dead-end into the loudest moment. |
| TP3 | public/anonymous picks | **S1: public with names** | Debate needs names; anonymity reserved for the spicy sibling. |
| TP4 | zero-code on VOTE | **S1: VOTE@2 generalization shipped** | Every variant now pure Cadence B. |
| TP5 | one phase or split pick/predict | **S1: one atomic `{pick,predict}`, two-tap** | Single buffer, no phaseKey churn. |
| TP6 | minPlayers | **S1: 3** | At 2, disagreement is always a tie. |
| TP7 | streaks / multipliers | **R2 (param-gated, off)** | Adds reducer state beyond quick-win scope. |
| TP8 | spicy sibling | **R1.x: `tu-preferes-spicy`** (`publicPicks:false`) | ~0.5-day anon-reveal flip, then Cadence B. |
| TP9 | extend-debate relief valve | **S1: lobby-tunable `revealMs`** | Reveal is the debate window; `debateMs` stays 0. |
| TP10 | final-score tiebreaker | **C** | Placement→XP resolves ties; sudden-death is unneeded scope. |
| TP11 | host-tunable round count | **S1: lobby `totalRounds`** | `init` already caps it. |
| TP12 | "contrarian oracle" / live debate phase | **C** | Perverse incentive / phaseKey churn for no gain. |
| TP13 | themed seasonal packs | **R1.x (Cadence B)** | New R2 packs, no deploy. |

**`gauche-ou-droite` (VOTE@2)**

| # | Item | Ruling | Why |
|---|---|---|---|
| GD1 | vote scoring | **S1: herd, majority +1, tie 0** | "Read the room"; no ground-truth answer. |
| GD2 | public votes | **S1: public** | "WHO voted that?!" is the game. |
| GD3 | debate end without blocking | **S1: 35s deadline + skip-quorum over connected set** | Disconnected excluded both sides. |
| GD4 | VOTE extension | **S1: VOTE@2 `majority-herd`** | One module, two configs. |
| GD5 | EN cultural adaptation | **S1: EN-native axis + item set** | "Left-coded/Right-coded"; staged rollout. |
| GD6 | "what the internet thinks" % | **R2 (likely C)** | Adds factual/freshness risk the loop doesn't need. |
| GD7 | spicy tier | **C at launch; R2 sibling** | Sex is orthogonal to the class-coded joke. |
| GD8 | even-room ties | **S1: run as joke; `tiePolicy` param if >~30%** | Don't change the core rule. |
| GD9 | `anonymousVotes` param | **C (reserved for future spicy sibling)** | Not in the shipped config. |
| GD10 | debate dead-air / 35s | **S1: 35s + starter + skip; promote `debateMs` to host allowlist** | Relief valve via host tuning. |
| GD11 | trend decay (e-scooters) | **S1 content-ops: monthly KV refresh** | No deploy. |
| GD12 | political drift | **S1: hard editorial gate** | Objects/foods/behaviours only — never parties/politicians. |
| GD13 | streaks | **R3 (low; likely C)** | `tiePolicy` is the cleaner fix. |
| GD14 | EN meme-transfer risk | **S1: staged rollout + non-political fallback axis** | Containment; "Boomer/Gen-Z-coded" config-only. |

**`quizz-culture-ge` (INPUT_GUESS `closest-number`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| QZ1 | which twist | **S1: Twist A "closest wins"** | Removes trivia's party flaw, zero moderation, deterministic. |
| QZ2 | Twist B Fibbage `fool` | **R2** | Heaviest free-text surface; gated on hardened moderation. |
| QZ3 | Twist C hivemind-trap MCQ | **C (R3 pack flavor only)** | Weakest differentiation; no new mechanic. |
| QZ4 | new template? | **S1: 3rd mode of INPUT_GUESS, built first** | New-params, not a template; de-risks the skeleton. |
| QZ5 | scoring / anti-runaway | **S1: [100,50,25] + 50 exact + ×2 finale** | Swingy at any count; trailers stay alive. |
| QZ6 | `bustIfOver` | **S1 false; R2 "Juste Prix" sibling** | Param + path exist; brutal for casuals at base. |
| QZ7 | original culture-gé at scale | **S1: offline pipeline** | Verified answer/source/verifiedAt + human fact-check gate. |
| QZ8 | troll inputs / huge ranges | **S1: `scale:'log'` + 9-digit clamp** | Renders + blocks mega-inputs. |
| QZ9 | tie/precision edges | **S1: frozen in reducer tests** | Integers, competition ranking, exact=d===0. |
| QZ10 | strong-estimator runaway | **S1: flat payout + ×2 finale; data-gate rollout** | Math, not redesign. |
| QZ11 | FR/EN funFact parity | **S1: pipeline lint** | Natively-funny per locale. |
| QZ12 | host-tunable surface | **S1: rounds + reveal length, no spicy** | No spicy tier on this game. |

**`cinquante-cinquante` (INPUT_GUESS `crowd-target`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| CC1 | live-AI free-text scoring | **C (redesigned) → S1 pack-authored hand** | Runtime AI impossible; pre-scored 6-completion hand keeps all beats. |
| CC2 | where % come from | **S1: persona-ensemble + calibration + human gate** | The contested number IS the party moment. |
| CC3 | target distribution | **S1: authored per item + ⅓/⅓/⅓ lint** | Content-op, not code. |
| CC4 | new template? | **S1: 2nd mode of INPUT_GUESS** | Zero free text; easiest slice after closest-number. |
| CC5 | freestyle creativity | **R2 `freestyle` mode** | Blocked on hardened text moderation. |
| CC6 | ties/passive/disconnect | **S1: full points to tied; non-pickers 0; never auto-assign** | Funny-never-cruel; never block. |
| CC7 | same % FR/EN | **S1: No — re-estimate per locale** | Load-bearing pipeline requirement. |
| CC8 | spicy version | **R1.x `cinquante-cinquante-after-dark`** | Cadence B, zero code. |
| CC9 | `cardsPerRound` ceiling | **S1: 6; host-tunable down to 4** | Readability ceiling at 6, never up. |
| CC10 | bullseye / point curve | **S1: as configured (3/1/+2, window 2)** | No runaway over 7 rounds; revisit on telemetry. |

**`devine-la-question` (SPOTLIGHT_GUESS `reverse-question`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| DQ1 | hint source | **S1: app-driven pre-authored progressive hints** | Only deterministic form; creates the 300/200/100 ladder. |
| DQ2 | hint cadence | **S1: 20s/tier** | 90s breaks pacing; early-resolve → ~35–45s. |
| DQ3 | guess input | **S1: MCQ (1 real + 4 decoys)** | Free-text matching undecidable; decoys are the comedy. |
| DQ4 | lock semantics | **S1: lock-on-submit** | Editable picks collapse the ladder. |
| DQ5 | mystery player scoring | **S1: +75/correct guesser, no honesty enforcement** | Troll answers score 0; honesty is incentive-designed. |
| DQ6 | template | **S1: SPOTLIGHT_GUESS `reverse-question`** | Different state machine; consolidated with jeu-de-la-note. |
| DQ7 | offline AI output | **S1: decoys + hints + cross-plausibility, per locale** | AI offline only. |
| DQ8 | "sprint" 2-tier mode | **R2 (config-only)** | Pure `game_config`; ship on big-room drag. |
| DQ9 | spicy pack | **R2 (spicy-1, no gate)** | Content op, not deploy. |
| DQ10 | themed packs | **R2 (Cadence B)** | New pack ids on the shipped module. |
| DQ11 | decoy quality | **S1: cross-plausibility scoring + 5% gate** | IS the difficulty curve. |
| DQ12 | redaction leak risk | **S1: shipped mitigations + leakedSecrets audit** | Field-level view tests. |
| DQ13 | answerer no-show void | **S1: accept, monitor; 20s host-tunable** | Correct for never-block. |
| DQ14 | tier-camping | **S1: `tierPoints` tunable** | Retune without deploy. |
| DQ15 | mystery-player trolling | **S1 soft-mitigated; R3 candidate** | Reader points punish trolls. |
| DQ16 | bilingual cross-plausibility | **S1: per-locale gate (doubled)** | Transcreate, not translate. |
| DQ17 | ambiguity vs honesty corridor | **S1: 40+ vetted-item bar (v1 ships 30)** | Close the gap before broad launch. |

**`jeu-de-la-note` (SPOTLIGHT_GUESS `scale`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| JN1 | which scale variant | **S1: scale10**; wheel100=rider | Labeled anchors most legible first-play. |
| JN2 | `la-roue` wheel100 rider | **R1.1 (config-only, ~0 code)** | Reducer/bands/dial/50 items ship; only the tile + pack missing. |
| JN3 | bilingual→single-locale split | **R1.1 (with locale picker)** | Loader optimization, not correctness. |
| JN4 | players ask questions w/o typed text | **S1: timer-boxed verbal `talk` + early-end** | Zero moderation, zero stall. |
| JN5 | closest-wins scoring | **S1: bands, spotlight=lower-median, top-band ties** | Deterministic integer math, capped 4/round. |
| JN6 | speaker guesses/types | **S1: never** | Self-guess degenerate; typing opens moderation. |
| JN7 | wheel continuous/discrete | **S1: integer 0..100, snap-5 + haptics** | JSON-safe, replay-deterministic. |
| JN8 | reuse HOT_SEAT/INPUT_GUESS | **C — kept new SPOTLIGHT_GUESS** | Dial + per-round secret + bands needed a new reducer. |
| JN9 | round count | **S1: 8, host-tunable 4–12** | TikTok pacing. |
| JN10 | talk-phase drag | **S1: 45s cap + early-end, gate at 5% rollout** | Structural mitigation. |
| JN11 | 3-player coarse score | **S1: accept** | Lower-median = better guess at 2 guessers. |
| JN12 | spicy / 18+ tier | **C — no sibling** | Talk beat is already whatever the room says. |
| JN13 | "sprint" / themed scales | **R2 (config + pack)** | Pure Cadence B. |

**`devine-l-action` (PERFORM_JUDGE `guided`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| DA1 | help-channel mechanism | **S1: pre-paired constraint card, 5 channels** | Guarantees feasible + funny; deterministic. |
| DA2 | adjudication w/o AI/mic | **S1: group verdict ≥0.5, ties→success** | Deterministic; peer judgment is a party beat. |
| DA3 | template | **S1: PERFORM_JUDGE `guided`** (TRUTH_DARE@2 path **C**) | Conditional visibility belongs on PERFORM_JUDGE's axis. |
| DA4 | session length | **S1: laps 2, passes 1; lap auto-scale→host-tunable** | TikTok-native ~75s beats. |
| DA5 | spicy content | **R1.x `devine-l-action-spicy` (18+)** | Physical dares escalate; age-gated config. |
| DA6 | difficulty knob | **S1 data-only; R2 host filter** | Dial exists for balance; runtime filter unproven. |
| DA7 | `props:true` filtering | **S1 data-only → R2 host toggle** | Most rooms have some objects. |
| DA8 | themed PERFORM_JUDGE packs | **R2+ (pure content)** | Zero code post-module. |

**`mime-inverse` (PERFORM_JUDGE `puppet`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| MI1 | adjudication | **S1: peer-tap, two beats** | Enum-only, IRL-native; MCQ rejected. |
| MI2 | command window | **S1: 30s, catalog-tunable 20–45** | Not lobby-exposed. |
| MI3 | scoring | **S1: collective (puppet 100/+50, commanders 50)** | Rewards good instructions, not false-positive taps. |
| MI4 | template | **S1: PERFORM_JUDGE `puppet`** (standalone TIMED_VERDICT **C**) | One module = four tiles. |
| MI5 | puppet hint / can't-perform | **S1: category hint on; seated legit; void on freeze** | Funny-never-cruel; never block. |
| MI6 | blitz / "Name 3 in 5s" | **R2: own config on PERFORM_JUDGE, not mime-inverse** | Public-prompt verdict is a different redaction axis. |
| MI7 | themed packs (emotions/jobs/songs/air-band) | **R2 (same module)** | Pure content. |
| MI8 | big-room pacing | **S1: catalog override `scoreboardEvery`** | `laps:1` already bounds length. |
| MI9 | FR/EN split + parity gate | **S1: publish-pipeline invariant** | Locale gate must not strand a language. |
| MI10 | redaction inversion | **S1: closed in code + tests** | Secret never reaches puppet/unknown viewers. |
| MI11 | verdict griefing | **S1: accept w/ structural mitigations** | Collective scoring removes the incentive. |
| MI12 | venue/physical constraints | **S1: authoring lint enforces safety** | No props/contact/running; seated legit. |
| MI13 | 18+ spicy pack | **R2 `mime-inverse-spicy`** | Mechanic identical; consent framing; launch without it. |
| MI14 | `claimBy:"judges"` param | **C (doesn't exist in shipped config)** | Superseded by `adjudication:'verdict'`. |

**`devine-l-objet` (PERFORM_JUDGE `credit`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| DO1 | pre-mime existence vote | **C as standalone → S1 as post-claim `judge` vote** | The 12s validation IS the repurposed idea; no dead beat. |
| DO2 | pack-driven vs performer-chosen objects | **S1: pack-driven** | Deterministic, zero free-text. |
| DO3 | actions enum-only | **S1** | No free text by schema. |
| DO4 | share template with devine-l-action | **S1: consolidated on PERFORM_JUDGE** | Two-module risk closed. |
| DO5 | difficulty multiplier | **C — flat 10/10** | Legible; placement XP makes inflation pointless. |
| DO6 | big-room pacing | **S1: host-tunable laps 1–2** | No hard maxPlayers cut. |
| DO7 | "describe" accessibility variant | **R2** | Reuses credit reducer + forbidden-words pack. |
| DO8 | redaction | **S1: `promptVisibility:'performer'`, audited** | No action outstanding. |
| DO9 | honor-system grief | **S1: threshold 0.5, ties→valid, monitor** | Claim only falls to a real `no` majority. |
| DO10 | converge module/schema | **S1: done** | Single schema backs all four. |
| DO11 | `hard` difficulty drawable | **S1: easy+medium only; R2 host "hard mode"** | Hard authored but parked. |
| DO12 | auto-scale laps at 10+ | **R2** | Manual host toggle covers v1. |

**`double-le-mouvement` (PERFORM_JUDGE `rate`, crew 2)**

| # | Item | Ruling | Why |
|---|---|---|---|
| DM1 | how the app prompts the mover | **S1: 2-option pick, auto-pick on timeout** | Agency without a stall. |
| DM2 | does the dubber see the prompt | **S1: never** | The mismatch is the comedy; halves redaction. |
| DM3 | scoring | **S1: hidden 1–5 stars, duo `round(avg×20)`, +25 unanimous, 3.0 default** | Cooperative; floor blunts AFK/trolling. |
| DM4 | when prompt is revealed | **S1: after stars lock** | Rate the comedy, not fidelity; second laugh. |
| DM5 | players/length | **S1: 4–16, sweet 4–10, laps 1** | At 3 the audience is one rater. |
| DM6 | audience also guesses prompt | **R2** | Typed guess adds moderation + breaks pacing. |
| DM7 | spicy content | **R (content-ops only)** | Separate age-gated pack via `allowedIntensities`. |
| DM8 | `crewSize` 1 vs 2 | **S1: 2** (solo = R3 separate tile) | Blind-dubber mismatch is the whole point. |
| DM9 | early-end perform | **S1: both tap Done** | Bail a dead bit early. |
| DM10 | disconnect handling | **S1 as built** | Never stalls; mirrors active-left convention. |
| DM11 | scoreboard beat | **C (`scoreboardEvery:0`)** | 1-lap co-op needs no standings interstitial. |

**`jeu-du-theme` (LAST_STANDING)**

| # | Item | Ruling | Why |
|---|---|---|---|
| JT1 | word typed or spoken | **S1: spoken** | Zero UGC; typing under 8s kills rhythm. |
| JT2 | who validates / ties | **S1: room jury, strict-majority reject, tie→valid** | Funny-never-cruel; first vote locked. |
| JT3 | eliminated players | **S1: join the jury** | Nobody idle; dilutes conflict-of-interest. |
| JT4 | letter draw feasibility | **S1: per-language pre-validated lists (≥15 words)** | Offline AI, deterministic gameplay. |
| JT5 | convergence | **S1: decaying shot clock + hard turn cap** | Belt-and-braces; no room hangs. |
| JT6 | repeated words | **C from engine — room polices** | Words are oral; the jury is the fun. |
| JT7 | template | **S1: new LAST_STANDING** ("absorb Name-3-in-5s" **superseded**) | Elimination loop + persistent prompt; Name-3 → PERFORM_JUDGE. |
| JT8 | minPlayers | **S1: 3** | At 2 the only juror is the rival. |
| JT9 | grudge-jury/kingmaking | **S1 as-is; R2 lever** | `deadPlayersJudge` is a config switch; decide from data. |
| JT10 | honor-system bluffing | **C any engine fix** | The vote IS the validation. |
| JT11 | long rounds at 12–16 | **S1: big-group config + cap default at 12** | Pure params. |
| JT12 | spoken words unmoderable | **S1: accept residual** | Lean on report/kick/block. |
| JT13 | `exampleWords` never reach client | **S1: stripped at publish + audited** | Would prime answers. |
| JT14 | spotlight disconnect | **S1: round-only elimination** | Avoids looking punitive. |
| JT15 | mono-locale split | **S1: publisher split with parity gate** | Both locales pass feasibility. |
| JT16 | scoring | **S1: +1/word, +3/survivor, 3 rounds** | Participation + battle-royale stakes. |
| JT17 | spicy content | **S1: spicy-0; R1.x `jeu-du-theme-18` sibling** | Platform spicy gating, zero code. |

**`trouvez-la-regle` (RULE_HUNT)**

| # | Item | Ruling | Why |
|---|---|---|---|
| TR1 | detective count | **S1: auto (1 for 4–7p, 2 for 8–16p), host-overridable** | Small rooms need normal followers; big rooms need two watchers. |
| TR2 | live-clock length | **S1: 180s, host 120–300** | ~4.5 min/round, TikTok pacing. |
| TR3 | judge "rule guessed" w/o AI | **S1: 8-candidate grid, index compare** | Free-text unfair; decoy grid instant + dramatic. |
| TR4 | infraction detection | **S1: follower self-policing, 1 token → tribunal** | The tribunal-as-clue loop is the tension. |
| TR5 | one broken rule loses round? | **S1: NO — softened** | Instant loss is rage-inducing. |
| TR6 | detectives vote in tribunals? | **S1: NO** | They don't know the rule → noise/grief. |
| TR7 | detective identity | **S1: public** | Hidden seekers collapse into SECRET_ROLE. |
| TR8 | bilingual → split | **S1: pipeline emits `-fr`/`-en`** | Loader stays locale-free. |
| TR9 | tribunal tie/zero votes | **S1: not guilty** | Funny-never-cruel; deterministic. |
| TR10 | guess deadline abuse | **S1: deadline = attempt spent** | Kills pause-stalling. |
| TR11 | `totalRounds` | **S1: 3, host 1–8** | ~13 min; 63-item pack has headroom. |
| TR12 | spicy tier | **S1: spicy-0; no 18+ sibling at launch** | Performance-comedy, not exposure; tier-1 `minAge 17` R2 optional. |
| TR13 | eliminated-player boredom | **S1: accept (short rounds); R2 ghost-vote** | ≤~3 min benched. |
| TR14 | accusation griefing | **S1: 1 token + tribunal + consolation** | Caps grief, non-punishing. |
| TR15 | honor-system core | **S1: accept as party trust** | Social/tribunal + copy is the mitigation. |
| TR16 | build sequencing | **S1: shipped on hardened kit, last** | Trickiest determinism; replay/clock-bank tests in place. |
| TR17 | host-tunable surface | **S1: `hostTunable: []` (fixed)** | Banked-clock determinism is delicate. |

**`double-jeu` (SECRET_ROLE `accusation`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| DJ1 | redaction (roles + two secret words) | **S1: per-viewer, audited** | The core engineering risk; behind the harness. |
| DJ2 | impostor word mode | **S1: as shipped** | — |
| DJ3 | accusation vs elimination | **S1: `accusation` mode** | The shipped double-jeu config. |
| DJ4 | pair closeness | **S1: offline-scored easy/medium/hard, per locale** | Calibration IS the game. |
| DJ5 | caught-impostor guess window | **R2** (`impostorGuessEnabled:false` ships) | Needs guess-input + text moderation. |
| DJ6 | media strategy | **S1 text-only; R2 image; R3 audio; C video** | Image = pre-rendered R2 pairs; video has no mechanic gain. |
| DJ7 | spicy tier | **C at launch** (axis kept live) | Odd-one-out paranoia has no intimacy axis. |
| DJ8 | `verdictMode:'tally-only'` | **R2 (param ready)** | Kills small-room vote-2 leak; ship on data. |
| DJ9 | elimination mode | **R (param exists)** | A separate config, not a double-jeu mode. |
| DJ10 | multi-impostor | **C** | Two odd-ones break the fantasy + redaction model. |
| DJ11 | canonical Impostor flagship as own tile | **R2** | `secret-role` config + `clue`/`elimination` branch (§3.3). |

**`truth-or-dare-2` (fun + lover) (TRUTH_DARE)**

| # | Item | Ruling | Why |
|---|---|---|---|
| TD1 | new game/template/pack | **S1: pack variants, zero new code** | Two sibling configs on `truth-dare`. |
| TD2 | one tile or two | **S1: two siblings (fun 13+ / lover 18+)** | One tile can't be family-safe and 18+. |
| TD3 | lover player range | **S1: 2–8 (couples)** | Keeps verdicts intimate. |
| TD4 | spicy tier mapping | **S1: fun soft+party, lover party+spicy** | 18+ entries physically out of the fun pack. |
| TD5 | lover pass economy/scoring | **S1: passes 3, scoring identical, not config-exposed** | Declining must feel cheap. |
| TD6 | sexual ceiling | **S1: suggestive/non-explicit, room-judgeable** | Verdict mechanic is the structural cap. |
| TD7 | tier pacing (lover opens highest) | **S1 as-is; R2 `tierProgression:'escalate'`** | Pre-scoped tiny branch, not a blocker. |
| TD8 | redaction | **S1: hidden verdict buffer, audited** | — |
| TD9 | self-attested age gate | **S1: lover ships `enabled:false` pending legal** | Residual is a legal sign-off gate, not code. |
| TD10 | store-compliance rating | **S1: verify before lover packs publish** | Fun tile unaffected. |
| TD11 | lover in non-couple room | **S1: accept + monitor (copy, cap, passes)** | No pairing concept in the engine. |
| TD12 | 2-player verdict feel | **S1 accepted; R3 advisory verdicts** | Empty voter set auto-resolves done. |
| TD13 | content drift | **S1: hard per-entry lint** | Blocks at the gate, not runtime. |
| TD14 | umbrella `spicyLevel` can't represent both | **S1: catalog reads per-config values** | FUN=1/13+, LOVER=2/18+. |
| TD15 | AI mush risk in lover register | **S1: human FR/EN naturalness sign-off** | Machine-translated flirting reads as creepy. |

**`truth-or-drink` (TRUTH_DARE@2 `forfeit-draw`)**

| # | Item | Ruling | Why |
|---|---|---|---|
| TK1 | truth-only + forfeit-draw escape | **S1** | `allowedChoices:['truth']` + `escapeMode:'forfeit-draw'`. |
| TK2 | reconciliation with truth-dare module | **S1: same module @2, three additive params** | Existing configs byte-untouched. |
| TK3 | room verdicts the drink? | **C — no** | Drink is visible; a vote is dead air. |
| TK4 | timeout/disconnect | **S1: dodged, 0 points, no forfeit drawn** | Never auto-assign alcohol to the absent. |
| TK5 | alcohol sub-floor | **S1: one-sip phrasing, footer, never forced** | Store compliance + safety. |
| TK6 | safe sibling | **S1: `truth-or-forfeit` (all-ages, default surface)** | Under-18 path. |
| TK7 | store-compliance (Apple 1.4.3) | **S1 ship-gated: `tone:'spicy'`/`minAge 18` + region flags** | Legal sign-off is the real gate. |
| TK8 | "not pure config" param need | **S1: done, params implemented + tested** | No longer a blocker. |
| TK9 | excessive-drinking liability | **S1 ship-gated: final legal sign-off checklist** | Mitigations in code/content. |
| TK10 | verdict griefing | **S1: ties→answered, unscored, counts-only; monitor** | No per-vote exposure to weaponize. |
| TK11 | 2-player single-judge | **S1 as-is; R2 advisory-only below 3** | Original is played in pairs. |
| TK12 | spoken answers unmoderated | **S1: authoring rule + accepted residual** | Inherently unmoderatable off-platform. |
| TK13 | pack exhaustion | **S1: sizing lint + graceful fall-down** | ≥32 truth + ≥16 forfeit/tier met. |
| TK14 | region-flagged suppression | **R2 (ship)** | Hides drink tile in stricter markets. |
| TK15 | couples deck variant | **R3** | New pack ids only, same module. |
| TK16 | host-tunable scoring / "double-or-nothing" / public per-vote reveal | **C (all three)** | Locked scoring keeps XP comparable; escalation violates the sub-floor; per-vote reveal weaponizes the verdict. |

### 8.3 Meta-layer & brand-book decisions

**Session & progression (meta-01)**

| # | Item | Ruling | Why |
|---|---|---|---|
| M1.1 | XP currency | **S1: placement-based, never raw points** | Scales stay comparable across games. |
| M1.2 | session unit | **S1: the "Night" (≤45-min TTL, soft 8-match arc)** | The evening is the memorable unit. |
| M1.3 | ad trigger | **S1: client-side off `phaseKey→over` only, capped** | `scoreboard:*` mid-match is gameplay, not a boundary. |
| M1.4 | group identity | **S1: room-scoped, anonymous, TTL-wiped** | No cross-room profile, ever. |
| M1.5 | streaks | **S1: session-scoped, placement-derived, capped 1.25×** | Comeback always live; never re-enter a reducer. |
| M1.6 | end-of-night | **S1: Oracle + superlatives + group stats** | Deadpan-ironic roast register. |
| M1.7 | host vs player | **S1: host = flow control, no XP advantage** | RoomDO is authoritative. |
| M1.8 | mid-session switching + late joiners + rematch | **S1: first-class, lossless, roster re-frozen** | Lives in `RoomMeta`/session tables. |
| M1.9 | "total laughs" reaction counter | **R2 (opt-in per-game signal)** | Don't add a cross-cutting mechanic for one stat line. |
| M1.10 | shareable summary image | **S1 (overridden by meta-04 to launch)** | The only out-of-network growth lever. |

**Monetisation (meta-02)**

| # | Item | Ruling | Why |
|---|---|---|---|
| M2.1 | ad surfaces | **S1: interstitial + rewarded only** | No banner/native/app-open/rewarded-interstitial. |
| M2.2 | skip-after-5s | **S1: own chrome + countdown** | AdMob isn't natively skippable. |
| M2.3 | frequency cap | **S1: ≥2 games & ≥4 min, floor 90s, max 8, first-session grace 2** | Intermission, not a treadmill; remote-config. |
| M2.4 | counters | **S1: device-local, anonymous** | Rooms are ephemeral. |
| M2.5 | AdMob + UMP + NPA default | **S1** | No PII, no user id; `canRequestAds=false` → ad-free. |
| M2.6 | rewarded spicy unlock | **S1: per-pack, per-session; never bypasses age gate** | Only place a rewarded format exists. |
| M2.7 | £1.99 Night Pass | **S1: device-scoped IAP, remove-ads + unlock-all, no account** | Not a subscription, not pay-to-win. |
| M2.8 | no-fill resilience | **S1: auto-advance ≤2.5s, preload** | Best-effort revenue, never a blocker. |
| M2.9 | kids/child-directed flags | **S1: general-audience, flags false, PG ad rating** | Compliant posture for a teen+ app with an 18+ tier. |

**Spicy & age-gate (meta-03)**

| # | Item | Ruling | Why |
|---|---|---|---|
| M3.1 | rating model | **S1: uniform 3-tier (spicy 0/1/2)** | One axis platform-wide. |
| M3.2 | 18+ = separate sibling config + pack | **S1** | Never a tier toggle in a family-safe tile. |
| M3.3 | which 18 games get a sibling | **S1: 9 warrant 18+, 2 tier-1 bump, 7 spicy-0-forever** | One principled test (intimacy/exposure payload). |
| M3.4 | age-gate shape | **S1: self-attestation + device flag** | Only shape compatible with anonymous-forever. |
| M3.5 | two unlock economies | **S1: age-attest → rewarded OR Night Pass → play** | Age gate precedes both. |
| M3.6 | HARD FLOOR lint | **S1: blocking, every item, every tier** | Publish gate; no item reaches a client without passing. |
| M3.7 | alcohol sub-floor | **S1** | One-sip, always-answerable, never auto-assign, footer, region flags. |
| M3.8 | sexual ceiling | **S1: spicy 2 max, no spicy 3** | Structurally capped by the verdict mechanic. |
| M3.9 | report flow | **S1: long-press, content-keyed, never identity** | The universal moderation entry point. |
| M3.10 | KV kill-switch | **S1: whole-tile + per-card blocklist, deploy-free** | Replay-safe; the missing primitive between "pull tile" and "republish." |

**Host/social/a11y (meta-04)**

| # | Item | Ruling | Why |
|---|---|---|---|
| M4.1 | `hostTunable` allowlist | **S1: 4th `gameConfigSchema` field, default `[]`** | Opt-in, server-clamped, never widens engine bounds. |
| M4.2 | host axes | **S1: roundCount + intensity + debateLength (+ optional pace)** | 18 games' knobs → one cross-game vocabulary. |
| M4.3 | settings UI | **S1: collapsible 2–4-row card, not a screen** | Host configures in 2 seconds. |
| M4.4 | game picker | **S1: 6 fixed categories, generic render** | Presentation-only KV metadata. |
| M4.5 | kick | **S1: capability-gated, between-matches, room-scoped hash block** | No mid-match kick (frozen roster), no cross-room ban. |
| M4.6 | room settings | **S1: lock, locale, settings card only** | No password/public-private/spectator. |
| M4.7 | room-code + QR + web link | **S1: web link is the share payload, no attribution** | Works for app-less recipients; anonymous. |
| M4.8 | "inspired by {creator}" | **S1: credit chip + link-out only, rights-compliant** | Credit + thumbnail + link-out; KV-suppressible. |
| M4.9 | shareable result card | **S1: launch (overrides meta-01 fast-follow)** | The only out-of-network growth lever. |
| M4.10 | accessibility | **S1: hard launch gate (AA/44pt/reduced-motion/colour-independent) + CI lint** | Not aspiration. |

**Content pipeline (meta-05)**

| # | Item | Ruling | Why |
|---|---|---|---|
| M5.1 | precompute split | **S1: 7 precompute (P0×2), 1 v2, 10 authoring-only** | Only score-bearing values are baked. |
| M5.2 | 6-stage funnel + voice-guide QA | **S1** | Flag flip is the last, human-signed step. |
| M5.3 | bilingual master → per-locale split | **S1: re-estimate every AI value per locale** | EN % in an FR room is a fairness bug. |
| M5.4 | `ContentPack.version` monotonic/immutable | **S1** | Replay pins a room for life. |
| M5.5 | KV pin + two-level kill-switch | **S1: config kill + pack revert, KV-only** | Deploy-free remediation. |
| M5.6 | inline→R2 migration | **S1 (drop-in at ~1.8 MiB trigger)** | Same registry key, async loader. |
| M5.7 | trend-decay refresh | **S1: monthly Cadence B** | New version + re-pin, no deploy. |
| M5.8 | AI-packaging automation | **S1: same gate, no privileged path** | Can only configure a live template; human signs the flip. |

**New brand-book modes (meta-06)**

| # | Item | Ruling | Why |
|---|---|---|---|
| M6.1 | Courtroom | **S1: config-only (VOTE@2 majority-herd + debate)** | 0 lines of TypeScript; mock-trial-of-a-behaviour. |
| M6.2 | Red Flag / Green Flag | **S1: config-only (VOTE@2 predict-majority + debate)** | The most literal brand-book→module match. |
| M6.3 | Who Said That? | **S1: 1 additive param (VOTE@2 `attribution`)** | Self-claim + attribute, **UGC designed out**. |
| M6.4 | free-text moderation surface | **C (designed out)** | Pack-authored cards, no typing, zero UGC. |
| M6.5 | debate beat | **S1: reuse `option-vote` debate, no advocate role** | Arguing is IRL; phone is a timer + skip. |
| M6.6 | spicy posture | **S1: all three spicy-0; deferred spicy-1 for two** | Courtroom stays spicy-0-forever. |

**Catalog reconciliation (meta-07)**

| # | Item | Ruling | Why |
|---|---|---|---|
| M7.1 | template count | **S1: 10 shipped modules** (not 5, not 6) | Pre-wave-2 counts superseded. |
| M7.2 | `tracer` has no tile | **S1: ship `who-s-most-likely` (P0)** | Reference VOTE@1 shouldn't be tile-less. |
| M7.3 | hot-seat | **R2: SPOTLIGHT_GUESS `predict-subject`** (standalone HOT_SEAT **C**) | Re-home the mechanic; no sprawl module. |
| M7.4 | rank-friends | **R2: build `RANKING` (last code gap)** | Borda ballot is genuinely new code. |
| M7.5 | Name-3-in-5s / blitz | **R2: PERFORM_JUDGE `blitz` config** | INPUT_GUESS stays numeric/text; timed-verdict is PERFORM_JUDGE's. |
| M7.6 | brand-book trio | **S1/B: all on shipped modules** | Zero new module. |
| M7.7 | 11th module | **C — none needed beyond RANKING** | Whole roadmap rides shipped modules + RANKING. |
| M7.8 | `@N` suffix vs `GameModule.version` | **S1: disambiguated** | `@N` is param-generation; only truth-dare is `version:2`. |
| M7.9 | "templates" marketing copy | **S1: keep "a handful" externally; 10-module inventory internally** | Build planning never reasons from the round number. |

---

## 9. Roadmap

### 9.1 v1 — Shipped

- **18 catalog tiles** across **10 modules** (§3.1), 17 wave-2 configs + the P0 `who-s-most-likely` tracer tile.
- The **Night** session shell: placement XP, streaks, Oracle-of-the-Night, mid-session switching (meta-01).
- **Ads-only** monetisation: between-games interstitial + rewarded spicy unlock + £1.99 Night Pass (meta-02).
- **Host** controls (`hostTunable` 3 axes, kick, room settings), **social** (code/QR/web share, inspired-by chips, **shareable result card at launch**), and the **a11y** launch gate (meta-04).
- The **offline-AI pipeline** (6-stage funnel, 7 precompute games, per-locale split, KV kill-switch) (meta-05).
- The **spicy/age-gate** system with the 4 launch/launch-adjacent 18+ siblings shipping `enabled:false` behind region flags pending legal sign-off (meta-03).

### 9.2 v1.x — Spicy packs + 3 new modes + host-tunables (mostly content-ops, ranked by reuse)

1. **Courtroom + Red Flag / Green Flag** — config-only on `option-vote`, 0 code (meta-06).
2. **Spicy / themed siblings** — flip the 4 launch 18+ tiles live after legal sign-off; ship deferred 18+ siblings (`tu-preferes-spicy`, `cinquante-cinquante-after-dark`, `jeu-du-theme-18`, `double-le-mouvement-spicy`) and the tier-1 siblings (`qui-a-dit-ca-cash`, `red-flag-green-flag-dating`); all Cadence B (the one ~0.5-day exception is `tu-preferes`'s `publicPicks:false` flip).
3. **`la-roue`** (jeu-de-la-note wheel100 rider) + **Pass the Bloop** (`option-vote` flip reveal) — config / ~0–1 day.
4. **Host-tunable timer growth** — expose `voteMs`/`revealMs`/etc. via `templateParamsSchema` for the games that already consume them (pires-potes, truth-or-dare, truth-or-drink).
5. **Per-locale R2 split + inline→R2 migration** at the ~1.8 MiB trigger (meta-05 §7).

### 9.3 v2 — New modes / templates (ranked by reuse gradient)

1. **Who Said That?** — `option-vote` `attribution` branch (~2–3 days), the one new param, bundled with the VOTE@2 wave.
2. **`RANKING` module** (~1 week) — the single most valuable *code* investment remaining; lands `rank-friends` (the wave-1 flagship) and unlocks **Guess My Rank basic** (then `RANKING@2` perception-gap fast-follow).
3. **Canonical Impostor flagship** + **NPC Infiltrator** — `secret-role` config + small param branches (~2–3 days each).
4. **hot-seat** — `spotlight-guess` `predict-subject` mode (~3–4 days).
5. **Name 3 in 5s / blitz** — `perform-judge` `promptVisibility:'all'` config (~1–2 days).
6. **Per-game roadmap originals** — loup-garou roles (Hunter → Cupid → Guardian → Captain → Little Girl, R2→R3), themed reskins (mafia/vampire/space), `quizz` Fibbage `fool`, `cinquante-cinquante` freestyle, `devine-l-objet` describe-variant, themed PERFORM_JUDGE/SPOTLIGHT packs — all config + small-param on shipped modules.

### 9.4 Open product calls that still need a human (with the recommended answer)

These genuinely need a product/founder/legal decision; each is implementable either way without changing the architecture. **22 open calls remain.**

| # | Source | Call | Recommended answer |
|---|---|---|---|
| 1 | meta-01 | XP-table constants (floor 40, win 100–150, cap 1.25×) | Ship as remote-config; the *shape* is decided, the numbers are tunable. |
| 2 | meta-01 | Soft match-cap (8) + wind-down cadence | Ship 8 remote-config; instrument and lean toward *fewer*. |
| 3 | meta-01 | Launch superlative set + exact copy | Ship the 7 universal superlatives as written; per-game signal superlatives fast-follow; founder lints the copy. |
| 4 | meta-01 | "Total laughs" reaction counter | Defer to v2 opt-in; don't add a cross-cutting mechanic for one stat line. |
| 5 | meta-01 / meta-02 | Night-pass interaction with the Night arc / scope | Ad-suppression only (session or 24h window); spicy unlock stays on the separate rewarded path; keep the two levers independent. |
| 6 | meta-01 | Late-joiner XP start (0 vs room median) | Start at 0; make them streak/comeback-eligible immediately; exclude very-late joiners from the "Anchor" roast. |
| 7 | meta-02 | Night Pass price & geo (£1.99 vs £0.99) | Launch £1.99, display `localizedPrice`, A/B post-launch. |
| 8 | meta-02 | Server-side anonymous receipt verification | Defer to v1.1; low incentive to crack a £1.99 cosmetic pass. |
| 9 | meta-02 | UMP pre-prompt | Omit (stay within UMP "no biasing pre-prompt"); honest framing lives in Settings. |
| 10 | meta-02 / meta-03 | Age-gate strength (DOB vs binary) | DOB entry (Apple-preferred), stored as a derived boolean, DOB discarded; legal confirms. |
| 11 | meta-02 | First-session grace length (2 vs 3) | Keep 2, remote-config. |
| 12 | meta-02 | Rewarded unlock scope (session vs 24h) | Session-only at launch to preserve Night-Pass conversion; loosen to 24h only if data shows rage-quit. |
| 13 | meta-03 | Final product+legal sign-off to flip the 4 launch 18+ tiles live | Ship `enabled:false` behind flags; flip per-tile after storefront-rating verification + legal, staged 5→100%. |
| 14 | meta-03 | Storefront age-rating strategy (single binary vs separate 18+ build) | Single app with the rating bump + on-device gate; verify per-storefront before building spicy packs. |
| 15 | meta-03 | `minAge 17` for `trouvez-la-regle-spicy` | Defer to demand-gated v2; if built, collapse to no-gate opt-in or full 18+. |
| 16 | meta-03 | Region-suppression list for alcohol | Legal provides the strict-market list; engineering ships the flag machinery now. |
| 17 | meta-04 | 4th host axis `pace` — launch or fast-follow | Ship the mechanism, enable on 2–3 timer-feel games (quizz, cinquante-cinquante, jeu-de-la-note), watch usage. |
| 18 | meta-04 | Web link domain + deferred-deep-link provider | Own `bloop.app/j/:code` + universal-link/App-Links; native deferred deep-link, no attribution SDK. |
| 19 | meta-04 | Category taxonomy sign-off (6 buckets) | Ship the 6 (presentation-only KV); Spicy visible-but-gated. |
| 20 | meta-04 | `onColor` Ink-on-bright + Cobalt small-text ban | Ink-on-Coral is non-negotiable for AA; keep Cobalt large-text-only, darken later only if a body-on-blue surface is needed. |
| 21 | meta-05 | `cinquante-cinquante` trust standard (consistency vs accuracy) + `quizz` fact-check ownership/SLA | Accept a consistency standard (fictional crowd frame); name a human fact-checker who signs every quiz answer + a report→pack-kill path. |
| 22 | meta-06 / meta-07 | Who Said That? self-claim vs assign-a-card; Courtroom scoring; canonical-Impostor-as-tile; Guess-My-Rank perception-gap go/no-go | Self-claim; keep herd-scoring; ship Impostor as a `secret-role` tile in v2; launch Guess My Rank basic-Borda first, greenlight `RANKING@2` perception-gap only if the basic tile lands. |

---

*End of GDD. This document is the single authoritative canon for Bloop. Mechanic detail lives in the linked per-game and meta docs; this GDD owns the catalog, the cross-doc reconciliation, and the master decisions log.*
