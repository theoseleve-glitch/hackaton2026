# Trouvez la Règle / Find the Rule — Final Design (SHIPPED)

| Field | Value |
|---|---|
| **Game id** | `trouvez-la-regle` |
| **Names** | FR **Trouvez la Règle** · EN **Find the Rule** |
| **Template + mode** | `RULE_HUNT` (new template; this game is its sole v1 inhabitant) |
| **Module id / version** | `rule-hunt` · v1 |
| **Players** | **4–16** (`minPlayers: 4`, `maxPlayers: 16` from the module) |
| **Spicy tier** | **0** (all-ages-but-punchy; pack ships `spicy: 0` on every item) |
| **Physical** | **mixed** (seated voting on phones; standup/gestural performance in the room) |
| **Status** | **SHIPPED** — reducer + round helpers + views + zod schema + bilingual 63-item pack all present and tested |

Source of truth: `packages/games/rule-hunt/src/{state,rule-hunt,round,actions,index}.ts`, `content/packs/trouvez-la-regle.json`, design `2026-06-11-wave2-17-games-design.md` §2.16, voice guide `2026-06-12-content-voice-guide.md` §5.16.

---

## 1. Pitch & room fantasy

**One-liner:** The whole room is secretly obeying one behavioral rule — except 1–2 publicly-known detectives who must crack it before a banked 3-minute clock runs out, while the room performs *at* them and quietly snitches on its own slip-ups.

**Room fantasy — heist tension, snitch economy.** The followers are a conspiracy with a shared secret (« touche ton oreille avant chaque phrase »); the detectives are the police, named and surrounded, watching a room that is performing a normal evening that is subtly, hilariously *wrong*. The genius loop is the **tribunal**: the only way to enforce the rule is to accuse a suspected breaker out loud — and every conviction is a giant flashing clue for the detective (« qu'est-ce que Léa vient de faire ?! »). So the manufactured argument is the betrayal: do you snitch on your own teammate to keep the conspiracy clean, knowing the accusation itself hands the enemy the answer? A **crime parfait** (zero convictions, never guessed) is the bragging-rights top prize; getting **vendu par les tiens** is the comedy of the night. The laugh is watching twelve people over-act a cover story while one cop slowly loses their mind.

---

## 2. Shipped ruleset (AUTHORITATIVE)

Canonical config — `TROUVEZ_LA_REGLE_CONFIG` (`state.ts`):

```ts
totalRounds: 3, briefingMs: 20_000, liveMs: 180_000, tribunalMs: 25_000,
guessMs: 20_000, revealMs: 12_000, detectiveCount: 'auto', teamGuesses: 3,
candidateCount: 8, accusationsPerPlayer: 1
```

`init` caps `totalRounds = min(config.totalRounds, items.length)` → with 63 items, **3 rounds**.

### Phases (real `phaseKey` + durations)

| phaseKey | Duration | Behaviour |
|---|---|---|
| `briefing:r{r}` | **20 s** (`briefingMs`) | Detectives publicly announced; each connected follower privately reads the rule and taps `ackRule`. Early-exits when `allActed(connectedFollowers, ackRule)`; deadline → live regardless. Detectives can't ack (inert). |
| `live:r{r}:s{seg}` | **`liveRemainingMs`** (starts 180 s, banked across interrupts) | Free play. `accuse` → bank clock, `interruptSeq++`, → tribunal. `openGuess` (detective) → bank clock, `interruptSeq++`, → guess. Deadline → reveal `timeUp`. `liveSeg` increments on every resume so the shell re-arms the **shorter** remainder. |
| `tribunal:r{r}:i{n}` | **25 s** (`tribunalMs`) | Eligible voters cast `tribunalVote`; first vote locks. All-acted or deadline → resolve. |
| `guess:r{r}:i{n}` | **20 s** (`guessMs`) | Opening detective only `pickCandidate`. Correct → reveal `guessed`. Wrong → grey it, spend attempt, resume. Deadline → attempt spent with no pick (anti-stall). |
| `reveal:r{r}` | **12 s** (`revealMs`) | Rule + outcome + points shown; scoring applied on entry; `round_completed` fired. Deadline → next round or `over`. |
| `over` | **untimed** (`phaseDurationMs` → `null`) | Standings; `gameOver(cloned scores)`. Globally inert. |

The **banked clock** (`bank()` in `round.ts`) is pure event-`at` arithmetic: `max(0, liveRemainingMs − max(0, at − segmentStartedAt))`. No wall clock ever enters the module — fully replay-deterministic.

### Detectives & rotation
- `detectiveCount: 'auto'` → **1 detective for 4–7 players, 2 for 8–16** (`resolveDetectiveCount`). Two detectives **share one pool of 3 guesses**.
- `init`: `detectiveOrder = shuffle(rng, players)` (HIDDEN — future rotation is a spoiler). Each round takes the next `count` connected ids consecutively with wraparound; a disconnected scheduled detective is skipped forward.

### Scoring (exact — `scoreRound`, applied on reveal entry, accumulates across the 3 rounds)

| Outcome | Detective | Surviving follower | Eliminated follower |
|---|---|---|---|
| **`guessed`** (correct pick) | **+4** | **+1** | **0** |
| **`timeUp` + perfect** (0 convictions) | **+1** | **+3** | — (no one eliminated) |
| **`timeUp`, not perfect** | **+1** | **+2** | **+1** (took the fall — funny never cruel) |

Tribunals and wrong guesses move **no points directly**; their cost is the spent token/attempt and the information leaked. `perfect = (infractions === 0)`.

### Win / draw / tie
No bespoke winner field: `gameOver(over.scores)` emits the cloned accumulated `scores` map at `over`; the **shell** ranks them and awards cross-game session XP by **placement** (not raw points), per cross-game-synthesis §1.7. Internal ties are simply equal scores — the shell's placement logic owns tie-handling. There is no "team win/lose" verdict baked into the reducer; standings are individual cumulative points across all rounds.

### Presence / disconnect (`playerLeft` / `playerRejoined`)
- `playerLeft` sets `connected[p] = false` **only** — never eliminates, never rescores. A leave can *complete* an expected set (ack/vote/guess) so an absent player never stalls past a deadline.
- Accused leaves mid-tribunal → vote proceeds normally (no auto-conviction).
- Guesser leaves mid-guess → resolved as a deadline (attempt spent, resume).
- All detectives disconnected → round runs out its clock (followers cruise); rotation `pickDetectives` degenerate-fills to keep round structure honest.
- **Room collapse:** at any resolution point, `connectedPlayers < 3` → `over`, `endReason: 'roomCollapsed'`, `gameOver(current scores)`.
- `resumeLiveOrReveal` also reveals `timeUp` early if `aliveConnectedFollowers < 2` (too few people left to behave normally).

### Redaction (what's secret, from whom)
- **`myRule`** (the secret rule text): **followers only, including eliminated followers** (they knew it); `null` for detectives and unknown viewers until reveal.
- **`trueCandidateIndex`**: NEVER serialized pre-reveal.
- **`candidateTexts`** (guess grid): visible to all **roster** players in **byte-identical order** (no per-viewer reorder side-channel); **OMITTED (`null`) for unknown viewers** — a spectator must not get a 1-in-8 shortlist of the secret. Followers see it (they know the rule anyway; the room sweats with the detective).
- **Tribunal ballots:** raw `votes` map never serialized; views expose only `hasVoted` booleans + `myVote` owner-echo; aggregate `tally` + `abstained` published only after resolution via `lastTribunal`.
- **`detectiveOrder`** never appears in any view.
- **`items`** (full shuffled pool) HIDDEN — future rounds' rules are spoilers.

---

## 3. Content model

**Pack item shape** (`RuleItem`, `state.ts` + authored pack):
```ts
{ id: string,                            // kebab, e.g. "rh-no-yes"
  category: 'gesture' | 'verbal' | 'social',
  difficulty: 'easy' | 'medium' | 'hard',
  spicy: 0 | 1 | 2,                       // item rating; pack tone gates it
  rule: { fr: string, en: string },      // imperative, ≤120 chars/locale; followers-private, public at reveal
  decoys: Array<{ fr, en }> }            // EXACTLY candidateCount-1 = 7, same category, mutually distinct under normalizeText
```
Runtime guess grid = `shuffle(rng('{seed}:grid:{round}'), [rule, ...decoys])` → `candidateTexts` (publishable) + `trueCandidateIndex` (hidden).

**How many ship:** `content/packs/trouvez-la-regle.json` v1 — **63 items**, balanced **21 gesture / 21 verbal / 21 social**, difficulty mix **23 easy / 25 medium / 15 hard**, **all spicy 0**, every item carries **exactly 7 decoys** (lint-verified). The pack is the **bilingual authoring source** (no `locale`/`tone` keys); the offline pipeline splits it into sibling single-locale runtime packs `trouvez-la-regle-fr` / `-en` (synthesis §3.1; the shell resolves locale at `startGame`).

**AI-precomputed offline:** the **decoys** are the AI artifact (`needsOfflineAiPipeline: true`). The offline pipeline generates and scores 7 same-category plausible alternates per rule for plausibility + mutual distinctness under `normalizeText`, profanity-scans them, and runs a human playtest gate before `enabled = true`. **No live AI at runtime** — the guess is a deterministic index compare against pre-computed decoys.

**Voice/tone note (§5.16 — "heist tension, snitch economy"):** Followers are a conspiracy; detectives are the police; **convictions are betrayals** and copy treats them as such (« Vendu par les tiens. La règle survit. »). Tribunal language throughout (accusation, conviction); a perfect round = **« crime parfait »**. The voice rewards loyalty-under-pressure and mocks snitches affectionately. The shipped rule/decoy lines already carry this register (« Ta main droite est en garde à vue », « comme un suspect qui va craquer »).

---

## 4. RESOLVED DECISIONS

Every former defer / open-question / recommendation → a **final** ruling.

| # | Was (deferred / open / recommendation) | FINAL decision | Why |
|---|---|---|---|
| D1 | *"un ou deux joueurs" — how many detectives?* | **Ship v1: `detectiveCount: 'auto'`** = 1 for 4–7p, 2 for 8–16p; host-overridable to 1\|2. | Shipped in `resolveDetectiveCount`. Small rooms need followers to behave normally; big rooms can't be watched by one. |
| D2 | *"X minutes" — live clock length?* | **Ship v1: `liveMs: 180_000` (180 s)**, host range 120–300 s. | ~4.5 min/round, ~13 min session — TikTok-native pacing. |
| D3 | *How to judge "la règle a été devinée" with no runtime AI?* | **Ship v1: 8-candidate grid, deterministic index compare** (`candidateCount: 8`). | Free-text matching is non-deterministic/unfair; decoy grid is instant + dramatic; decoy gen is the offline pipeline's job. |
| D4 | *How are infractions detected when the app can't see the room?* | **Ship v1: follower self-policing** — 1 token each (`accusationsPerPlayer: 1`) → 25 s tribunal → conviction eliminates. | The honor system needs a social check; the tribunal-as-clue loop is the core tension. |
| D5 | *Does ONE broken rule lose the round outright (strict brief)?* | **Ship v1: NO — softened.** Conviction eliminates the breaker + downgrades the team award (perfect +3 → survivors +2 / eliminated +1); only a correct guess ends the round early; perfect round preserved as top prize. | Instant team loss on one slip is rage-inducing, anti "funny never cruel". |
| D6 | *Do detectives vote in tribunals?* | **Ship v1: NO.** Detectives see `hasVoted` booleans only; `eligibleVoters` excludes them. | They don't know the rule → pure noise + griefing vector; *who* gets accused IS their clue. |
| D7 | *Hidden or public detective identity?* | **Ship v1: PUBLIC**, announced at briefing (`detectives` is public; roles in `seats[].isDetective`). | Faithful to the parlor game; hidden seekers collapse this into SECRET_ROLE and kill the interrogation dynamic. |
| D8 | *Bilingual items vs single-locale pack rule?* | **Ship v1: bilingual authoring source → offline pipeline emits sibling `-fr`/`-en` packs**; shell resolves locale at `startGame`. | Runtime loader stays locale-free; authoring/QA stays one source of truth. Already the pack's shape. |
| D9 | *Tie / zero votes in tribunal.* | **Ship v1: tie or zero votes = NOT guilty** (`guilty iff guiltyCount > notGuiltyCount`). | Funny never cruel; deterministic; no revote. |
| D10 | *Guess deadline / pause-stalling abuse.* | **Ship v1: deadline = attempt SPENT with no pick** (`resolveGuess(..., null)`). | Kills pause-stalling; one of the 3 shared `teamGuesses` is consumed even on no-pick. |
| D11 | *`totalRounds` default.* | **Ship v1: 3** (capped to `min(3, items=63)=3`), host range 1–8. | ~13 min session; pack has ample headroom (63 ≫ 3). |
| D12 | *Spicy tier for this game.* | **Ship v1: spicy 0 only; NO 18+ sibling for launch** (see §5). | Mechanic is performance-comedy, not exposure/intimacy; an 18+ tier adds risk with little payoff. Roadmapped optional. |
| D13 | *Eliminated-player boredom (risk).* | **Ship v1 as-is: accept**; eliminated followers keep `myRule` on screen + spectate tribunals; elimination resets every round (≤ ~3 min benched). Monitor abandon analytics; v2 lever in §7. | Rounds are short; full fix deferred to roadmap (R3 ghost-vote). |
| D14 | *Accusation griefing (risk).* | **Ship v1: 1 token/follower/round + majority tribunal + elimination consolation (+1)**; monitor `tribunal_resolved` for abuse patterns. | Caps unilateral grief; consolation keeps it non-punishing. |
| D15 | *Honor-system core (risk).* | **Ship v1: accepted as party-game trust**; round-intro copy must sell « coûte que coûte »/heist framing hard (§5.16). | Nothing technically stops silent rule-ignoring; the social/tribunal layer + copy is the mitigation. |
| D16 | *Build sequencing (risk: new template, pause/resume clock).* | **Resolved: SHIPPED** on the battle-tested kit after the four designed games; explicit replay/clock-bank tests in place. | The trickiest determinism surface; built last on the hardened harness as planned. |

---

## 5. The 18+ spicy sibling — reasoned **NO spicy tier** for v1 (optional roadmap)

**Decision: no 18+ sibling at launch. The shipped game is spicy-0 only.**

Rationale: `RULE_HUNT`'s comedy engine is **public physical/verbal performance + social betrayal**, not sexual frankness or exposure. The platform's 18+ tiers (truth-or-drink, truth-or-dare Lover) earn their gate because the *content* is the intimacy. Here, content is "touch your ear before every sentence" — a sexual rule (« embrasse la main du détective avant de répondre ») doesn't make the *mechanic* funnier, it just raises store-review and consent risk (the hard floor §3 forbids real-body dares and anything coercive — and a rule the whole room must obey "coûte que coûte" is exactly the kind of thing that can shade into a non-consensual dare). The game already hits its edge ceiling at spicy 0 through **conflict and betrayal**, which is precisely where the voice guide says spicy-0 lives.

**If a tier-1 sibling is ever warranted (roadmapped, not shipped), the concrete config diff would be:**
- New pack family id: `trouvez-la-regle-spicy-fr` / `-en` (separate `tone: 'spicy'`), `minAge: 17` (tier-1, not tier-2 18+).
- Pack carries `spicy: 1` items only — taboo-**adjacent** social rules (ex/dating-coded, gossip-engine, mild innuendo as *implication*), **never** explicit and **never** a physical-contact rule (hard-floor: no real-body dares).
- **No mechanic change**: same reducer, same scoring, same redaction. The 18+ instinct (publicPicks / anonymity changes) does **not** apply — votes are already anonymous by design and there's no "pick" to expose. The only diff is the pack id + tone gate + `minAge`.
- Decoys still 7, still same-category, still profanity-scanned; lint just allows `spicy: 1` items in the gated pack.

This stays a future option behind the age gate; **nothing in v1 ships it.**

---

## 6. Host-tunable params (lobby allowlist for this game)

Per the `RULE_HUNT` `templateParamsSchema` (`.strict()`), the lobby exposes:

| Param | Safe range | Default | Note |
|---|---|---|---|
| `totalRounds` | **1–8** | 3 | Runtime caps to `min(value, pack items=63)`. |
| `liveMs` | **120_000–300_000** | 180_000 | The free-play clock per round. |
| `briefingMs` | **10_000–30_000** | 20_000 | Rule-reading window. |
| `tribunalMs` | **15_000–40_000** | 25_000 | Debate length (the requested "debate length" lever). |
| `guessMs` | **10_000–30_000** | 20_000 | Detective grid window. |
| `revealMs` | **8_000–20_000** | 12_000 | Reveal/scoreboard beat. |
| `detectiveCount` | **`'auto'` \| 1 \| 2** | `'auto'` | Override the auto-scale. |
| `teamGuesses` | **1–5** | 3 | Shared detective guess pool. |
| `candidateCount` | **6 \| 8 \| 10** | 8 | Grid size (= decoys+1; pack must supply ≥ count−1 decoys). |
| `accusationsPerPlayer` | **0–3** | 1 | 0 = no tribunals (pure observation variant); zod accepts the index up to 9 (candidateCount cap 10). |

**Spicy toggle:** N/A at launch (spicy-0 only; see §5). If the tier-1 sibling ships, the toggle becomes a host-selectable pack family behind the age gate, not a per-match param.

---

## 7. Future modes roadmap

| Mode / change | Ship-later spec or cut | Decision |
|---|---|---|
| **R1 — New rule packs (config-only)** | More 63-item bilingual packs (themed: office, couples, kids-clean) — pure content + offline decoy pipeline, **zero reducer change**. | **Roadmap v2** — the cheapest growth lever; gated on offline-pipeline throughput + human playtest. |
| **R2 — Tier-1 "spicy" sibling pack** | Per §5: `trouvez-la-regle-spicy`, `minAge 17`, `spicy:1` social rules, no mechanic change. | **Roadmap v2 (optional)** — only if analytics show demand; behind age gate. |
| **R3 — Eliminated-player ghost engagement** | A passive "ghost vote" or live-react during the rest of the round for convicted followers (no scoring power; spectator flavor only). | **Roadmap v3** — only build if abandon analytics on eliminated players cross threshold (§4 D13). |
| **R4 — `accusationsPerPlayer: 0` "Pure Observation" variant** | Already host-reachable (range 0–3): no tribunals, detectives win on grid alone, perfect round = guaranteed unless guessed. | **Ship v1 (config-reachable)** — exposed as a host preset, not a separate mode. |
| **R5 — Bigger-grid hard mode** | `candidateCount: 10` preset for expert rooms (needs ≥ 9 decoys/item — pack currently authors 7). | **Roadmap v2** — blocked on pack re-authoring to 9 decoys; default stays 8. |
| **R6 — Remote / async play** | No realtime-layer change required (server-authoritative DO design); same module runs remote. | **Roadmap (platform-level)** — no game-specific work; ships when the shell enables remote. |
| **R7 — Free-text rule guessing (AI judge)** | Cut: non-deterministic, unfair scoring, violates the no-runtime-AI invariant. | **CUT** — superseded permanently by the deterministic 8-grid (D3). |

---

## 8. Risks & content-ops notes

- **Pack-sizing lint (load-bearing):** every item MUST carry **exactly `candidateCount − 1` = 7 decoys**, all same category as the rule, mutually distinct under `normalizeText`, profanity-scanned offline. Current pack: 63/63 items pass (verified). `init` caps `totalRounds = min(config, items.length)` so an undersized pack degrades gracefully rather than crashing. If `candidateCount` is raised to 10 (R5), the lint floor rises to 9 decoys — **re-author before enabling**.
- **Decoy quality is the whole game:** too-obvious decoys → detectives win on guess #1; near-duplicates → a correct observation is unguessable. The offline pipeline must score **plausibility AND mutual distinctness**, with a **human playtest gate before `enabled = true`**. This is the single highest content-ops risk.
- **Freshness / decay:** rule items are evergreen behaviors (gestures, speech tics) — low trend-decay vs. card games. The voice guide keeps trend-nouns in pack content (swappable), not UI chrome, so the chrome ages well. Decay risk is mainly **repetition within a friend group** (only 3 rounds/session from a 63-item pool — low collision, but track per-room item exposure and rotate packs).
- **Moderation surface:** **minimal at runtime** — the guess is a tap, votes are taps, there is **no free text** (nothing for a profanity filter to catch live). All moderation is **offline at authoring** (profanity scan on rules + decoys; hard-floor adversarial check). The only live social-harm surface is **accusation griefing** (D14: capped 1 token + majority + consolation; monitor `tribunal_resolved` analytics for clique-abuse patterns) and the **honor-system** trust assumption (D15: social, not technical).
- **Determinism (built, must stay green):** the banked pause/resume clock is the platform's trickiest determinism surface — keep the replay tests, the interrupt-vs-deadline race test, and the tiny-remainder-resume edge test in CI. Any change to `bank()` or `liveSeg`/`interruptSeq` keying must re-pass replay equality.
- **Redaction (leakedSecrets-audited):** guess grid contains the true rule → omit for unknown viewers; `trueCandidateIndex` never pre-reveal; candidate order byte-identical across viewers; per-voter ballots never leave hidden state; `detectiveOrder` never in any view. Each is a standing audited test — do not regress.
- **Ad cue:** the interstitial fires **client-side off the `phaseKey` transition to `over`** (server-shell design), never from a reducer effect; the `round_completed` analytics name is informational only.
