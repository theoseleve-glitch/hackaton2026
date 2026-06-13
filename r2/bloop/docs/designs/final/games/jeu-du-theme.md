# jeu-du-theme — Le Jeu du Thème / Last Word Standing — FINAL DESIGN

| Field | Value |
|---|---|
| **Game id** | `jeu-du-theme` |
| **Name (FR)** | Le Jeu du Thème |
| **Name (EN)** | Last Word Standing |
| **Tagline (FR)** | Un thème, une lettre, un mot — le dernier debout rafle la mise ! |
| **Tagline (EN)** | One theme, one letter, one word — last one standing takes it all! |
| **Template + mode** | `LAST_STANDING` (NEW template — turn-based survival-verdict / battle royale) — base & only mode |
| **Players** | min 3, max 16 (from the module: `minPlayers: 3`, `maxPlayers: 16`; sweet spot 4–10) |
| **Spicy tier** | 0 (100% safe at launch; pack `bySpicy = {0: 105}`) |
| **Physical** | mixed (seated jury + standing shout works either way; phones are shot clock + jury only) |
| **Status** | **SHIPPED** — reducer, views, zod action schema, config and 105-item pack all live |

Module: `packages/games/last-standing/src/last-standing.ts` (reducer/views) · `state.ts` (`JEU_DU_THEME_CONFIG`, types) · `actions.ts` (zod) · `index.ts` (exports). Pack: `content/packs/jeu-du-theme.json` (authoring master, bilingual). Canonical numbers below are quoted from `JEU_DU_THEME_CONFIG`.

---

## 1. Pitch & room fantasy

**One-line pitch.** A theme + a forced first letter is drawn ("Un sport. Toi tu t'es claqué un muscle en mettant une chaussette." + **B**); the surviving players take turns **shouting a word out loud** under a clock that shrinks every lap; the rest of the room thumbs-votes each word; anyone rejected, silent, or surrendering is eliminated for the round; the last one standing takes the bonus.

**Room fantasy.** This is the genre's oldest party reflex — "name something starting with…" under pressure — turned into a public execution. The fun is manufactured by three frictions:
- **The decaying shot clock** (8s → 3s floor) is a physical tension machine: as the timer trembles, players blank, blurt nonsense, and self-eliminate laughing. TikTok-native escalation built into the math.
- **The jury IS the validation** — there is no dictionary. A word lives or dies on the room's thumbs, so every turn is a tiny argument: "is *clouds* really *in the sky* or is that cheating?", "déjà dit !", "that's not a real word". The mechanic exists to manufacture that 5-second table fight.
- **Eliminated players become jurors** — nobody sits out sulking; getting knocked out promotes you to executioner, and the grudge vote ("le mot est faible ? Punissez.") is part of the comedy. The cruelty is capped by benefit-of-the-doubt rules so it stays *funny never cruel*.

No word is ever typed. Phones are a shot clock and a thumbs panel; the laugh stays in the room.

---

## 2. Shipped ruleset (AUTHORITATIVE)

### Phases (real `phaseKey` + durations from `JEU_DU_THEME_CONFIG`)

| Phase | `phaseKey` | Duration | Beat |
|---|---|---|---|
| `draw` | `draw:r{round}` | **4 000 ms** (`drawMs`) | Slot-machine theme + letter reveal. `alive` resets to the **connected** snapshot. **Guard at entry:** `connectedPlayers < 2` → straight to `over` (`gameOver(scores)` + analytics `room_collapsed`) — a collapsed room never blocks. Theme drawn from the hidden deck at `themeCursor`; letter picked by a per-`(round,itemId)` seeded stream from the item's pre-validated list minus already-used letters (cross-round no-repeat). Deadline → `enterTurn`. |
| `say` | `say:t{turnSeq}` | **decaying** = `max(3 000, 8 000 − lapInRound × 1 500)` → **8s → 6.5s → 5s → 3.5s → 3s floor** (`sayMs`, `sayDecayPerLapMs`, `minSayMs`) | Shot clock on the spotlit survivor, who **shouts** a matching word (nothing typed). Actions: `wordSaid` (spotlight only → `judge`) or `giveUp` (spotlight only, self-eliminate `outcome 'gaveUp'` → `result`). Deadline → `outcome 'timeout'`, elimination. Spotlight disconnect mid-say → `outcome 'left'`, elimination (round only). A disconnected-but-alive player reaching the spotlight at turn entry is eliminated immediately (`outcome 'left'`) so an absentee can't outlast the room. |
| `judge` | `judge:t{turnSeq}` | **6 000 ms** (`judgeMs`) | Thumbs vote by every eligible juror = **present AND ≠ spotlight AND not-yet-voted**, with eliminated players included (`deadPlayersJudge = true`). `judge {vote: valid\|reject}`; **first vote locked**; own-vote echo only. Ends early on all-acted; deadline resolves with votes cast. Empty eligible set at entry → auto-valid immediately (zero cast → valid). |
| `result` | `result:t{turnSeq}` | **2 000 ms** (`resultMs`) | Stamp beat: `VALIDE ✅` / `💥 ÉLIMINÉ` + anonymous **tally counts only**. Deadline → next alive survivor's `say`, OR `roundEnd` when `aliveCount ≤ 1` OR the hard cap `rotation.length × 6` (`maxTurnsPerRoundFactor`) is hit. Emits analytics `turn_resolved {outcome, turnSeq}`. |
| `roundEnd` | `roundEnd:r{round}` | **4 000 ms** (`roundEndMs`) | Survivor crowned: **+3** (`survivorPoints`) to the last one standing (cap case: every still-alive player gets it; zero survivors: no bonus). Emits analytics **`round_completed {round}`** — the shell's interstitial-ad boundary. Deadline → next `draw` or `over` after `totalRounds` / deck exhaustion. |
| `over` | `over` | **null** (untimed terminal) | Final leaderboard + `gameOver(scores)` effect. |

`init → drawRound(base, 0)` — the game opens directly on the first `draw`. `phaseDurationMs` returns the decaying value for `say` (pure function of `lapInRound`), the fixed constants otherwise, and `null` for `over`.

### Scoring (real constants)

- **`validWordPoints = 1`** — a word the jury validates → spotlight `+1` and `wordsValidated[spotlight]++`. Rewards participation: out 5th with 4 validated words beats out 1st with 0.
- **`survivorPoints = 3`** — last one standing in a round → `+3`. On a cap hit every still-alive player takes the `+3`; zero survivors → no bonus.
- **Jurors are unscored** — keeps the jury honest (the lesson carried from Truth-or-Dare §5: scoring votes corrupts them).
- **`totalRounds = 3`** (clamped at `init` to `min(totalRounds, deck.length)`).

### Win / draw / tie rules

- **Win** = highest cumulative `scores` at `over` (sum of `+1`-per-word and `+3`-per-survival across all rounds). The module publishes the raw `scores` map; the shell ranks and awards **placement-based** cross-game XP (each game keeps its own scale).
- **Ties for the win** are *not* broken inside the module — the `over` view ships the full `scores` + `wordsValidated` maps and the client renders a shared placement. (`wordsValidated` is the natural display tiebreaker / superlative source but is not enforced in `scores`.)
- **Per-word validity tie** is decided at resolution: rejected **iff `rejectVotes / castVotes > 0.5` STRICTLY** (`rejectThreshold = 0.5`). Exact 50/50, all abstain, or zero votes → **VALID** (benefit of the doubt, anti-griefing, mirrors ToD "ties → done").

### Presence / disconnect behaviour (presence ≠ elimination)

- `alive` is **per-round** game-local state, reset to the connected snapshot at each `draw`. Presence is separate (`connected`).
- **Spotlight leaves mid-`say`** → eliminated for the round (`outcome 'left'`), game continues.
- **Disconnected-but-alive player reaches the spotlight** → eliminated at turn entry (`outcome 'left'`) — an absentee can never win by hiding.
- **Voter leaves mid-`judge`** → the expected jury shrinks; if that completes the all-acted set, resolve now; an empty set → auto-valid (never block).
- **Spotlight leaves mid-`judge`** → the claim stands; resolve with votes already cast.
- **Votes are locked on first cast** and still count even if the voter leaves afterwards.
- **Rejoin** flips presence only: an eliminated rejoiner stays out for the current round and is auto back in at the next `draw`.
- **Room collapse** (`< 2` connected at a `draw` entry) → `over` with `room_collapsed` analytics + `gameOver`.

### Redaction (what's secret from whom)

Smallest redaction surface of any template. The drawn `theme` + `letter` are **public** (they're shouted in the room anyway). HIDDEN from **all** viewers, always:
- `deck` / `themeCursor` (upcoming themes — the only content secret),
- `usedLetters` (cross-round no-repeat bookkeeping),
- the `judgeVotes` **mapping** (only tally counts are ever published, even after resolution),
- `seed`, and `current.itemId` (the internal no-repeat key).

Per-viewer differences are limited to flags: `youAreSpotlight` / `canGiveUp` (`say`), `youCanVote` / `myVote` (own-vote echo only) / `votesIn` / `votersExpected` (counts only, `judge`). Unknown/spectator viewers get `youCanVote = false`, `myVote = null` and the same public projection. Redaction audit (`leakedSecrets`) targets undrawn theme texts + individual votes + `exampleWords`.

---

## 3. Content model

### Pack item shape (authoring master, bilingual)

```jsonc
{
  "id": "jdt-sports-008",                 // stable unique id = cross-round no-repeat key
  "theme": { "fr": "...", "en": "..." },  // category sentence, ≤ 80 chars, SHOUTY-readable
  "letters": {                            // UPPERCASE, PRE-SCORED OFFLINE feasible (≥15 common words / theme×letter×locale)
    "fr": ["B","T","J","N","E","H","G","V"],
    "en": ["B","T","S","H","G","R","C","F"]
  },
  "difficulty": 1,                        // 1|2|3 — drives the 'ascending' round curve
  "spicy": 0,                             // 0|1|2 — pack tone = max over items
  "tags": ["sport"],                      // freeform, for themed pack curation
  "exampleWords": { "fr": [...], "en": [...] } // QA EVIDENCE ONLY — STRIPPED at publish (would prime answers)
}
```

The runtime adapter collapses this into `LastStandingItem = { id, theme: LText, letters: string[], difficulty }`: it **strips `exampleWords` and `tags`**, and merges the two per-locale letter lists into **one shared list** (`fr ∩ en` when the intersection has ≥ 3 letters, else the `fr` list) — the room shares one spoken letter, so it must be identical on every phone regardless of device locale, and an intersection letter is pre-validated feasible in both languages. Publisher convention: the bilingual master is split into per-locale runtime packs `<base>-fr` / `<base>-en` (one-pack-one-locale, template-architecture §2.7).

### Counts (current pack: `version 1`, `generatedAt 2026-06-11`)

- **105 items** total — far above the lint floor (`items ≥ totalRounds`, recommended `≥ 3×`; with 3 rounds and the recommended-3× rule, ~9 minimum — 105 gives massive no-repeat headroom across sessions).
- **Difficulty mix:** 66× diff-1, 33× diff-2, 6× diff-3 — populates all three `ascending`-curve buckets.
- **Spicy:** 105/105 at spicy `0` (pack tone = 0 = safe).
- **Letters per locale:** 6–9 (within the spec's 6–10 band).
- **Theme length:** max 80 chars FR & EN (at the SHOUTY-readable cap).
- **33 distinct tags** for future themed-pack curation.

### What is AI-precomputed offline

`needsOfflineAiPipeline = true`. The offline pipeline does exactly **one** thing at authoring time and **nothing at runtime**: per-`(theme × letter × locale)` **feasibility scoring** — every letter on every list must pass a **≥ 15-common-words** gate (LLM enumeration + wordlist cross-check). `exampleWords` is the QA evidence that gate produced, kept in the master and **stripped at publish**. There is no live AI, no dictionary check, no scoring of spoken words — validity is 100% the room's thumbs at runtime.

### Voice / tone note (content-voice-guide §5.14)

> **Battle-royale trash talk.** Shrinking clock = escalating menace; copy gets shorter and colder as the timer does. Elimination lines are verdict drops («Silence. Éliminé. Cheh.»); survival lines crown with irony («Toujours en vie. Personne ne sait comment.»). Jury-vote copy invites bad faith («Le mot est faible ? Punissez.»).

Themes follow the global voice law (§0–§1.11): name a detail not a category, put someone in the room in frame, leave a votable verdict. The shipped pack already reflects this — e.g. `jdt-sports-008` "Un sport. Toi tu t'es claqué un muscle en mettant une chaussette." and `jdt-sdb-012` "Y'a ça dans la salle de bain de quelqu'un ici. On dira pas qui. Le vote, si." Several themes are *engineered for jury conflict* by design ("Dis « ananas » et regarde la pièce se diviser", "Dis « nuage » et regarde le jury se retourner contre toi") — the theme text itself seeds the table fight the mechanic needs.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / host-tunable bullet from §2.14 + the by-game `recommendations[]`, each resolved to a final ruling.

| # | Was (deferred / open / recommendation) | FINAL decision | Why |
|---|---|---|---|
| D1 | *Word typed or spoken?* | **Ship v1: spoken, always.** Phone never captures the word; `actions.ts` has no free-text field. | Zero UGC moderation surface, fun stays in the room, typing under an 8s clock would kill rhythm. Locked. |
| D2 | *Who validates / tie handling?* | **Ship v1: room jury, reject only on STRICT majority** (`rejectThreshold 0.5`, `>` strict); tie/abstain/zero → valid; first vote locked. | "Funny never cruel"; benefit of the doubt; mirrors ToD ties→done. Shipped exactly. |
| D3 | *What do eliminated players do?* | **Ship v1: they join the jury** (`deadPlayersJudge = true`). | Nobody idle; widened jury dilutes late-round survivor conflict-of-interest. Shipped; also surfaced as the future grudge-jury lever (D9). |
| D4 | *Letter draw without unplayable turns?* | **Ship v1: per-language pre-validated letter lists** (≥15 common words / theme×letter×locale, scored offline), seeded no-repeat draw. | Feasibility is language- and theme-dependent; offline AI, never runtime; equity precomputed, gameplay deterministic. Shipped (`buildDeck` + seeded `letter` pick). |
| D5 | *Guaranteed round convergence?* | **Ship v1: double safety** — decaying shot clock (`max(3000, 8000 − lap×1500)`) + hard cap `rotation.length × 6` turns. | Clock forces math convergence AND TikTok tension; cap is the belt-and-braces so no room hangs. Shipped (`sayMsForLap`, `afterResult` cap). |
| D6 | *Repeated words?* | **Cut from engine — policed by the room.** UI copy "Déjà dit = pouce rouge !" during `judge`; no dictionary, no input. | Words are oral → invisible to the engine; brief excludes dictionaries; policing repeats is what makes the jury fun. Engine intentionally does nothing — a client copy responsibility. |
| D7 | *Which template?* | **Ship v1: NEW `LAST_STANDING`** as its own template (single-game build, ~1–2 weeks, accepted). | TRUTH_DARE lacks an elimination loop / persistent round prompt. **Note:** the original "absorb Name-3-in-5s" claim is **superseded** — §5.5 of the design doc routes Name-3 to PERFORM_JUDGE instead; LAST_STANDING stays a clean single-game template. |
| D8 | *minPlayers?* | **Ship v1: 3** (module hard-refuses 2 via `minPlayers: 3`); sweet spot 4–10. | At 2 the only juror is the direct rival = total conflict of interest. Shipped. |
| D9 | *Grudge-jury / kingmaking (risk lever)* | **Ship v1 as-is; Roadmap v2 lever.** Keep strict-majority + tie=valid as the v1 mitigation; ship analytics watching **eliminated-juror reject-rate vs alive-juror reject-rate**. v2 config lever (no new code path needed for the toggle): set `deadPlayersJudge = false` or add jury weighting **only if** telemetry shows abuse. | Don't pre-optimize; the `deadPlayersJudge` flag is already a config switch. Decide from data. |
| D10 | *Honor-system bluffing ('wordSaid' with nothing said)* | **Cut any engine fix — by design.** The vote IS the validation; a silent claim is exactly what the jury rejects. Client copy must explain it. | No moderation surface to add; the jury is the anti-cheat. |
| D11 | *Long rounds at 12–16 players (~5–6 min)* | **Ship v1: provide a big-group catalog config** (`totalRounds 2`, `sayMs 6000`) AND **cap the default catalog entry at maxPlayers 12**. Module ceiling stays 16 for custom rooms. | Keeps the default room snappy without changing code; big-group config is pure params. |
| D12 | *Spoken words unmoderable by construction* | **Accept as residual risk.** Lean on lobby report/kick/block; nothing is persisted or broadcast outside the room. | Lowest-risk surface of the catalog — there is no text to moderate. No action beyond lobby tooling. |
| D13 | *`exampleWords` must never reach a client* | **Ship v1: stripped at publish + redaction audit targets it** (alongside `themeDeck` and individual votes). | It would prime answers. The runtime `LastStandingItem` type has no `exampleWords` field — strip is enforced by the adapter, audited by `leakedSecrets`. |
| D14 | *Spotlight disconnect = round elimination only* | **Ship v1 as-is; UI must communicate it.** Disconnect mid-say eliminates for the **round**, not the game; rejoiner returns next draw. | Avoids looking punitive; the rule already protects the room from absentee stalling. Client copy obligation. |
| D15 | *Mono-locale pack convention vs bilingual items* | **Ship v1: publisher splits the bilingual master into `<base>-fr` / `<base>-en`; the split step gates parallel-locale coverage** (offline gate #2). | Authoring stays bilingual for QA; runtime stays one-pack-one-locale. The split must verify both locales pass the letter-feasibility gate. |
| D16 | *Scoring exact?* | **Ship v1: `+1`/validated word, `+3`/round survivor, jurors unscored, 3 rounds.** | Participation reward + battle-royale stakes + honest jury. Shipped exactly in `JEU_DU_THEME_CONFIG`. |
| D17 | *Spicy content?* | **Ship v1: 100% safe (spicy 0).** 18+ theme pack later as a **sibling config + pack, zero code** — see §5. | Mechanic is already funny safe; platform spicy gating (minAge ≥ 18) covers the extension by pure content. |

No item left as TBD.

---

## 5. The 18+ spicy sibling config (concrete)

**Decision: ship a spicy tier later as a config + pack sibling, zero engine change.** The mechanic warrants it (a "name a word in *this* theme" loop is the most natural home in the catalog for filthy/transgressive themes, and the jury vote is *funnier* with edgier prompts). It is pure content + catalog gating, exactly the template+pack promise.

**Concrete sibling spec (`jeu-du-theme-18` catalog entry):**

```jsonc
// Catalog entry — same module createLastStanding(), DIFFERENT config + pack
{
  "id": "jeu-du-theme-18",
  "module": "LAST_STANDING",
  "config": { ...JEU_DU_THEME_CONFIG },     // IDENTICAL durations/scoring — mechanics do NOT change
  "tone": "spicy",
  "minAge": 18,                              // platform gate: spicy ⇒ minAge ≥ 18 (schema §2.7)
  "packIds": ["jeu-du-theme-spicy-fr", "jeu-du-theme-spicy-en"]  // SEPARATE pack ids, never mixed with safe
}
```

What changes and what does **not**:
- **Changes:** the pack only — separate pack ids, items at `spicy: 1|2` (pack tone = max over items ≥ 1), `minAge: 18` enforced at the catalog/lobby gate, `tone: 'spicy'` so the voice guide's spicy register applies to the themes.
- **Does NOT change:** every mechanic, duration, scoring constant, redaction rule, phase machine. `validWordPoints`, `survivorPoints`, `rejectThreshold`, the decaying clock, `deadPlayersJudge` — all identical. No reducer edit, no new action.
- **Anonymity / publicPicks:** unaffected — words are spoken not stored, votes are anonymous tally-only in both tiers; there is no per-player pick to make public. So no anonymity diff is needed (unlike pick-a-player games).
- **Letter-feasibility gate still applies** to spicy packs (≥ 15 common words / theme×letter×locale) — a spicy theme with an unplayable letter is still a quality failure.

This is a roadmap item (v1.x), gated on spicy-pack authoring + the platform's age gate being live, not a v1 launch artifact.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

Every field of `LastStandingConfig` is overridable per catalog entry, but the **lobby host allowlist** is deliberately small and safe (most timing constants stay catalog-locked to protect feel):

| Param | Control | Safe range | Default | Note |
|---|---|---|---|---|
| `totalRounds` | rounds picker | **2–5** | 3 | Big groups → 2 to keep total ~10 min. Clamped to `deck.length` at init. |
| spicy toggle | tier switch | safe / 18+ | safe | Selects the safe vs `jeu-du-theme-18` sibling (D17/§5); 18+ requires the lobby age gate. |
| `sayMs` | "speed" preset | **5 000–10 000** | 8 000 | Lower = faster/harder rounds (big-group preset uses 6 000). Floor still `minSayMs`. |
| `deadPlayersJudge` | "dead players vote" toggle | on / off | on | Off = tighter, less grudge-prone jury (D9 lever) but eliminated players go idle — surface only if telemetry warrants. |
| `allowGiveUp` | "surrender allowed" toggle | on / off | on | Off removes the `giveUp` escape (players must wait out the clock). |
| maxPlayers (entry) | room-size cap | **3–16** | 12 on default entry, 16 on custom | Default catalog entry caps at 12 for pacing (D11); custom rooms may raise to the module ceiling 16. |

**Catalog-locked (NOT host-tunable):** `sayDecayPerLapMs`, `minSayMs`, `drawMs`, `judgeMs`, `resultMs`, `roundEndMs`, `validWordPoints`, `survivorPoints`, `rejectThreshold`, `maxTurnsPerRoundFactor`, `difficultyCurve` — these define the game's feel and fairness and must not be hand-tuned in a casual lobby.

---

## 7. Future modes roadmap

| Mode | Decision | One-line spec |
|---|---|---|
| **Big-group config** | **Ship v1 (catalog config, no code).** | `jeu-du-theme-big`: `totalRounds 2`, `sayMs 6000`, maxPlayers 16 — keeps 12–16-player rooms under ~10 min (D11). |
| **18+ spicy sibling** | **Roadmap v1.x (config + pack, no code).** | `jeu-du-theme-18`: spicy packs, `tone:'spicy'`, `minAge 18`, identical mechanics (§5). Gated on spicy-pack authoring + age gate. |
| **Jury-weighting / kill grudge votes** | **Roadmap v2 (data-gated).** | Either flip `deadPlayersJudge=false` or weight alive-juror votes — *only if* analytics show eliminated-juror reject-rate abuse (D9). Default: ship neither. |
| **Themed packs (no code)** | **Roadmap v1.x (content-only).** | Curated packs via the 33 existing tags — e.g. `culture-pop`, `nourriture`, `humour` packs — same module, swapped content. |
| **"Name 3 in 5s" / TIMED_VERDICT absorption** | **Cut from this template.** | Originally floated as a LAST_STANDING config; design §5.5 routes it to PERFORM_JUDGE instead. LAST_STANDING stays a single-game template (D7). |
| **Difficulty-escalation v2 (`shuffled` curve, harder mid-game)** | **Roadmap v3 (config-only, optional).** | `difficultyCurve` already supports `'shuffled'`; a "chaos" entry could ship without code if playtests want unpredictability. Default stays `ascending`. |
| **Typed-word / dictionary variant** | **Cut permanently.** | Violates the spoken-only, zero-moderation, no-dictionary core (D1/D6). Never build. |

---

## 8. Risks & content-ops notes

**Pack sizing / lint.**
- Floor: `items ≥ totalRounds`; recommended `≥ 3×`. Current pack ships **105 items** — vastly above floor, big no-repeat headroom. Lint must also assert **letter lists 6–10 per locale** (current: 6–9 ✓) and **theme ≤ 80 chars** (current: max 80 ✓).
- Difficulty buckets must each be non-empty for the `ascending` curve: current 66/33/6 (diff 1/2/3) ✓ — but the **6 diff-3 items are thin**; if a future config raises `totalRounds` and biases toward late buckets, top off diff-3 to avoid early deck exhaustion.

**Feasibility gate (quality-critical, BLOCKING).**
- A mis-scored letter list creates an unplayable turn the player experiences as injustice. The offline `≥ 15 common words / (theme × letter × locale)` gate (LLM + wordlist cross-check) is **blocking before publish**. The fr/en lists intentionally diverge — but the runtime intersection-merge means a letter must be feasible in **both** locales to be the shared spoken letter; the publisher split step (D15) must verify parallel coverage.

**Freshness / decay.**
- Themes are evergreen but a few are dated by reference ("ça existait pas il y a 30 ans", app-name themes like `jdt-applis-092`). Schedule a content review: refresh culture/tech themes (`tags: tech, pop`) on a slower cadence; the 105-item base resists repeat fatigue but topical items age fastest.

**Moderation surface.**
- **Smallest in the catalog by construction.** No typed text anywhere (`actions.ts` is `wordSaid` / `giveUp` / `judge{valid|reject}` only) — zero UGC. Spoken words are unmoderable but unrecorded and un-broadcast; the only surface is the **authored pack themes**, moderated once at authoring time. Residual griefing (spoken slurs in-room) is handled by lobby report/kick/block, not the engine.
- **Redaction audit** must keep targeting: undrawn `deck`/`themeCursor` theme texts, the `judgeVotes` mapping (publish tally counts only), and `exampleWords` (stripped at publish). The `over` view ships only `scores`, `rotation`, `wordsValidated` — no secrets.

**Analytics to watch post-launch.**
- `turn_resolved {outcome}` outcome mix (timeout/gaveUp/rejected/left rates) — high `timeout` may mean the clock is too tight for some packs.
- Eliminated-juror reject-rate vs alive-juror reject-rate — the D9 grudge-jury tripwire.
- `round_completed` cadence (round length at 12–16 players) — validates the big-group config (D11).
- `room_collapsed` rate — drop-off / sizing signal.
