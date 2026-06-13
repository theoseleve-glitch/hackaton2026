# Double Jeu / Double Agent — Final Game Design (SHIPPED)

| Field | Value |
|---|---|
| **Game id** | `double-jeu` |
| **Name (FR / EN)** | Double Jeu / Double Agent |
| **Template + mode** | `SECRET_ROLE@2` — `roundMode:'accusation'`, `clueMode:'none'` (odd-one-out, accusation; no elimination, no clue turns) |
| **Players (from the module)** | `minPlayers: 4`, `maxPlayers: 16` (sweet spot 5–10 in tile copy) |
| **Spicy tier** | 0 (family-safe; no spicy sibling at launch — see §5) |
| **Physical** | Seated (IRL free talk, taps/votes only — no standup) |
| **Status** | **SHIPPED** — `packages/games/secret-role`, `DOUBLE_JEU_CONFIG`, content pack `content/packs/double-jeu.json` (185 items) |

It ships as a `game_config` (`DOUBLE_JEU_CONFIG`) on the **shared SECRET_ROLE module** (`createSecretRole(id, config)`) — the impostor flagship and Double Jeu coexist on one ~80%-identical reducer/redaction skeleton (synthesis §5.1). No `NEW:ODD_ONE_OUT` template was created.

---

## 1. Pitch & room fantasy

**Pitch.** Everyone's phone secretly shows the same word… except one player, who gets a deliberately-close decoy ("Boîte de nuit" vs "Bar karaoké"). Two rounds of free talk, two secret votes to unmask the odd one — miss twice and the impostor walks.

**Room fantasy — paranoia noir.** Nobody is told their role (`revealRoleToSelf:false`): even the impostor only ever sees "your item" and discovers they're odd **by listening**. The manufactured laugh is the *simultaneous double-doubt* — every player defends their word out loud while quietly wondering if THEY are the strange one. The deliberately-vague IRL hint ("c'était… une bonne soirée") reads as either innocence or a perfect bluff, and the table can't tell. The signature beat is the **public clearing** after a missed vote 1 ("Pas l'imposteur ! Présentez vos excuses.") — the wrongly-accused gets dramatic vindication, fuelling a tighter, angrier round 2. It manufactures accusations between friends with zero typed text and zero moderation surface; the tension *is* the fun.

---

## 2. Shipped ruleset (AUTHORITATIVE — from `DOUBLE_JEU_CONFIG` + `secret-role.ts`)

### Phases (per match; `matchesPerSession: 3`)

`phaseKey(state)` returns `over` (terminal), `{phase}:m{match}:p{period}` for discuss/vote/verdict, else `{phase}:m{match}`.

| Phase | `phaseKey` | Duration (ms) | Beat |
|---|---|---|---|
| secretReveal | `secretReveal:m{n}` | `secretRevealMs: 12_000` | Hold-to-peek your OWN item only; theme public; ends early on all-ack (connected) |
| discuss p0 | `discuss:m{n}:p0` | `discussMs: 120_000` | IRL free talk; "Ready to vote" early-exit (all connected ready) |
| vote p0 | `vote:m{n}:p0` | `voteMs: 25_000` | Simultaneous secret accusation; self-vote inert; first vote locks |
| verdict p0 | `verdict:m{n}:p0` | `verdictMs: 8_000` | **Only if vote 1 missed**: tally + top accused publicly CLEARED; tie → nobody cleared |
| discuss p1 | `discuss:m{n}:p1` | `discuss2Ms: 90_000` | Shorter round 2 (cleared-suspect info accelerates deduction) |
| vote p1 | `vote:m{n}:p1` | `voteMs: 25_000` | Final vote; caught = unique plurality on impostor; anything else = impostor wins |
| finalReveal | `finalReveal:m{n}` | `finalRevealMs: 12_000` | Atomic reveal: impostor id, both items, winning side, exact points → next match or `over` |
| over | `over` | `null` (untimed) | Session standings; `gameOver(scores)` emitted; client fires ad off the `over` transition |

Worst-case match (vote 1 misses) ≈ 12 + 120 + 25 + 8 + 90 + 25 + 12 = **292 s** (~4 min). On a vote-1 catch the match ends at the first `finalReveal` (no verdict/period 2).

### Scoring (exact constants from `config.scoring`)

All points accrue in **HIDDEN** `pendingPoints` and are folded into `scores` only at `finalReveal` (a visible mid-match +1 would out the impostor). Computed in one pure pass in `resolveVote`/`endMatch`.

| Award | Constant | Value | When |
|---|---|---|---|
| `civilianCorrectBallotPerVote` | 1 | +1 | Each civilian, per vote round their ballot targeted the impostor (max **+2**) |
| `teamBonusCaughtVote1` | 2 | +2 | Every civilian, if impostor caught on vote 1 |
| `teamBonusCaughtVote2` | 1 | +1 | Every civilian, if impostor caught on vote 2 |
| `impostorSurvivesVote1` | 2 | +2 | Impostor, banked surviving vote 1 (kept even if caught on vote 2) |
| `impostorWinsBonus` | 3 | +3 | Impostor, added for surviving vote 2 (**impostor win = 5 total**) |
| `impostorDisconnectCivilianConsolation` | 1 | +1 | Every civilian if THE impostor disconnects mid-match (impostor gets 0) |

Best civilian line: +2 (both ballots correct) + team bonus. Caught-vote-1 civilian who voted right both possible rounds: 1 + 2 = max **3** that match; caught-vote-2: up to 2 + 1 = 3.

### Win / draw / tie rules

- **`caught` = the impostor is the UNIQUE plurality target** of a vote (`uniquePlurality`). A **tie at the top, a wrong unique target, or all-abstain = a MISS** (favours the impostor; impostor doc §4.5 verbatim). No revote sub-phase, no random tiebreak.
- Vote 1 miss → `verdict` beat → `discuss` p1 → vote 2. Vote 2 miss → impostor wins (`endReason:'impostorWins'`). Caught on either vote → civilians win (`caughtVote1`/`caughtVote2`). Never a third period.
- The impostor **votes too** (camouflage), so a coordinated impostor can engineer top-ties — accepted as a deterministic, dramatic feature.
- **Session winner** = highest `scores` after 3 matches; the shell owns the leaderboard and converts placement → XP. Ties in `scores` are not broken inside the module (raw map surfaced to the shell).

### Presence / disconnect behaviour

- `init` seeds `connected` via `initPresence`; `playerLeft`/`playerRejoined` flip a single presence bit (idempotent — re-setting the same value returns the same state).
- **A disconnected/passive phone never blocks a phase.** All early-exits use `allActed(connectedPlayers(...), set)` so only connected players are required; the deadline advances regardless. A `playerLeft` that completes the expected set can itself advance secretReveal→discuss, discuss→vote, or trigger `resolveVote`.
- **Impostor disconnect mid-match** (`event.playerId === impostor && phase !== 'finalReveal'`) → `impostorLeftEnd`: match ends immediately, impostor scores 0, every civilian +1 consolation, `endReason:'impostorLeft'`. The room never hunts a ghost.
- **Impostor seeding is ghost-proof**: `pickImpostor` picks the first **connected** player in that match's seeded `impostorPool` order, so a player who left during the previous `finalReveal` is never seeded as the hunt target.

### Redaction (what's secret from whom)

- **secretReveal**: each viewer sees only `myItem` — `item.majority` for civilians, `item.impostor` for the lone impostor — with **no role flag**. Non-players see `null`. The public `theme` is shown to everyone.
- **Votes** are buffered in HIDDEN `state.votes` (accuser→accused). Views carry `hasVoted` booleans + the viewer's own `myVote` echo only — never the votes map. Tallies (`VoteRecord`) are promoted to public only at resolution; individual ballots are never exposed.
- **`pendingPoints`** stay hidden until `finalReveal`. Item `majority`/`impostor` word values never reach a pre-`finalReveal` view. The full `MatchResult` (impostor identity, both items, per-player points) is public from `finalReveal` on.
- Action schema (`secretRoleActionSchema`): `ack` | `ready` | `vote{target:string 1–64}` — **zero free-text**, validated at the DO boundary.

---

## 3. Content model

**Authored item shape** (`content/packs/double-jeu.json`; runtime maps to `SecretRoleItem`):

```jsonc
{ "id": "night-out-club-karaoke", "mediaType": "text",
  "theme":    { "fr": "Soirée", "en": "Night out" },     // PUBLIC label, whole room
  "majority": { "fr": "Boîte de nuit", "en": "Nightclub" }, // HIDDEN, all civilians
  "impostor": { "fr": "Bar karaoké", "en": "Karaoke bar" }, // HIDDEN, the odd one — same theme, deliberately close
  "closeness": "medium",   // easy | medium | hard — pre-scored offline semantic distance
  "spicyLevel": 0 }
```

The reducer keeps only `{id, theme, majority, impostor}`; `mediaType`/`closeness`/`spicyLevel` are offline-pipeline concerns. Every visible string is a `{fr,en}` map; the offline pipeline splits the master into single-locale sibling packs (`double-jeu-fr` / `double-jeu-en`) at publish, so `init` stays locale-free.

**Counts (shipped pack).** **185 items**, all `mediaType:'text'`, all `spicyLevel:0`, **no duplicate ids**. Closeness split: **12 easy / 107 medium / 66 hard**. Comfortably clears the lint floor (`≥ matchesPerSession = 3` items/locale); `init` shuffles and plays `min(3, packSize) = 3` matches.

**AI-precomputed offline (`needsOfflineAiPipeline: true`).** The pipeline pre-scores `closeness` (semantic distance) for each majority/impostor pair **per locale** — pairs must be equally hard in FR and EN, or the two locales play different difficulty curves. Every `hard` item is human-playtested before `enabled:true`. v2 image pairs (pre-rendered, QA'd, R2-hosted) would be a second pre-compute surface. **Nothing is computed at runtime** (determinism contract).

**Voice / tone (voice-guide §5.6 — "paranoia noir").** Copy fuels suspicion, never relieves it: accusation language, interrogation beats, dry menace ("Quelqu'un ici ne parle pas du même endroit que vous."). The clearing is vindication drama ("Pas l'imposteur. Présentez vos excuses."). **No slapstick — the tension is the fun; the items themselves stay neutral nouns.** The shipped pack carries the menace in the **public `theme`** strings (e.g. "La soirée qui dort dans le téléphone de quelqu'un ici" / "the night someone in this room has footage of") while `majority`/`impostor` remain clean ≤3-token nouns.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / hostTunable item from §2.6, the by-game `recommendations[]`, and `risks[]` — each given a FINAL ruling. No TBD.

| # | Was (deferred / open / risk) | FINAL decision |
|---|---|---|
| 1 | New template vs impostor family? | **Ship v1** — SECRET_ROLE `game_config` + additive @2 params; no new template (shipped exactly so). |
| 2 | "2–3 min" → exact timers? | **Ship v1** — `discussMs:120_000` / `discuss2Ms:90_000`, all-ready early-exit; catalog-retunable 90–180 s. |
| 3 | What counts as "trouvé"? | **Ship v1** — caught = unique plurality; tie/wrong/all-abstain = miss; no revote, no random tiebreak. |
| 4 | What's revealed after a missed vote 1? | **Ship v1** — public tally + dramatic clearing of the wrongly-accused; tie → nobody cleared; impostor never revealed pre-finalReveal. |
| 5 | Does the impostor know? Theme public? | **Ship v1** — `revealRoleToSelf:false` (nobody told their role); theme public. |
| 6 | Keep the caught-impostor guess window? | **Roadmap v2** — `impostorGuessEnabled:false` shipped; flip later once a guess sub-phase + its text-moderation path is built (one-line spec in §7). |
| 7 | Media strategy (image / audio / video)? | **Ship v1 text-only**; **Roadmap v2 image** (pre-rendered R2 pairs); **Roadmap v3 audio**; **Cut video** (last-or-never). |
| 8 | Exact scoring? | **Ship v1** — constants 1 / 2 / 1 / 2 / 3 / 1 as in `config.scoring`. |
| 9 | Player count? | **Ship v1** — module `minPlayers:4` / `maxPlayers:16`; tile sweet-spot 5–10 (3-player accusation degenerates → tightened to 4). |
| 10 | SECRET_ROLE@2 branch must land first (risk) | **Resolved** — branch shipped with the impostor build; module is parameterized, not patched. |
| 11 | Long 120/90 s discussions risk dead air (risk) | **Ship v1 + monitor** — theme card + ready-early-exit + nudge copy; watch round-abandon at rolloutPct 5%. `hostTunable` debate length (§6) covers quiet groups. |
| 12 | Verdict info-leak makes vote 2 trivial in 4–5p (risk) | **Ship v1 + roadmap fallback** — keep dramatic clearing; register `verdictMode:'clear'\|'tally-only'` host/catalog param, flip to tally-only if vote-2 catch rate ≫ 55–65% (§7). |
| 13 | Pair-closeness calibration IS the game (risk) | **Resolved (content-ops)** — offline per-locale `closeness` scoring + mandatory human playtest of every `hard` item before enable (§8). |
| 14 | Ties structurally favour the impostor (risk) | **Ship v1 (feature)** — accepted as deterministic/dramatic; **monitor** — revisit the tie-counts-as-miss ruling only if impostor win rate > ~50% at 6+ players. |
| 15 | Impostor-disconnect path (risk) | **Ship v1** — `impostorLeftEnd` handled: match ends, civilians +1, impostor 0; ghost-proof seeding. |
| 16 | Bilingual closeness drift (risk) | **Resolved (content-ops)** — pipeline scores closeness **per locale**, not once; sibling-pack publish + per-locale naturalness sign-off. |
| 17 | Spicy tier? | **Cut at launch** — no 18+ sibling (reasoned in §5); leave `spicyLevel` axis live for future packs. |

---

## 5. 18+ spicy sibling config — **NO SPICY TIER (reasoned)**

**Decision: ship no 18+ sibling for double-jeu.** This is a *deduction* game; its fun is the closeness of two neutral nouns and the paranoia of not knowing your role — not the saltiness of the content. Spicy words would actively *hurt* the mechanic: an impostor word that's lewd is easy to spot (it breaks the "same abstractness, deliberately close" invariant the whole game rests on), so a spicy pack would be both harder to author and less fun. The voice-guide §5.6 note is explicit: "the items themselves stay neutral nouns" — the menace lives in the **public theme copy** (already edgy: "the night someone in this room has footage of"), which needs no age gate.

Where adult flavour belongs in this template, it's served by the **sibling truth-or-dare / truth-or-drink configs** (synthesis §5.2/§5.3), which own the 18+ surface platform-wide. Double Jeu stays `minAge` family-safe, `publicPicks` already false (votes hidden by design), one pack family. The `spicyLevel: 0|1|2` axis **remains in the item schema** so a future themed pack (e.g. a "soirée" night-out edition) *could* carry tier-1 cheekiness in the theme copy only — but no separate pack id, no `minAge:18`, no mechanic change ships now.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

The lobby exposes a tight allowlist; everything else stays catalog/KV-owned. All ranges are safe deterministic retunes of existing config fields — no schema change.

| Param | Maps to | Default | Safe range | Note |
|---|---|---|---|---|
| **Match count** | `matchesPerSession` | 3 | 1–5 | Capped at pack size; each match ≈ 4 min |
| **Debate length** | `discussMs` / `discuss2Ms` | 120 s / 90 s | p0 90–180 s, p1 60–150 s (p1 ≤ p0) | For quiet/loud groups; the round-abandon mitigation |
| **Verdict reveal** | `verdictMode` *(v2 param)* | `clear` | `clear` \| `tally-only` | Tighten vote-2 leak in small rooms (see §4 #12) |

Not host-tunable (locked): scoring constants, `revealRoleToSelf`, `maxImpostors`, `roundMode`, `clueMode`, secretReveal/vote/verdict/finalReveal durations, the spicy axis. A spicy toggle is intentionally absent — there is no spicy pack to toggle.

---

## 7. Future modes roadmap

| Mode / feature | Decision | One-line spec |
|---|---|---|
| **Image packs** | **Roadmap v2** | `mediaType:'image'` + `media:{majorityKey, impostorKey}` R2 keys to PRE-RENDERED slightly-different images (generated + visual-distance-scored + QA'd offline); phones download both-eligible assets at match init, show only their own. |
| **Caught-impostor guess window** | **Roadmap v2** | Flip `impostorGuessEnabled:true` — adds a ~20 s post-catch sub-phase where the caught impostor guesses the civilian word for steal-back points; requires a guess-input + text-moderation path. |
| **`verdictMode:'tally-only'`** | **Roadmap v2 (param ready)** | Config/host flip that shows the missed-vote-1 tally WITHOUT clearing the top accused — kills the small-room vote-2 leak; ship if analytics demand. |
| **Audio packs** | **Roadmap v3** | 10 s royalty-free clip pairs, each player listens on their own phone via the volume-warning pattern; licensing + room-audio cost gated. |
| **Elimination mode** | **Roadmap (param exists)** | `roundMode:'elimination'` already in the @2 type surface — a separate config (vote-out lineage) if/when wanted; not a double-jeu mode. |
| **Multi-impostor** | **Cut** | `maxImpostors` stays 1; two odd-ones break the "everyone got the same word except one" fantasy and the redaction model. Revisit only with strong demand. |
| **Video packs** | **Cut** | Licensing, file-size on party Wi-Fi, multi-phone playback chaos — no mechanic gain over text/image. |

---

## 8. Risks & content-ops notes

- **Pack-sizing lint.** Per-locale pack must hold ≥ `matchesPerSession` (3) items, no duplicate ids, both `majority`/`impostor` ≤ 3 tokens (reveal-card fit), all strings pass the obscenity scan at authoring. Shipped pack: 185 items, 0 dup ids, all `spicyLevel:0` — passes with huge headroom.
- **Closeness calibration is the whole game.** Too close → impostor unfindable (frustration); too far → round 1 instant (boring). Offline AI scores semantic distance **per locale**; **every `hard` item is human-playtested before `enabled:true`** (AI gate stages 2 & 5). Current mix 12 easy / 107 medium / 66 hard skews to medium — healthy default difficulty.
- **Bilingual parallelism.** `{fr,en}` pairs must hold the **same closeness in both locales** or FR and EN rooms diverge in difficulty; the pipeline scores closeness per locale, not once.
- **Freshness / decay.** Items are evergreen neutral nouns (food, places, media, animals) — low semantic decay. The **theme copy** carries topical/cultural references ("the £14 soup you queued for", "since 2015") that age faster than the noun pairs; refresh theme strings, not the pairs, on content-ops cadence.
- **Moderation surface = ZERO at runtime.** v1 is taps + votes only (`impostorGuessEnabled:false`, no free text); the only moderation is authoring-time obscenity scanning. The v2 guess window is the one feature that would re-introduce a text path — gate it accordingly.
- **Behavioural risks (monitored, not blocking).** Long 120/90 s discussions vs platform norms (mitigations: theme card, ready-early-exit, nudge copy, host debate-length tuning); verdict info-leak in 4–5p rooms (fallback `verdictMode:'tally-only'`); ties favouring the impostor (revisit at >50% impostor win at 6+ players). Watch round-abandon analytics from rolloutPct 5%.
