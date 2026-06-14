# Retention redesign — `spotlight-guess` template

**Scope:** the shared `SPOTLIGHT_GUESS` module (`packages/games/spotlight-guess`) and its two shipped games:
- **`jeu-de-la-note`** (La Note / On a Scale) — mode `scale`
- **`devine-la-question`** (Guess the Question) — mode `reverse-question`

**Method:** every claim below is read off the real reducer (`spotlight-guess.ts`), resolvers (`resolve.ts`), config/state (`state.ts`), wire schema (`actions.ts`) and the shipped packs (`content/packs/*.json`). Constraints honored: pure `init/reduce/view/phaseDurationMs/phaseKey`, server-authoritative, per-viewer redaction, seeded RNG only, invalid event → SAME state reference, no live AI. Every proposal stays unit-testable and redaction-auditable.

---

## 1. The exact current loop (what each player does, second by second)

### 1.1 `jeu-de-la-note` (`scale`) — `JEU_DE_LA_NOTE_CONFIG`
`totalRounds: 8`, no scoreboard beat (`scoreboardEvery: 0`, `scoreboardMs: 0`). Phases per round (`phaseDurationMs`):

| Phase | ms | Spotlight does | **Everyone else does** |
|---|---|---|---|
| `target` | 8 000 | Privately sees secret number 1–10 (`myTarget`), taps `ready` to skip | **Nothing.** Sees prompt + anchors, waits. |
| `talk` | 45 000 | Performs the prompt calibrated to the secret number; taps `openVotes` to end early | **Nothing — watches one person for up to 45 s.** No input, no reaction. |
| `guess` | 20 000 | Waits | Sets a dial 1–10 (overwrite allowed, `lockOnSubmit:false`); `allActed` early-resolves |
| `reveal` | 6 000 | Scored by lower-median band | Sees target + everyone's dial + `lastGained` |

Scoring (`band`, `resolveScale`): guesser d=0→4, d=1→2, d=2→1, ≥3→0. Spotlight = `band` of the **lower-median** submitted distance. **Max 4 pts/round for everyone, every round.** No scoreboard phase at all — totals only ever surface inside the 6 s `reveal`.

### 1.2 `devine-la-question` (`reverse-question`) — `DEVINE_LA_QUESTION_CONFIG`
`totalRounds: 6`, `scoreboardEvery: 2`. Phases per round:

| Phase | ms | Spotlight (mystery) does | **Everyone else does** |
|---|---|---|---|
| `answer` | 20 000 | Sees real question + 3 honest options, picks one | **Nothing.** Sees only "X is answering a secret question" — *no question, no options, no candidates*. Pure dead air. |
| `guess` h0 | 20 000 | Waits (sees own `myRealIndex`) | Sees the chosen answer + 5 candidates; locks one (first-write-wins). Correct h0 = **300**. |
| `guess` h1 | 20 000 | Waits | Hint 1 public; still-unlocked may lock. Correct = **200**. |
| `guess` h2 | 20 000 | Waits | Hint 2 public (last chance). Correct = **100**. |
| `reveal` | 6 000 | Scored +75 × correct guessers | Sees real question, everyone's pick+tier, deltas |
| `scoreboard` | 6 000 | — | Running totals (every 2 rounds + before `over`); the ad slot |

`allActed(expectedGuessers)` early-resolves a hint window once everyone connected has locked. Worst case round ≈ 88 s of run.

---

## 2. Retention-lever scorecard (0–5, evidence from the real code)

| Lever | La Note | Devine | Evidence |
|---|---|---|---|
| **1. No dead time** | **1** | **1** | La Note: up to 45 s `talk` with **zero** input/reaction for every non-spotlight (`view` for `talk` exposes no actionable field to guessers). Devine: 20 s `answer` shows guessers literally `{spotlightId, scores}` — nothing to look at, nothing to do. Both have a long idle beat as the *core* of the round. |
| **2. Legible stakes & scoring** | **3** | **4** | La Note: bands are clear at reveal but the **spotlight's lower-median rule is invisible** to players and there is **no scoreboard phase** — you never see running totals except inside a 6 s reveal. Devine: 300/200/100 ladder is legible and the tier gamble is the whole hook; scoreboard every 2 rounds helps. |
| **3. Payoff beats** | **2** | **4** | La Note: "that was NOT a 7" is real, but the reveal is a flat 6 s plot of dials with no engineered build. Devine: "TOI t'as voté ÇA ?!" lands hard because picks+tiers flip public atomically and decoys out-incriminate the truth — genuinely engineered. |
| **4. Tension & comeback** | **1** | **2** | La Note: **everyone caps at 4/round** → over 8 rounds the spread is tiny and compresses further every round; near-impossible runaway *but also* near-impossible meaningful lead — many dead-rubber rounds. Devine: one correct h0 = 300 = a runaway swing with no rubber-band; a player 600 behind at round 5 is mathematically cooked. Neither has a comeback mechanic. |
| **5. Social fuel** | **3** | **4** | La Note: the verbal "you must talk" argument is strong but **app-unsupported** (no reveal caption, no call-out copy). Devine: picks-public reveal is a built-in accusation engine; decoys name people "in this room". |
| **6. One-more-round pull** | **1** | **2** | La Note: no streaks, no escalation, no scoreboard, flat content order, hard stop at round 8. Devine: the tier gamble pulls a bit; still no streak/escalation/cliffhanger; `over` is abrupt. |
| **7. Onboarding by doing** | **3** | **2** | La Note: dial + anchors teach themselves. Devine: the **first thing a new guesser sees is a blank "someone is answering" screen for 20 s** — worst possible first impression; the mechanic only becomes legible at the `guess` phase. |
| **8. Replay variety** | **4** | **2** | La Note: 152 items, mixed scale10/wheel100, seeded targets → high. Devine: **30 items, 6 drawn/game** → collision within 2–3 sessions for one group; narrow ambiguity corridor caps fresh authoring. |
| **9. Pace per phase** | **2** | **2** | La Note: 45 s talk drags in shy rooms; 6 s reveal too short to savor the roast. Devine: four back-to-back 20 s windows is a slog at the top tier; 6 s reveal under-serves the best payoff in the game. |

**Net:** both games have a strong *core fantasy* and (critically) **genuinely good, on-voice content already shipped** — but both bleed retention on the same two structural wounds: **(A) a long idle phase where the room does nothing**, and **(B) no escalation/comeback/scoreboard arc that makes round N+1 feel different from round N.**

---

## 3. Mechanic changes (scoped, prioritized)

> Numbering: P0 = high impact / low–med risk, build first. P1 = high impact higher risk OR med impact low risk. P2 = experimental.

### P0 — kill the dead time during the spotlight's secret beat

**P0-A — La Note: "predict the room" side-bet during `talk` (turns watchers into actors).**
While the spotlight performs, every guesser secretly pre-commits a *first-impression* dial that locks at `talk`-end and seeds their `guess` entry (still overwritable). Mechanically: accept the existing `guess` action during `talk` too (write into the same `guesses` buffer at `tier:0`); the existing overwrite-until-resolve UX (`lockOnSubmit:false`) already supports refining it in the `guess` phase. No new action, no new secret. Now nobody watches idle — they're dialing live as the bit unfolds, which *is* the joke ("he's losing me, dropping to a 3").
- **Lever:** 1 (no dead time), 9 (pace), 5 (live reactions). **Impact:** high. **Risk:** med (redaction: the early dial must stay in the hidden buffer exactly like a normal guess — already covered).
- **Code scope:** `reduce` scale branch — relax the `state.phase === 'guess'` guard on the `guess` action to also accept `phase === 'talk'` (guard `playerId !== spot`, still `inDomain`). `view` scale `talk` branch — add `hasGuessed` + owner `myGuess` echo (copy from the `guess` view). No change to `resolveScale`. **Do NOT** early-resolve during `talk` (the performance must finish) — only let `allActed` resolve in `guess`.
- **Test impact:** `phases.test.ts` (new: guess accepted in talk, does not advance phase), `redaction.test.ts` (talk-phase early dials stay hidden — extend the existing "guess buffer hidden until reveal" case to cover talk), `scoring.test.ts` unchanged.

**P0-B — Devine: give guessers a job during `answer` (predict the answer they can't see).**
During `answer` the room sees nothing. Instead show all guessers the **3 honest options** (the `answers`, *not* the question, *not* the candidates) and let them privately predict which one the mystery player will pick. This leaks nothing about the real question (the `answers` are honest options shared by real+decoy by design — §3.1 cross-plausibility means options are sane for all candidates) and pays a tiny "you know them" bonus at reveal.
- **Lever:** 1, 5 (it's a "do you even know your friend" beat), 7 (onboarding — new players now *act* in their first 20 s instead of staring at a blank screen). **Impact:** high. **Risk:** med-high — this is the one redaction-sensitive proposal: must confirm with the content team that exposing `answers` (without question/candidates) cannot triangulate the real question. The design doc (§2.5) explicitly notes "an option list paired with later candidates could triangulate" — so the answer-prediction must use a **separate per-viewer field** and the audit must prove options-alone ≠ question. If the audit fails, fall back to **P0-B-lite**: a content-free "lock in your readiness / react" tap that just shows live avatars lighting up (kills the blank screen, zero leak).
- **Code scope:** new optional action `predictAnswer{index}` OR reuse `guess` with a phase tag; `view` reverse `answer` branch adds `answers` for non-spotlights + `predicted` booleans; `resolveReverse` adds a small bonus for correct prediction. **Recommend shipping P0-B-lite first** (zero redaction risk) and gating full prediction on the audit.
- **Test impact:** new `redaction.test.ts` case (answer-phase guesser view carries `answers` but NEVER `question`/`candidates`/`realIndex`); `scoring.test.ts` for the bonus.

### P0 — make the arc legible and savorable

**P0-C — La Note: add a real `scoreboard` beat (the config already supports it; it's just turned off).**
La Note has **no scoreboard phase** — totals live only inside a 6 s reveal. The reverse mode already implements `scoreboard`/`advanceFromScoreboard`. Flip it on for scale: set `scoreboardEvery: 4` (twice in an 8-round game) + always-before-`over`, `scoreboardMs: 6_000`. This is the **ad slot** (currently La Note has none mid-game — it only fires the interstitial on `over`), the "who's winning" legibility beat, and a natural cliffhanger.
- **Lever:** 2 (legible stakes), 6 (one-more pull), + monetisation (a mid-game ad slot that didn't exist). **Impact:** high. **Risk:** low — `advanceFromReveal` already branches on `mode === 'reverse-question'` for scoreboard; extend it to scale. The reducer machinery is shipped and tested.
- **Code scope:** `state.ts` `JEU_DE_LA_NOTE_CONFIG` (`scoreboardEvery: 4`, `scoreboardMs: 6_000`); `resolve.ts` `advanceFromReveal` — drop the `mode === 'reverse-question'` gate around the scoreboard-due check (or add the scale case). `phaseDurationMs`/`phaseKey` already handle `scoreboard`. The scale `scoreboard` view case already exists? No — it's reverse-only; add a scale `scoreboard` view branch (mirror the reverse one).
- **Test impact:** `phases.test.ts` (scale now emits `scoreboard:r3`/`r7`), `redaction.test.ts` (scoreboard view carries only totals), update any round-count timing assertions.

**P0-D — both: extend `revealMs` 6 000 → 8 000–9 000.**
The reveal is the engineered payoff ("that was NOT a 7", "TOI t'as voté ÇA"). 6 s is too short to read names + deltas + argue. This is the single cheapest payoff-beat win in the template.
- **Lever:** 3 (payoff), 5 (social), 9 (pace). **Impact:** med. **Risk:** low (one constant each; keep within the host-tunable cap 4 000–15 000). **Code scope:** `state.ts` both configs `revealMs`. **Test impact:** timing assertions only.

### P1 — comeback & escalation (the "round N+1 feels different" wound)

**P1-A — La Note: escalating stakes + a late-game double round (comeback without runaway).**
Everyone capping at 4/round makes leads meaningless and trailing irrelevant. Add a **per-round point multiplier that escalates**: rounds 1–4 ×1, rounds 5–6 ×2, rounds 7–8 ×3 (apply in `resolveScale` as `band(...) * multiplier(round)`). Late accuracy can erase an early lead → live comeback, while the *band* math (and thus the redaction/scoring tests' shape) is unchanged.
- **Lever:** 4 (tension & comeback), 6 (escalation = one-more pull). **Impact:** high. **Risk:** med (changes score magnitudes; placement XP is placement-based so cross-game comparability is unaffected per GDD §2.2). **Code scope:** `resolve.ts` `resolveScale` (multiply `pts` by a pure `roundMultiplier(state.round, totalRounds)`); optional config `lateRoundMultiplier`. **Test impact:** `scoring.test.ts` (new multiplier cases; existing band cases stay valid at ×1).

**P1-B — Devine: rubber-band the tier ladder OR add a final double round so a 300-behind player isn't dead.**
A single h0 hit (300) creates an unrecoverable gap by round 4–5. Cheapest fix (config-only, **already roadmapped** — D14): widen `tierPoints` is the wrong direction; instead make the **final round** worth a multiplier (×2 `tierPoints` on the last round) so the trailing player has a live shot. Pure `resolveReverse` change keyed off `round + 1 === totalRounds`.
- **Lever:** 4 (comeback), 6. **Impact:** high. **Risk:** med. **Code scope:** `resolve.ts` `resolveReverse` (last-round multiplier). **Test impact:** `scoring.test.ts`.

**P1-C — Devine: per-hint dwindling pressure beat (auto-advance on all-locked is good; add a "lock now or lose 100" visible countdown).**
The four 20 s windows drag because the *cost of waiting* is abstract. Surface the next-tier penalty in-view (`tierPoints[hintTier]` vs `tierPoints[hintTier+1]`) — already in the view payload (`tierPoints`, `hintTier`), this is a **client/copy** change, but call it out as a mechanic-legibility P1 because it makes the existing gamble *felt*.
- **Lever:** 2, 6, 9. **Impact:** med. **Risk:** low (no reducer change). **Code scope:** mobile view + reveal/guess copy. **Test impact:** none (view payload already carries the data).

### P1 — content depth (Devine's freshness wall)

**P1-D — Devine: grow the pack 30 → 45+ items (close the §8 / D17 action item).**
6 of 30 drawn per game = repeat collision inside 2–3 sessions for the same group (no per-room memory, anonymous-forever). This is the #1 replay-variety cap and it's a **content op, zero code**.
- **Lever:** 8 (replay variety). **Impact:** high. **Risk:** low (offline pipeline already exists, `needsOfflineAiPipeline: true`). **Code scope:** `content/packs/devine-la-question.json` (authoring), per-locale offline gate. **Test impact:** pack-version replay test re-pin.

### P2 — experimental

**P2-A — La Note: "consensus bonus" social payoff.** If ≥3 guessers land the *same* (wrong) number, award them a small "the room was united (and wrong)" badge/point — manufactures a "we ALL said 7?!" table moment. Lever 5/3. Risk low-med (`resolveScale` tally). 

**P2-B — Devine: "group calls bluff" verdict (already roadmapped v3, D15).** Post-reveal vote on whether the mystery player answered honestly; dishonest verdict zeroes their reader bonus. Adds a vote sub-phase — **only** build if analytics show high troll rates. Lever 5. Risk high (new phase, redaction, never-block). Keep cut for now.

**P2-C — La Note: `la-roue` wheel100 rider** (designed, not registered — D2/§7). Pure config + kind-filtered pack. Lever 8. Ship as the cheapest content lever once P0s land.

---

## 4. Concrete timing proposals (ms per phase)

### `jeu-de-la-note`
| Phase | Current | Proposed | Why |
|---|---|---|---|
| `target` | 8 000 | **6 000** | Reading a number 1–10 + anchors needs ~5 s; `ready` early-exits anyway. Tighten. |
| `talk` | 45 000 | **40 000** | With P0-A live-dialing, the room is engaged the whole time; 40 s holds energy, `openVotes` trims. |
| `guess` | 20 000 | **15 000** | With P0-A pre-seeded dials, this is *refinement* not cold input → shorter. `allActed` early-exits. |
| `reveal` | 6 000 | **9 000** | Savor the roast (P0-D). |
| `scoreboard` | — (off) | **6 000** every 4 rounds + before `over` | New legibility + ad beat (P0-C). |

Round ≈ 6+40+15+9 = **70 s** (vs 79 s), with two 6 s scoreboards. Faster *and* more legible.

### `devine-la-question`
| Phase | Current | Proposed | Why |
|---|---|---|---|
| `answer` | 20 000 | **15 000** | With P0-B the room now acts; 15 s is enough to pick from 3 options. |
| `guess` h0 | 20 000 | **18 000** | First read of answer+5 candidates is the dense one; keep near 20 s. |
| `guess` h1 | 20 000 | **15 000** | Hint speeds decisions. |
| `guess` h2 | 20 000 | **12 000** | Last chance, decision is forced; shorten to keep momentum. |
| `reveal` | 6 000 | **9 000** | The best payoff in the template deserves room (P0-D). |
| `scoreboard` | 6 000 | **6 000** | Keep (ad slot). |

Worst-case round ≈ 15+18+15+12+9 = **69 s** (vs 88 s) — meaningfully tighter for 12–16 rooms (addresses D8 drag without the sprint config).

> Per-tier hint windows differ → needs `hintIntervalMs` to become a **per-tier array** (e.g. `hintWindowsMs: [18000,15000,12000]`) OR keep the single `hintIntervalMs:15000` for simplicity. Recommend the array (small `state.ts` + `phaseDurationMs` change) for the front-loaded curve; if scope-constrained, ship a flat `15 000`.

---

## 5. Writing-polish priorities

**Honest assessment: the content is already strong and on-voice** — `jeu-de-la-note.json` and `devine-la-question.json` mostly clear the voice guide's lint (concrete nouns "McFlurry"-tier, "someone in this room" call-outs, deadpan anchors, decoys that out-incriminate the truth, e.g. `q_mirror` real "check yourself in the mirror" vs decoy "stalked someone in this room's profile"). Do **not** mass-rewrite. The gaps are *structural copy that doesn't exist yet* and a few flat anchors.

Priorities, highest first:
1. **La Note has zero reveal/scoreboard copy** (the game speaks no reveal lines today). The voice guide §5 #10 explicitly wants "T'as mis 7. C'était un 4. Vous devez parler." — that line **isn't in the product**. Author a reveal-caption layer: dynamic templated drops keyed off the median gap ("écart de 4 → vous devez parler"). This is the single biggest voice win and it's net-new content, not a rewrite.
2. **La Note anchor spread audit** — the difficulty knob is *graduated anchors* (design §8 freshness risk). A few items have anchors that aren't vivid at both ends → guesses cluster mid-scale and bands flatten. Score every item's low/high for spread; refresh the flat ones. (Not a voice problem — a *mechanic-via-content* problem.)
3. **Devine hint dryness consistency** — the best hints are deadpan-disappointed ("They were 'tiny ones', of course."); a minority are merely descriptive. Pass for the "dry, withholding, slightly disappointed" register (§5 #11).
4. **Devine pack growth (P1-D)** — new items must keep the escalating-accusation decoy spine.

**Example rewrites (concrete):**

- **La Note — new reveal caption (net-new, by median gap):**
  - gap 0: `fr` « Pile. La salle est en phase. Suspect. » / `en` "Bang on. The room agrees. Suspicious."
  - gap ≥3: `fr` « T'as mis 7. C'était un 4. Vous devez parler. » / `en` "You said 7. It was a 4. You two need to talk."
  *(Lever 3+5; templated off `lastGained`/median, deterministic, no AI.)*

- **La Note — sharpen a flat anchor.** Item `note-music-003` (shower song) low is fine; if any item ships a low like "kind of quiet" → rewrite to a concrete image, e.g. low `fr` « Tu baisses le volume quand le voisin tire la chasse » (already good — this is the bar; flag any item that doesn't hit it).

- **Devine — tighten a descriptive hint to disappointed-deadpan.** If a hint reads like a clue ("It's about your phone"), rewrite to the shipped register: `fr` « L'objet est à moins d'un mètre. On le sait tous les deux. » / `en` "The object is within arm's reach. We both know it." (this is the existing `q_no_phone` bar — match it.)

---

## 6. Keep-as-is (do NOT touch — already sticky)

- **The redaction architecture.** `myTarget`/`realIndex` reaching only the spotlight, hidden guess buffer, seeded candidate shuffle, void-on-spotlight-leave. This is the template's safest, best-tested property — every proposal above is designed to *not* disturb it.
- **La Note's band scoring + lower-median spotlight rule.** "All closest win, never a cruel single loser" is the voice north-star ("funny never cruel"); the lower-median rewards calibrating the whole room. Keep the math; only *multiply* it (P1-A) and *surface* it (P0-C, copy).
- **La Note's verbal-only `talk` beat (D5).** Zero typed text = zero moderation surface = the lowest-risk content profile in the wave. Do not add typing. P0-A adds *dialing*, not text.
- **Devine's tier ladder + lock-on-submit + reader-points alignment trick.** The 300/200/100 gamble and "first-write-wins" commitment IS the game (D4); the +75/correct alignment that punishes troll answers (D5) is elegant. Keep; only add a *last-round multiplier* (P1-B) for comeback.
- **Devine's decoys-out-incriminate-truth content spine.** The shipped pack nails it (`q_mirror`, `q_lottery_call`). The fix is *more* of it (P1-D), not different.
- **Void-on-disconnect / never-block presence handling.** Load-bearing against stalls; keep `presence.test.ts` branches green.
- **The pure GameModule contract & seeded determinism.** Non-negotiable; all proposals are reducer-pure.

---

## 7. Ship order

1. **P0-C** (La Note scoreboard — flip on shipped machinery; adds ad slot + legibility) →
2. **P0-D** (reveal 6→9s both — one constant each) →
3. **P0-A** (La Note live-dial during talk — kills the 45 s dead beat) →
4. **P0-B-lite** (Devine answer-phase "react" to kill the blank screen; full prediction gated on redaction audit) →
5. **P1-A / P1-B** (escalation + comeback multipliers) →
6. **P1-D** (Devine pack 30→45) + reveal-caption copy (La Note) →
7. **P1-C** copy, **P2** experiments, **P2-C** `la-roue` rider.
