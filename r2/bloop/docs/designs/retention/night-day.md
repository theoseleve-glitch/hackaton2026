# Retention Redesign — `night-day` template (loup-garou)

**Author:** senior party-game design pass
**Date:** 2026-06-14
**Scope:** the `NIGHT_DAY` module (`packages/games/night-day`) and its sole config `LOUP_GAROU_CONFIG`. Themed reskins (mafia/vampire/space, D17) inherit every conclusion here verbatim because they are pure config+pack drops.
**Grounding:** read against the real `state.ts` / `night-day.ts` / `logic.ts` / `views.ts` / `actions.ts`, the 141-item `content/packs/loup-garou.json`, the test suite (`phases.test.ts`, `redaction.test.ts`, etc.), the shipped design `final/games/loup-garou.md`, the voice guide §5.17, and the GDD session loop / monetisation §2 + §E.

---

## 0. TL;DR — the one sentence

Loup-garou's *mechanics* are excellent and its *narration* is genuinely the best-written content in the catalogue; the retention problem is **structural idle time** — a player killed on night 1 watches the other 6–14 people play out a 10–15 minute match doing literally nothing, and even living non-role villagers spend every night sub-phase tapping a no-op decoy button. **Fix engagement-during-death and engagement-during-night-decoy first; do not touch the core loop, the redaction model, or the narration voice.**

---

## 1. The EXACT current loop (from the code, not the doc)

One match = one `GameModule` instance, `maxRounds: 10` cap. Phases and the **real shipped durations** (note: `state.ts` `LOUP_GAROU_CONFIG` is authoritative and *differs from the design doc table* — the doc says `roleRevealMs:15_000`/`lynchRevealMs:10_000`, the code ships `8_000`/`6_000`):

| Phase | Real `*Ms` (code) | What each player does | Idle risk |
|---|---|---|---|
| `roleReveal` | **8 000** | Read private role card (wolves also see pack), tap `ackRole`. | None — everyone acts. |
| `nightSeer` | **25 000** | Seer taps `seerPeek(target)`; **everyone else taps `nightAck` (pure no-op decoy)**. | **HIGH** — N−1 players tap a meaningless button then wait. |
| `nightWolves` | **30 000** | Living wolves `wolfVote`; everyone else `nightAck` decoy. | **HIGH** — only ~1–4 wolves act. |
| `nightWitch` | **25 000** | Witch `witchAct(heal/poison)`; everyone else `nightAck` decoy. | **HIGH** — exactly one player can act (and only some nights). |
| `dawn` | **10 000** | Read death recap + narration. Win-check on deadline. | Low — shared reveal beat. |
| `debate` | **90 000** | IRL argue out loud; phones show recap + `readyToVote` toggle. | Low for living; **dead players have nothing**. |
| `vote` | **30 000** | Living players `vote(target)` (secret); `hasVoted` booleans public. | Low for living; **dead = nothing**. |
| `lynchReveal` | **6 000** | Read tally + role reveal + narration. Win-check → next night or over. | Low — shared reveal beat. |
| `over` | `null` | Full role reveal, winners, scores, `gameOver`. | Terminal. |

**Per-cycle timed length (code values):** seer 25 + wolves 30 + witch 25 + dawn 10 + debate 90 + vote 30 + lynch 6 = **216 s/cycle**; typical match ~3 cycles ≈ 11 min. All gated phases early-exit on all-acted over `aliveConnected`, so passive seats never *stall* — but they also never *engage*.

**Scoring** (`enterOver`, match-end only, zero mid-match): villageWins → wolf 0 / village living +2 dead +1; wolvesWin → wolf living +3 dead +1 / village +1; roomCollapsed → all 0. Internal 0–3 scale; the shell maps to placement XP.

**The two structural idle holes** (both already acknowledged in the design as D16 + the decoy protocol, neither mitigated in v1):
1. **Death idle.** A player killed at the first dawn is a ghost for the remaining ~10 min. The redaction model deliberately gives dead players *no extra info* (no ghost omniscience, correctly). So a dead player's screen is a living-non-actor's screen: recap, narration, and **nothing to tap**. This is the single biggest retention leak on the entire platform.
2. **Decoy idle.** The decoy protocol is mechanically correct and must stay (it's what replaces "everyone close your eyes" in same-room play). But for the ~75–90% of players who are not the active role on a given night sub-phase, three consecutive night sub-phases (80 s of clock) reduce to "tap a fake button, then stare." The tap is *anonymity theatre*, not engagement.

---

## 2. Retention scorecard (0–5, evidence from the real code)

| # | Lever | Score | Evidence |
|---|---|---|---|
| 1 | **No dead time** | **1.5** | The fatal weakness. `nightAck` is a literal no-op (`actedAndMaybeEnd` just marks the seat); dead players have zero interaction surface for 10+ min (`buildView` gives a dead non-actor nothing extra). 80 s of night/cycle is idle for non-actors. |
| 2 | **Legible stakes & scoring** | **4** | `composition` is public (you know how many wolves), `seats[{alive}]`, `seerLog` (own), `witchState` (own), live `wolfVotes` (wolves) — stakes are very legible. Loses a point only because mid-match score is intentionally hidden (correct) so "who's winning" is a *social* read, not a UI one. |
| 3 | **Payoff beats** | **4** | `dawn` ("une chaise vide ce matin") and `lynchReveal` (role reveal + side-coded narration) are real "ohhh" beats and the narration nails them. Capped because `dawnMs:10_000` / `lynchRevealMs:6_000` are *tight* for a reveal that should breathe, and there's no engineered "no way" sting beyond the text. |
| 4 | **Tension & comeback** | **4** | Werewolf is structurally comeback-proof-of-concept: parity win + witch potions + seer info keep it close; `winCheck` is clean. The risk is the *opposite* — a dead player can't comeback at all (they're out), which interacts badly with lever 1. |
| 5 | **Social fuel** | **5** | This is the whole point and it's perfect. The product *is* the table accusing each other; `debate` (90 s) + secret `vote` + public `hasVoted` + role reveal = maximal call-out fuel. **Do not touch.** |
| 6 | **One-more-round pull** | **2.5** | `over` emits `gameOver` and the shell handles rematch, but the *match itself* has no streak, no escalation, no cliffhanger hook back into the module. D16's "instant rematch CTA + dead-spectate" is explicitly deferred to v2. The pull is all in the shell, none in the game. |
| 7 | **Onboarding by doing** | **3.5** | Role card text is excellent and teaches by reading ("c'est exactement pour ça qu'on tue les voyantes en premier"), and `roleReveal` → first night is learn-by-tapping. But a first-timer non-actor villager's *first 30 s of night* is "why am I tapping this button," which teaches nothing. |
| 8 | **Replay variety** | **4.5** | 132 narration variants across 8 slots, seeded-shuffled, `round % length` — repeated nights never repeat a line. Role assignment is reshuffled each match. Caps just short of 5 because the *mechanical* variety is fixed (same 4 roles every match in v1; the 5 authored-ahead v2 roles are dropped by `init`). |
| 9 | **Pace per phase** | **3** | `debate:90_000` is right; `dawn:10_000`/`lynchReveal:6_000` are too tight for the reveal payoff; the three night sub-phases at 25/30/25 are *generous* for one actor and a wasteland for everyone else. Pace is mistuned, not broken. |

**Weighted read:** the game is a 4–5 on everything that makes werewolf werewolf (social fuel, stakes, payoff, variety) and a 1–2 on everything about *keeping a non-acting or dead player's hands and eyes busy*. Retention work is almost entirely on levers 1 and 6.

---

## 3. KEEP AS-IS (ruthless — changing these hurts a working game)

- **The decoy night protocol itself.** Identical view keys for actor/non-actor, `nightAck` no-op, all-acted-or-deadline exit. This is the core anti-shoulder-surf invariant and is structurally tested (`redaction.test.ts`, actor/non-actor key parity). **Any night-engagement idea must preserve byte-identical view *keys* and tap *counts* across viewers.** This is the hard constraint every P0 below respects.
- **The redaction model.** Four secret classes + two deliberate disclosures (`wolfPack`, witch's `pendingKill`), no ghost omniscience. It's the platform's largest secret surface and a single leak kills the genre. Do not add a disclosure path casually (this is exactly why D13 little-girl is roadmapped last).
- **Match-end-only scoring.** Mid-match points would leak info (who's "winning" correlates with who's a wolf). Keep `scores` zero until `over`.
- **The narration voice and the narration content.** §5.17 dark-epic register is correctly executed and the 132 variants are the best-written content in the repo (specific cold images, no slang, no memes). The voice guide's roast register is *deliberately absent* and must stay absent. **Do not "spice up" loup-garou narration — that's change-for-its-own-sake that would actively break the one game whose fun is atmosphere.**
- **`spicyLevel: 0` / no spicy sibling.** §5 of the design is correct: the genre fights an 18+ skin, and there's no free-text surface to make spicier. Leave it.
- **`debateMs: 90_000`** and the host-tunable `debateMs`/`voteMs` levers. The 90 s debate is the heart; it's already the host's biggest knob.
- **`winCheck` ordering, parity rule, `noLynch` tie, `wolfVoteSeq` deterministic tie-break.** All clean, all tested, all comeback-friendly. Captain (D12) will revisit `noLynch` in v2; until then, untouched.

---

## 4. Mechanic changes (prioritised)

Every change below is stated against real functions and preserves the pure contract (server-authoritative, seeded RNG, same-reference reject, per-viewer redaction, no runtime AI, unit-testable + redaction-auditable).

### P0 — build first (high impact, low/med risk)

#### P0-1 — Ghost engagement: dead-player "Last Will / Wager" surface
**What:** give dead players a private, non-leaking, non-omniscient interaction each cycle. Two stacked sub-features:
- **Death Wager (primary):** on death, and again at each subsequent `lynchReveal`/`dawn`, a dead player privately taps a prediction — "who's the next to die?" and/or "name a wolf." Stored in a new hidden `ghostWagers: Record<PlayerId, {round, predictedNextDeath?, predictedWolf?}>`, **never surfaced to living players**, scored *cosmetically* at `over` ("The Oracle: predicted 3/3 deaths from the grave"). Adds a thing-to-tap every cycle for the otherwise-idle dead.
- **Last Will (one-shot):** at the moment of death the dying player gets one private free-choice tap from a fixed menu (NOT free text — zero-moderation invariant): e.g. tap one living player to "haunt" (purely flavour — at `over` the reveal shows "{ghost} swore {target} was a wolf with their dying breath"). No mechanical effect, so no redaction risk to the live game.

**Lever:** 1 (no dead time) — the headline fix; secondarily 6 (a from-the-grave score chase is a one-more-round hook).
**Impact:** high. **Risk:** med — the redaction audit must prove `ghostWagers` and last-will choices are **never** in any living/other view, only in the owner's view and the `over` reveal. This is auditable with the existing `leakedSecrets` harness pattern.
**Code scope:** `state.ts` (add `ghostWagers`, `lastWill` to `NightDayState` + a `ghostWager`/`lastWill` action variant + zod in `actions.ts`); `night-day.ts reduce` (accept the actions only from `alive[playerId]===false` players, same-reference reject otherwise; the *only* place in the game a dead player may act); `views.ts buildView` (owner-only echo, plus reveal block in the `over` branch); `logic.ts`/`enterOver` (cosmetic scoring tally, NOT folded into the 0–3 scale — keep that pure). **Crucially this does NOT touch the live decoy protocol or any living-player view key.**
**Test impact:** new `ghost.test.ts` (dead-can-act, living-cannot-act-on-ghost-channel, owner-only echo); extend `redaction.test.ts` with `ghostWagers` non-leak across all four viewer kinds; extend `scoring.test.ts` to assert the cosmetic tally never perturbs the 0–3 placement scores. ~30 new assertions.

#### P0-2 — Night decoy → "Night Read" micro-engagement (idle-killer for non-actors)
**What:** replace the *meaning* of the non-actor's night tap without changing its *shape*. Today `nightAck` is a no-op. Make it a **private, non-binding "night read"**: during any night sub-phase a non-actor taps a living suspect (their personal hunch). It is stored in a hidden `nightReads: Record<round, Record<PlayerId, PlayerId>>`, **never shown to anyone else**, and surfaced only to the owner ("your night-1 read: {name}") and at `over` as a personal accuracy stat ("you clocked the wolf on night 2"). The tap count and view keys stay identical to the decoy (one tap to lock the seat), so the anonymity invariant is **byte-for-byte preserved**.
**Lever:** 1 (no dead time) for living non-actors; 7 (onboarding-by-doing — the first night now teaches "you're hunting wolves" by making you point at one); 6 (personal accuracy stat = one-more-round).
**Impact:** high. **Risk:** med — must prove the read is redaction-invisible (it's strictly more hidden than `wolfVotes`, which is already audited) AND that it doesn't change `acted`/`myActed` semantics or the all-acted exit (it shouldn't — a read still locks the seat exactly like `nightAck`). The `nightAck` no-op should *remain valid* as the "I have no read" path so no one is forced to guess.
**Code scope:** `actions.ts` (add `nightRead{target}` alongside `nightAck`, or extend `nightAck` with an optional `read?`); `night-day.ts reduce` isNightPhase branch (treat `nightRead` like `nightAck` for the lock + store the read in a hidden map, reject dead/self/non-living targets same-reference); `state.ts` (`nightReads`); `views.ts` (owner echo + `over` reveal). **No change to `acted` flags, `amActor`, `wolfVotes`, or any cross-viewer key.**
**Test impact:** extend `phases.test.ts` night-decoy block (a read locks the seat like a nightAck; invalid read targets are same-reference; the read never appears in non-owner views); `redaction.test.ts` adds `nightReads` to the non-leak matrix.

#### P0-3 — Re-tune the reveal-beat timings (payoff breathing room + tighter night)
**What:** the reveals are rushed and the night is over-generous for solo actors. Concrete re-timing (all are `*Ms` constants in `LOUP_GAROU_CONFIG`, pure config — no logic change):

| Phase | Current (code) | Proposed | Why |
|---|---|---|---|
| `roleRevealMs` | 8 000 | **10 000** | 8 s is tight to read a meaty role card cold on night 1. |
| `nightSeerMs` | 25 000 | **20 000** | One actor + (now) a one-tap read; early-exit covers the fast case. |
| `nightWolvesMs` | 30 000 | **28 000** | Keep wolves' deliberation room (it's the one multi-actor huddle) but trim. |
| `nightWitchMs` | 25 000 | **18 000** | Exactly one possible actor; over-long today. |
| `dawnMs` | 10 000 | **12 000** | The reveal needs to land; +2 s for the "ohhh." |
| `lynchRevealMs` | 6 000 | **9 000** | 6 s is brutally short for a role reveal + tally + the "TOI t'as voté ça ?!" beat. This is the single most-rushed payoff in the game. |
| `debateMs` | 90 000 | **90 000** (unchanged) | Heart of the game; host-tunable. |
| `voteMs` | 30 000 | **30 000** (unchanged) | Fine. |

Net per-cycle: 216 s → **207 s** (slightly *faster* despite longer reveals, because the solo-actor night sub-phases shrink). Reveals get more room; idle night time shrinks.
**Lever:** 9 (pace), 3 (payoff beats).
**Impact:** med. **Risk:** low — pure constants; `phaseDurationMs` already reads them; tests assert "every timed phase >0" not exact values (only two assertions hard-code 25_000/90_000 in `phases.test.ts` and will need updating).
**Code scope:** `state.ts LOUP_GAROU_CONFIG` only.
**Test impact:** update the two hard-coded duration assertions in `phases.test.ts` (`expect(...).toBe(25_000)` for the seer step → 20_000). Trivial.

### P1 — high impact / higher risk, or med impact / low risk

#### P1-1 — Round-1 protection: suppress the information-free night-1 kill swing
**What:** the design itself flags small-room (5–6p) night-1 kills as "information-free" and swingy (Risks §8). A killed-night-1 player is the worst-case for lever 1. Option (config-gated, default off → A/B): on `round === 0`, the wolves' kill is converted to a **"mark," not a death** — the marked player is publicly revealed as "attacked but survived the first night" at dawn (no role leak), and only dies if targeted again. This guarantees nobody is a 10-minute ghost from the literal first dawn, and adds a juicy public "you were hunted night 1" tension flag.
**Lever:** 1 (no dead time, root-cause version), 4 (less night-1 variance).
**Impact:** high. **Risk:** **high** — changes win-rate balance (village gets a free first night), interacts with witch heal/poison resolution at dawn, and needs careful redaction (the "marked" flag is public but must not leak *who* the wolves are). Ship behind `firstNightShield: boolean` config default `false`, validate on 5% analytics (target village win-rate 55–65% per Risks §8), promote if it improves match-completion / dead-idle metrics.
**Code scope:** `state.ts` (config flag + `marked` field); `night-day.ts enterDawn` (round-0 special-case); `logic.ts winCheck` (unaffected — marked ≠ dead). Behind a flag so the default loop is untouched.
**Test impact:** new cases in `phases.test.ts` for round-0 mark-not-kill + the mark→death on re-target; `scoring.test.ts` unaffected (still match-end). Med effort.

#### P1-2 — Streak / escalation hook surfaced into the module's `over` payload
**What:** GDD streaks live entirely in the shell (TP7 "param-gated, off"; M1.5 session-scoped). The *module* contributes nothing to "one more round." Add to the `over` view a small, honest, non-leaking **match epilogue payload** the shell can render into the Oracle roast: `mvp` (most-accurate ghost wager / night read), `cleanestWolf` (wolf who survived longest undetected), `survivedTo` per player. Purely derived at `over` from already-public-at-`over` state. This gives the rematch CTA a personalised cliffhanger ("the wolf who fooled you was {name} — run it back?").
**Lever:** 6 (one-more-round), 5 (social fuel into the roast).
**Impact:** med. **Risk:** low — derived only at `over` where `finalRoles` is already public; no new in-match secret. Pure additive view field.
**Code scope:** `views.ts` `over` branch (compute epilogue from `roles`/`alive`/`ghostWagers`/`nightReads`); `state.ts` view type. No reducer change.
**Test impact:** a few assertions in a new `epilogue.test.ts`; redaction is trivially safe (only at `over`).

### P2 — nice-to-have / experimental

#### P2-1 — Accelerate the deferred v2 roles to ship as *replay-variety* drivers
**What:** the 5 v2/v3 roles (hunter, cupid, guardian, captain, little-girl) are **already authored as role cards in the pack** and dropped by `init`. Lever 8 caps at 4.5 only because v1 is mechanically the same 4 roles every match. Hunter (D9, the death-triggered reactive role) is the highest-variety-per-risk add and `hunterEnabled` already exists in config (hard-false). Hunter also *directly serves lever 1*: a dying hunter gets one final action — the textbook "you're never just dead" beat.
**Lever:** 8 (replay variety), 1 (hunter's death-shot), 3 (payoff — the revenge kill is a huge "no way").
**Impact:** med-high (but it's the roadmap, so flagged P2 for *this* retention pass). **Risk:** med — adds a death-triggered sub-phase (`hunterShot:r{round}`); the ordered night pipeline was built to append, but reactive-on-death timing (dawn vs lynch) needs care.
**Code scope:** `night-day.ts` (new sub-phase in the pipeline + death-trigger hook in `enterDawn`/`resolveLynch`); `state.ts` (config flip + state); content already exists.
**Test impact:** substantial — a whole new sub-phase needs its own test file + redaction pass. This is genuinely the roadmap's #1, surfaced here because it doubles as a retention fix.

#### P2-2 — "Tap-to-react" emoji pings during `dawn`/`lynchReveal` (clippable table moments)
**What:** a public, low-bandwidth reaction channel on the *reveal* phases only — each player can tap one of a fixed set of reactions (a gasp, a skull, a point-the-finger) that briefly appears on their seat. Fixed emoji set = zero moderation surface. Turns the 12 s dawn into a shared, screenshot-able "the whole table reacted to {victim} dying" moment.
**Lever:** 5 (social fuel / clippable), 3 (payoff amplification).
**Impact:** low-med. **Risk:** low (fixed set, public by design, reveal-phase-only so no info leak). Mostly client UI; the reducer just needs a transient `reactions` buffer that doesn't affect resolution.
**Code scope:** `state.ts` + `actions.ts` (fixed-enum `react` action), `views.ts` (public during reveal phases only). Could even live mostly client-side if the platform supports ephemeral non-authoritative pings — check before adding reducer state.
**Test impact:** light; assert reactions never affect `alive`/`votes`/win-check and clear at phase exit.

---

## 5. Writing-polish priorities

**Headline finding: the narration is NOT weak. It is the best content in the repo.** The 132 variants are specific, cold, on-voice (§5.17), and never bland-AI. The polish work here is *small and surgical*, not a rewrite. Resist the urge to "make it edgier" — that breaks the one game whose voice is deliberately atmospheric, not roast.

Priorities, in order:

1. **Fix the encoding corruption in the shipped pack (P0 content-ops).** The role-card and narration text contain mojibake where em-dashes/apostrophes should be (e.g. `qui ne verra pas l'aube � tu vois`, `condamn� � chaque option`). This is a build/encoding bug, not a writing bug, but it ships broken French to players on the highest-prestige game. **Re-export the pack as clean UTF-8.** Highest-priority content task.
2. **`lynch.villager` is the slot most at risk of moral-lecture drift** ("la démocratie a parlé, et elle a dit n'importe quoi" is great; but a couple of variants edge toward explaining the tragedy). Audit the 18 variants and cut any that *explain* the irony rather than *land* it (voice guide §1.2 evidence-then-verdict; never explain the joke even in gothic register).
3. **`dawn.noDeath` is the weakest slot** — "personne n'est mort" is inherently anticlimactic and a few variants are filler ("encadrez ce matin"). Sharpen toward *menace-in-the-calm* (the dread that nothing happened is itself a threat). Keep the cold-image discipline.
4. **`over.wolves` is the single most important payoff line in the whole game** (the "they laughed with you the whole time" chill). It's currently excellent — protect it, and ensure the 14 variants all hit the *betrayal-was-always-there* note rather than generic "wolves win."
5. **Token-discipline lint** (already specced in Risks §8): enforce `{victim}` in every `dawn.death`, `{target}` in every `lynch.*`, and *no* token in `dawn.noDeath`/`over.*`/`night.intro`. Add to pack CI.

### Concrete rewrite examples

These are *calibration examples*, not because the originals are bad — to show the bar and the encoding fix:

**Example A — `dawn.noDeath` (sharpen a filler variant):**
- BEFORE: « Tout le monde répond à l'appel. Encadrez ce matin : il est en passe de devenir une pièce de collection. »
- AFTER: « Personne ne manque à l'appel. Personne. Et pourtant quelqu'un, cette nuit, a levé la main et a choisi un nom. Le nom a survécu. La main, elle, est toujours là. »
- Why: turns "nothing happened" into *active dread* (someone tried) — menace-in-the-calm, one cold image (the raised hand), no explanation. Stays §5.17 register.

**Example B — `lynch.wolf` (already strong; clean encoding + tighten the verdict):**
- BEFORE (mojibake): « Le village a tranch� : {target} �tait un loup. Sous la chemise, le poil. Derri�re le sourire, les crocs. Vous aviez raison � une fois. »
- AFTER (clean UTF-8, full-stop timing): « Verdict : {target} était un loup. Sous la chemise, le poil. Derrière le sourire, les crocs. Vous avez eu raison. Une fois. »
- Why: the period before "Une fois." does the comedic-menace timing (voice guide §1.2) — the original's em-dash softens the knife; the full stop lands it. Encoding fixed.

---

## 6. Timing summary (single source of truth)

| Phase | Current ms | Proposed ms | Lever |
|---|---|---|---|
| roleReveal | 8 000 | 10 000 | onboarding / payoff |
| nightSeer | 25 000 | 20 000 | pace (shrink solo-actor idle) |
| nightWolves | 30 000 | 28 000 | pace (keep huddle room) |
| nightWitch | 25 000 | 18 000 | pace (one possible actor) |
| dawn | 10 000 | 12 000 | payoff beat |
| debate | 90 000 | 90 000 | KEEP |
| vote | 30 000 | 30 000 | KEEP |
| lynchReveal | 6 000 | 9 000 | payoff beat (most-rushed reveal) |

---

## 7. Build order (recommended)

1. **P0-3** (re-timing) — one-file config change, ship immediately, lowest risk, instant pace win.
2. **P0-2** (night-read decoy upgrade) — kills living-non-actor idle, preserves the anonymity invariant, teaches by doing.
3. **P0-1** (ghost engagement) — the headline fix; build on the hardened redaction harness; biggest single retention lever.
4. **P1-2** (over epilogue) — cheap, feeds the shell rematch hook, depends on P0-1/P0-2 data.
5. **P1-1** (first-night shield) — behind a flag, A/B on 5% analytics.
6. **P2-1** (hunter) — the roadmap's #1, doubles as a death-idle fix; ship when the additive-role redaction harness is proven.
7. **P2-2** (reactions) — polish, mostly client.

Content-ops, in parallel and independent of code: **fix the pack encoding first**, then the slot audits in §5.
