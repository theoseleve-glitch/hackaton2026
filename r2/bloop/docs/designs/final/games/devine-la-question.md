# devine-la-question — Devine la Question / Guess the Question

> **Status: SHIPPED.** This document is the finalized design of the implemented game. Section 2 is authoritative and quotes the shipped module (`packages/games/spotlight-guess`, `DEVINE_LA_QUESTION_CONFIG`). Sections 4–7 resolve every deferred/open/v2/spicy item to a FINAL ruling.

| Field | Value |
|---|---|
| **Game id** | `devine-la-question` |
| **Name (FR / EN)** | Devine la Question / Guess the Question |
| **Tagline** | « Tu as sa réponse. Mais c'était quoi la question ? » / "You've got their answer. But what was the question?" |
| **Template + mode** | `SPOTLIGHT_GUESS` mode `reverse-question` (the wave-2 `REVERSE_GUESS` proposal, consolidated into the shared spotlight machine) |
| **Players** | **min 3, max 16** (from the module: `minPlayers: 3, maxPlayers: 16` — 1 mystery player + ≥2 guessers for social spread) |
| **Spicy tier** | **0** (pack-level `spicyLevel: 0`; all 30 shipped items `spicy: 0`) |
| **Physical** | **seated** (phone-driven, no standing/movement) |
| **Module version** | `version: 1` |
| **Offline AI** | yes — `needsOfflineAiPipeline: true` (content op only; zero runtime AI) |

---

## 1. Pitch & room fantasy

**One-line pitch.** One player privately answers a secret question and shows only the answer; everyone else races to lock *which* of five questions it was answering, before the hints make it obvious and the points decay.

**The room fantasy.** The screen shows a bare, naked answer — *"I've lost count"* — and a list of five questions it could be answering. One is the truth. The other four are escalating accusations the room finds *plausible*: "How many times have you ghosted someone?", "How many times have you stalked someone in this room?" The comedy is the gap between the innocent real question and what the table is willing to believe the answer was for. The mystery player squirms because the decoys are funnier — and more incriminating — than the truth, and they can't say a word. The argument it manufactures is the lock-tier gamble: do you slam tier 0 for 300 points on a hunch and look like a genius, or wait for a hint, score 100, and play it safe? The reveal — every pick and tier flipped public at once — is the "TOI t'as voté ÇA ?!" payoff: you didn't just get it wrong, you publicly believed your friend ghosted someone in this room.

---

## 2. Shipped ruleset (AUTHORITATIVE)

All numbers below are read directly from `DEVINE_LA_QUESTION_CONFIG` (`state.ts:103–122`) and the reducer (`spotlight-guess.ts`, `resolve.ts`).

### 2.1 Phases (phaseKey + duration from the module)

`phaseDurationMs` and `phaseKey` are computed in `spotlight-guess.ts:311–331`. The interstitial ad fires CLIENT-SIDE off the `phaseKey` transition into `scoreboard:*` (server-shell design, never a reducer effect).

| Phase | `phaseKey` | Duration (ms) | Const | Beat |
|---|---|---|---|---|
| answer | `answer:r{round}` | 20 000 | `answerMs` | Mystery player (spotlight) privately sees the real question + its 3–4 honest-answer options and picks one. Everyone else sees only "X is answering a secret question…" — **no question, no options, no candidates** (zero leak). Early exit: answer submitted → `guess` at `hintTier 0`. |
| guess h0 | `guess:r{round}:h0` | 20 000 | `hintIntervalMs` | All see the chosen ANSWER + 5 seed-shuffled candidates (1 real + 4 decoys). Lock ONE (first-write-wins). A correct tier-0 lock = **300**. View exposes `locked` booleans only. |
| guess h1 | `guess:r{round}:h1` | 20 000 | `hintIntervalMs` | Hint #1 public. Unlocked guessers may still lock; tier-1 correct = **200**. |
| guess h2 | `guess:r{round}:h2` | 20 000 | `hintIntervalMs` | Hint #2 public (last chance). Tier-2 correct = **100**. Deadline → reveal regardless. |
| reveal | `reveal:r{round}` | 8 000 | `revealMs` | Atomic promotion: real question highlighted among candidates, every pick + lock-tier flips public, points count up, reader bonus shown. Emits `round_revealed {round, correct}`. |
| scoreboard | `scoreboard:r{round}` | 6 000 | `scoreboardMs` | Running totals. Inserted every `scoreboardEvery: 2` rounds **and always once before `over`** — this is the ad slot. |
| over | `over` | `null` (untimed) | — | Terminal. Reducer is a no-op on every event; emits `gameOver(scores)` once on entry; shell awards session XP by placement. |

`totalRounds: 6`. Within a round the `guess` phase re-arms the single alarm on each hint tier because `phaseKey` changes (`guess:r{n}:h0 → h1 → h2`); the secret (`realIndex`) is NEVER embedded in `phaseKey` or analytics.

**Round length.** Best case (room locks fast at h0, early-resolve): ~28 s (20 answer + ~few s guess + 8 reveal). Worst case (nobody locks early): 20 + 20 + 20 + 20 + 8 = **88 s** of run, plus a 6 s scoreboard every 2 rounds.

### 2.2 Scoring (exact constants from `resolve.ts:114–137`)

- `tierPoints: [300, 200, 100]` — a correct lock pays `tierPoints[lockTier]`. Wrong lock or no lock = 0.
- **Mystery player (spotlight):** `readerPointsPerCorrectGuess: 75` × (number of correct guessers). This is the alignment trick — a troll answer that nobody can decode scores the answerer **0**, so the incentive is to pick the answer that is recognizably *them*.
- **Voided round:** all `gained = 0` (mystery player included), via `voidRound()` (`resolve.ts:62–73`).
- Scores accumulate into `state.scores`; `lastGained` holds the last round's deltas (public from reveal).

**Internal scale note (platform invariant).** This game keeps its own raw point scale (hundreds). Cross-game session XP is **placement-based** (cross-game-synthesis §1.7) — the shell ranks final `scores` and awards XP off placement, so the 300/200/100 scale never needs to be comparable to other games' scales.

### 2.3 Win / draw / tie

- The module is **pure score accumulation** with no explicit winner field. At `over` the view returns `{ scores }` cloned; the shell ranks players by total `scores` descending for the scoreboard and for placement XP.
- **Ties** are not broken inside the game — equal totals place equally; the shell's placement XP handles equal placements. (No tiebreak rule exists in the shipped code, and none is needed: placement XP tolerates ties.)

### 2.4 Presence / disconnect (from `spotlight-guess.ts:190–212`, `resolve.ts`)

- **Mystery player leaves during `answer`** (the secret-keeping beat) → round **VOIDED** immediately (`voidRound`): jump to a voided reveal, 0 points, hidden buffer dropped. The room never stalls on a ghost.
- **Answer deadline with no answer submitted** → same void (`reduce` deadline case `answer` → `voidRound`).
- **Mystery player leaves during `guess`/`reveal`** → harmless: `chosenAnswer` is already public, no void.
- **Guesser leaves during `guess`** → marked disconnected; the round re-checks `allActed(expectedGuessers, guesses)` — their absence can *complete* the expected set and resolve early. Never blocks.
- **`expectedGuessers`** = connected players minus the spotlight. A guesser must be `connected === true` to submit (a guess from a disconnected player is a no-op).
- **Rejoin** → `connected = true`; only ADDS an expected actor, no resolve re-check needed.
- **Next-round spotlight** uses `nextActiveSeat(turnOrder, spotIndex, connected)` — rotation skips disconnected players.
- **Abstention is free:** a guesser who never locks simply scores 0; deadline at h2 resolves regardless.

### 2.5 Redaction (what's secret from whom — `view()` `spotlight-guess.ts:266–308`)

| Phase | Mystery player (spotlight) sees | Everyone else sees |
|---|---|---|
| `answer` | `question` (real text), `answers` (options), own pick echo | `{ spotlightId, scores }` — **NO question, NO options, NO candidates** (an option list paired with later candidates could triangulate the real question) |
| `guess` | + `myRealIndex` (their own secret) | `chosenAnswer` text, `candidates[]`, `hintTier`, `hintsRevealed[0..hintTier]`, `locked` (booleans ONLY), `myGuess` (owner echo only). **NEVER:** `realIndex`, any other player's pick value |
| `reveal` | all public | `realIndex`, per-player `picks {value, tier}`, `gained`, `voided`, `scores` |
| `scoreboard` / `over` | standings + scores only |

**Per-round secrets:** `realIndex` and the `guesses` buffer. The candidate list is a **seeded shuffle** of `[real, ...decoys]` (`init` `spotlight-guess.ts:71–85`) so the real question is never first-by-default. `myGuess` is an owner-echo (each player sees only their own lock).

---

## 3. Content model

### 3.1 Pack item shape (runtime `ReverseItem`, `state.ts:35–45`)

```jsonc
{
  "id": "q_mirror",                    // stable id
  "question": { "fr": "...", "en": "..." },   // the secret real question, ≤140 chars
  "answers":  [ {fr,en}, ... ],        // 3–4 honest-answer options the mystery player picks from
  "decoys":   [ {fr,en} x4 ],          // exactly decoyCount(4) fake questions, same register/length
  "hints":    [ {fr,en} x2 ],          // exactly hintTiers-1(2), least→most revealing, never quoting the question
  "tags":     ["habits","silly"],      // theme/curation
  "spicy":    0                        // 0|1|2 (pack-level tone gates the catalog)
}
```

At `init` the module seed-shuffles items, takes `min(totalRounds, items.length)`, and per item seed-shuffles `[real, ...decoys.slice(0, decoyCount)]` into `candidates`, storing `realIndex` as HIDDEN state. `hints` are sliced to `hintTiers - 1 = 2`.

**Cross-plausibility is the whole game:** each `answer` option MUST read as a sane answer to the real question AND to all 4 decoys. This is the offline-AI scoring target.

### 3.2 Shipped pack (`content/packs/devine-la-question.json`, version 1)

- **30 items** — all `spicy: 0`. Comfortably clears the sizing lint (`≥ totalRounds(6)` minimum, 40+ recommended — see §8 for the gap).
- Every item validated: 4 decoys, 2 hints, 3 answers each (0 below minimum).
- Tags span: habits, silly, social, money, tech, hypothetical, work, relatable, self, room, food, debate, childhood, home, sleep, confession, hygiene, music, party.
- **Precomputed offline (already authored into the pack):** the `candidates` are seed-shuffled at runtime, but the `decoys` and `hints` themselves are pre-authored content-pipeline output. There is **no runtime AI**; the offline pipeline (decoy + hint generation → cross-plausibility scoring → standard gate) writes the strings into the pack before any KV flag flip.

### 3.3 Voice / tone note (content-voice-guide §5 #11)

**"The decoys do the dirty work."** The comedy is what the answer COULD have been answering: **decoy questions must be more incriminating than the real one** ("'Trois fois' — répond-il à…"). Write decoys as **escalating accusations**; the mystery player squirming at what the room considers plausible IS the game. **Hints are dry, withholding, slightly disappointed.** The shipped pack already does this — e.g. `q_mirror` real question is innocent ("how often you check the mirror") but its decoys escalate to "how many times have you stalked someone in this room's profile?", and its hints land deadpan ("The person you keep staring at is you."). All lines pass the hard floor (§3 of the voice guide): behavior/choices/confession only, no protected-trait punching.

---

## 4. RESOLVED DECISIONS

Every former defer / open-question / spicy / hostTunable / v2 bullet from §2.11, the recommendations[], and the risks[] — each resolved to a FINAL ruling.

| # | Was (deferred / open / risk) | FINAL decision | One-line spec / why |
|---|---|---|---|
| D1 | **Co-founder's open Q:** app-driven hints, player-given hints, or full autonomy (no app)? | **Ship v1 — app-driven PRE-AUTHORED progressive hints** (`hintTiers: 3`, 2 hints from the pack, one per deadline). | Full autonomy needs no app (no timers/scoring/reveal/ads). Player-given hints break never-block, are unscorable, and open free-text moderation. Pre-authored is the only deterministic-runtime form AND it creates the 300/200/100 ladder. **Shipped exactly this.** |
| D2 | Hint cadence — brief suggested 30 s? | **Ship v1 — 20 s/tier** (`hintIntervalMs: 20000`). | 30 s × 3 = 90 s breaks TikTok pacing; early-resolve on all-locked yields ~35–45 s real tables. **Shipped.** |
| D3 | Guess input — free text or MCQ? | **Ship v1 — MCQ** (1 real + `decoyCount: 4` decoys, seed-shuffled). | Free-text question matching is deterministically undecidable and opens moderation; the decoys are the comedy. Players still shout guesses aloud. **Shipped.** |
| D4 | Lock semantics — last-write-wins or lock-on-submit? | **Ship v1 — lock-on-submit** (`lockOnSubmit: true`, first write wins). | Editable picks let everyone park at tier 0 and edit with tier-2 info, collapsing the ladder. Commitment is the skill. **Shipped (`spotlight-guess.ts:155`).** |
| D5 | Does the mystery player score? Does scoring corrupt honesty? | **Ship v1 — +75/correct guesser** (`readerPointsPerCorrectGuess: 75`), **no honesty enforcement**. | Alignment trick: a troll answer nobody decodes scores 0; honesty is incentive-designed, not reducible. **Shipped.** |
| D6 | Config of HOT_SEAT, or new code? | **Resolved — new template `SPOTLIGHT_GUESS`, `reverse-question` mode** (2nd mode of a shared 2-mode module). | Sequential answer→guess, per-round redacted secret, hint-tier sub-phases, tier-decaying points = a different state machine. Consolidated with `jeu-de-la-note` into one reducer. **Shipped.** |
| D7 | What does the offline AI pipeline produce? | **Resolved — content op:** generate decoys + hints, **cross-plausibility score** (each answer plausible for real AND all 4 decoys; hints narrow without revealing), auto-reject below threshold, standard gate (schema/profanity/FR-EN naturalness/replay smoke), **per locale independently**, KV flag flip at rolloutPct 5. | AI is offline content, never a runtime dependency. **Pack v1 already authored under this gate.** |
| D8 | **"sprint" 2-tier mode** (risk lever for worst-case ~88 s rounds, big rooms) | **Roadmap v2 — Cadence-B config, no deploy.** Spec: `hintTiers: 2, hintIntervalMs: 15000, tierPoints: [250, 100]`. | A pure `game_config` on the same module (params schema allows `hintTiers 2..4`, `hintIntervalMs 10000..40000`). Ship behind a lobby pack/mode pick once analytics show drag in 12–16 rooms. |
| D9 | **Spicy pack variant** (mentioned as a future Cadence-B config) | **Roadmap v2 — see §5** (spicy-1 sibling pack; same module, no code). | The module is content-agnostic; a spicier pack is a content op, not a deploy. Decided concrete config in §5. |
| D10 | **Themed packs** (future variants) | **Roadmap v2 — Cadence-B content ops** (e.g. `couples`, `work`, `soirée`). | Pure new pack ids on the shipped module; gated by the same §7 offline pipeline. Tag taxonomy already exists in v1. |
| D11 | Decoy quality is load-bearing (weak = trivial 300s; over-clever = 20% lottery) | **Resolved — offline cross-plausibility scoring + 5% analytics gate.** Targets: **~25–40% correct at tier 0, ~70%+ by tier 2**, watched per-tier via `round_revealed {correct}`. | Decoy quality IS the difficulty curve. Pipeline auto-rejects weak items; rollout watches correct-rate-by-tier histogram. |
| D12 | Redaction leak risk (`realIndex` / guesses buffer per-round secrets) | **Resolved — shipped mitigations:** seeded candidate shuffle, `locked` booleans-only in `guess`, field-level view tests (answer-phase guesser views carry no question/options; guess-phase guesser views carry no `realIndex`/picks map), `leakedSecrets` audit, replay test pinning pack version. | Mandatory and present in the shipped redaction matrix (§2.5). |
| D13 | Answerer no-show voids the round (flaky host could void several) | **Resolved — accept void-on-no-show**, monitor voided-rate at 5% rollout; shell grace/rejoin + 20 s window keep it rare. | Correct for never-block. The 20 s `answerMs` is the host-tunable safety lever (10 000–45 000). |
| D14 | Tier-camping meta (everyone waits for hint 2 ⇒ gradient too flat) | **Resolved — `tierPoints` is a tunable config param**, retune without deploy if playtests show camping. | Default `[300, 200, 100]` ships; the 3× spread between tier 0 and tier 2 is the lever. No code change to adjust. |
| D15 | Mystery-player trolling (random answer to confuse) | **v1: soft-mitigated by reader points (out of scope to harden).** Roadmap v3 candidate only — see §7. | +75/correct already punishes trolls (0 if undecodable). A "group calls bluff" verdict is explicitly out of scope for v1; revisit only if analytics show high troll rates. |
| D16 | Bilingual cross-plausibility must hold in BOTH locales independently | **Resolved — per-locale offline gate (doubled curation), enforced.** | The §7 pipeline runs schema + naturalness + cross-plausibility per locale; transcreate-never-translate (voice guide §6). Pack v1 authored under this. |
| D17 | Item-ambiguity vs honesty authoring corridor (vague enough for 5 Qs, specific enough to feel personal) | **Resolved — the 40+ vetted-item bar is the mitigation;** v1 ships 30, roadmap to 40+ (§8). | Narrow corridor is why sizing lint recommends 40+. Pack is at 30 (above the hard `≥6` minimum); close the gap before broad launch. |

---

## 5. The 18+ spicy sibling config (concrete)

**Decision: ship a spicy-1 sibling pack as a Cadence-B content op (Roadmap v2), NOT an 18+/spicy-2 tier.**

**Reasoning for the tier choice.** This game's edge engine is *the decoys*, and per the voice guide the decoys are already allowed to escalate to social-cruelty/exposure territory at **spicy 0** ("how many times have you stalked someone in this room"). The mechanic has **zero free text and zero real-device dares** — its entire moderation surface is the authored pack. The natural escalation here is *exposure/innuendo* (spicy 1: "the question your answer could've been answering" gets to be a dating/ex/phone-secrets question), not explicit sex (spicy 2). A spicy-2/18+ tier is **possible** on the same module but **not warranted at launch**: the format's comedy peaks on the *gap* between innocent answer and incriminating implied question — which is exactly the spicy-1 "screenshot-clean text, socially-radioactive answer" sweet spot (voice guide §3, Spicy 1). Spicy 2 would mostly add anatomy the format doesn't need.

**Spicy-1 sibling — exact config diff (module unchanged, content op only):**

| Field | v1 base (`devine-la-question`) | Spicy-1 sibling |
|---|---|---|
| `gameId` / catalog id | `devine-la-question` | `devine-la-question` (same tile) |
| pack id | `devine-la-question` (v1) | `devine-la-question-spicy` (new pack id) |
| `spicyLevel` (pack) | 0 | **1** |
| item `spicy` tags | all 0 | 1 (with a 30–40% spicy-0 palate-cleanser mix per voice guide §3) |
| `minAge` (catalog gate) | none | **none** (spicy 1 is *taboo-adjacent*, not 18+; no age gate, opt-in toggle only) |
| anonymity / `publicPicks` | picks public at reveal (mechanic) | **unchanged** — picks still public at reveal; this is core, not a spicy lever |
| mechanics / reducer | — | **unchanged** (same module, same params) |
| topics added | habits/social/silly | dating exes, the ick, situationships, phone-secrets (search history / DMs / camera roll) **as hypotheticals & confessions** — never a real device action |

**Spicy-2 / 18+ tier: NOT shipped, NOT roadmapped as a separate pack** unless a `couples`/`soirée arrosée` themed pack later demands it. If it ever ships, it would be: `spicyLevel: 2`, `minAge: 18`, age-gated catalog entry, opt-in only, one-sip-only forfeit phrasing N/A (no drinking mechanic here), same module/params. Hard floor (§3 voice guide) applies at every tier.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

These map to the design's `templateParamsSchema` (`.strict()`) for `game_config` and the platform host-tunable allowlist. Spicy toggle / pack pick is a catalog/lobby concern, not a numeric param.

| Param | Default (shipped) | Safe range | Notes |
|---|---|---|---|
| `totalRounds` | 6 | **1–10** | Caps at `items.length`; lower for a quick game, higher for a long session. |
| `answerMs` | 20 000 | **10 000–45 000** | The mystery player's pick window; raise to reduce voided-round rate on flaky tables (D13). |
| `hintTiers` | 3 | **2–4** | 2 = the "sprint" lever (D8); `tierPoints.length` must equal this. |
| `hintIntervalMs` | 20 000 | **10 000–40 000** | Per-tier guess window; shorter = faster, more tier-0 pressure. |
| `decoyCount` | 4 | **3–6** | Candidate count = `decoyCount + 1`; wire schema caps guess index at 7, so keep `decoyCount ≤ 6`. |
| `tierPoints` | `[300, 200, 100]` | ints, `length === hintTiers` | The camping lever (D14); widen the spread to punish waiting. |
| `readerPointsPerCorrectGuess` | 75 | **0–500** | Mystery-player reward; 0 disables the alignment incentive (not recommended). |
| `scoreboardEvery` | 2 | **1–8** | Ad-slot cadence; `0` = final-only. Subject to remote-config ad caps. |
| **spicy / pack toggle** | spicy-0 pack | enum: `base` \| `spicy-1` \| themed | Lobby pack pick (catalog gate), not a numeric param. |

`revealMs (8000)` and `scoreboardMs (6000)` are platform-paced beats — **not** host-tunable (kept off the allowlist to protect the reveal/ad cadence).

---

## 7. Future modes roadmap (v2 / v3)

| Mode | Decision | One-line spec |
|---|---|---|
| **Sprint (2-tier)** | **Ship-later v2 — Cadence-B config.** | `hintTiers: 2, hintIntervalMs: 15000, tierPoints: [250, 100]` — caps worst-case round at ~58 s for big/slow tables. No deploy. |
| **Spicy-1 sibling pack** | **Ship-later v2 — content op (see §5).** | New `devine-la-question-spicy` pack id, `spicyLevel: 1`, exes/phone-secrets topics; module unchanged. |
| **Themed packs** (`couples`, `work`, `soirée`) | **Ship-later v2 — content ops.** | New pack ids on the shipped module; gated by the §3.2/D7 offline pipeline; tag taxonomy already in v1. |
| **"Group calls bluff" verdict** (anti-troll mystery-player check) | **Roadmap v3 — gated on analytics; cut if troll rate stays low.** | After reveal, room votes whether the mystery player answered honestly; dishonest verdict zeroes their reader bonus. Adds a vote sub-phase — only build if 5% rollout shows high troll rates (D15). Default: **cut**. |
| **Free-text guessing** | **CUT — permanently.** | Deterministically undecidable + opens moderation surface (D3). MCQ is final. |
| **Player-given / typed hints** | **CUT — permanently.** | Breaks never-block, unscorable, free-text moderation (D1). Pre-authored hints are final. |
| **Full-autonomy (no-app) mode** | **CUT — permanently.** | No timers/scoring/reveal/ads = a parlor game we'd give away, not a Bloop game (D1). |

---

## 8. Risks & content-ops notes

- **Pack sizing lint — ACTION ITEM.** Shipped pack is **30 items**, above the hard floor (`≥ totalRounds = 6`) but **below the 40+ recommended** bar that the narrow item-ambiguity corridor (D17) demands for replay-freshness. **Decision: ship at 30 for launch; content-ops backlog item to reach 40+ before broad marketing push.** Lint should warn (not block) between 6 and 40, block below 6.
- **Decoy-quality monitoring (D11).** Watch `round_revealed {round, correct}` per tier at 5% rollout. Target ~25–40% correct at tier 0, ~70%+ by tier 2. Items that produce ~100% tier-0 correct (trivial decoys) or <20% by tier 2 (lottery) get pulled and re-authored offline.
- **Freshness / decay.** With 6 rounds drawn from 30 items, repeat-collision risk rises across sessions for the same group. Mitigation: grow to 40+ (above), then themed-pack rotation. No per-room memory exists (anonymous-forever, SQLite TTL-wiped) so freshness is a *pack-size* problem, not a *recency-tracking* one.
- **Moderation surface — minimal.** Zero free text anywhere (actions are `answer{index}` / `guess{value}`, zod-validated at the DO boundary). The **entire** moderation surface is the authored pack, vetted offline per locale (D16). This is the game's safest property and the reason a spicy-1 sibling is low-risk.
- **Voided-round rate (D13).** Monitor `round_skipped` at 5% rollout. If flaky-host voids spike, raise `answerMs` toward 45 000 (host-tunable) before any code change.
- **Bilingual gate (D16).** Cross-plausibility must hold independently in FR and EN — every new pack runs the full offline gate per locale; transcreate, never translate (voice guide §6).
- **Redaction audit (D12).** `realIndex` + guesses buffer are per-round secrets; the `leakedSecrets` audit + field-level view-serialization tests + seeded candidate shuffle are mandatory on every content/config change and pinned by a pack-version replay test.
