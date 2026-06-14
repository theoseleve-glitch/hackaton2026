# LAST_STANDING — Retention-First Redesign Brief

**Template:** `LAST_STANDING` (`packages/games/last-standing`)
**Games on template:** `jeu-du-theme` (Le Jeu du Thème / Last Word Standing) — base & only mode; future siblings are config+pack only (`jeu-du-theme-big`, `jeu-du-theme-18`).
**Date:** 2026-06-14
**Author:** party-game design (retention pass)
**Grounded in:** `src/state.ts`, `src/last-standing.ts`, `src/actions.ts`, `content/packs/jeu-du-theme.json` (105 items), `docs/designs/final/games/jeu-du-theme.md`, `docs/designs/2026-06-12-content-voice-guide.md`, `00-GAME-DESIGN-DOCUMENT.md` §2.

---

## 0. The loop as it actually ships (read from code, not the pitch)

Per `createLastStanding` + `JEU_DU_THEME_CONFIG`:

```
init → drawRound(0)
  draw (4000ms)      slot-machine theme+letter; alive resets to connected snapshot; NO spotlight yet
   └ deadline → enterTurn
  say  (8000→3000ms) ONE spotlit player shouts a word; decaying clock max(3000, 8000 − lap×1500)
                     actions: wordSaid (→judge) | giveUp (→result, eliminated)
                     deadline → timeout (eliminated)
   └ wordSaid → judge (6000ms)  every present non-spotlight player thumbs valid|reject;
                     deadPlayersJudge=true ⇒ eliminated players vote too; first vote locked;
                     rejected iff reject/cast > 0.5 STRICT; tie/zero → valid
   └ result (2000ms)  stamp: VALIDE ✅ / 💥 ÉLIMINÉ + anonymous tally counts
                     deadline → next alive survivor's say, OR roundEnd at aliveCount≤1 / cap (rotation×6)
  roundEnd (4000ms)  last one standing +3 (survivorPoints); emits round_completed (ad boundary)
   └ deadline → next draw, or over after totalRounds(3) / deck exhaustion
  over               flat scores + wordsValidated + rotation dump; gameOver(scores)
```

Scoring: `validWordPoints = 1` per validated word; `survivorPoints = 3` per round survived. Jurors unscored (deliberate, keep). 3 rounds.

**The core loop is genuinely good.** The decaying clock is a real tension machine, the jury-as-validation manufactures a table fight every turn, and dead-players-judge keeps the eliminated busy. The content is the best in the catalog (see §5). The retention problems are NOT in the fantasy — they are in **idle non-spotlight players during `say`, dead `draw` time, a broken comeback curve, and a flat `over` with no one-more-round hook.**

---

## 1. Retention scorecard (0–5, evidence from the real code)

| # | Lever | Score | Evidence |
|---|---|---|---|
| 1 | **No dead time** | **2** | `say` spotlights ONE player; every non-spotlight, non-eliminated player has literally no input and nothing to react to until that player taps `wordSaid` and `judge` opens. In a 6-player round the spotlight acts and 5 wait, then 5 vote for 6000ms. `draw` (4000ms) is pure spectacle — nobody acts, and the spotlight isn't even chosen yet (`spotlight: null`). Eliminated players DO judge (good), but living-but-waiting players are the dead-time hole. |
| 2 | **Legible stakes & scoring** | **3** | `scores`, `wordsValidated`, `alive` are all in `viewBase` every phase — the data is there. But `result` is spec'd as a 2s stamp of `lastTurn` only; there is no "who is winning" beat, and the +1/word vs +3/survivor mix is not surfaced as a live standing. Players can't easily tell mid-round whether surviving or racking words is the play. |
| 3 | **Payoff beats** | **3** | The `judge` → `result` flip (💥 ÉLIMINÉ) is a real reveal and the anonymous tally is a nice "the room turned on you" beat. But `resultMs = 2000` is too short to land the laugh on an elimination, and the verdict is identical whether it's a 2/2 unanimous burial or a razor 2/1. No escalation of drama as the round narrows to a duel. |
| 4 | **Tension & comeback** | **1.5** | **Worst lever.** Math: surviving all 3 rounds = **+9** from survival alone, before any words. A player eliminated round 1 with 3 validated words has +3 and cannot catch a 2-round survivor (+6) no matter what. `survivorPoints(3) × rounds(3) = 9` dwarfs realistic word totals. There is **no comeback mechanic, no catch-up, no escalating reward for late survival** — and once you're out for a round you only judge; you can't score until the next draw. A player out early in rounds 1 AND 2 is in a dead rubber by round 3. |
| 5 | **Social fuel** | **3.5** | Strong by construction: the jury IS a public accusation, and "déjà dit = pouce rouge" weaponizes the table. But the tally is **anonymous counts only** — there is no "who voted to bury you" reveal (deliberately, per TK16 — keep that). The shareable moment is the `over` screen, which is currently a flat scores map with no superlatives surfaced from this game. |
| 6 | **One-more-round pull** | **1.5** | No streak, no escalating spice, no cliffhanger. `over` emits `gameOver(scores)` and stops. The shell adds session XP/streaks, but the GAME contributes nothing to the "again?" pull — no "you were ONE word from winning", no near-miss, no rival callout. `totalRounds = 3` is a fixed, unescalating arc. |
| 7 | **Onboarding by doing** | **3** | The first thing that happens is a 4s `draw` with zero input. The first actor learns by being spotlit (good — shout a word), but the 5 jurors learn "thumbs" only when `judge` first opens ~12s in. Decent, but the dead `draw` opener wastes the highest-attention moment. |
| 8 | **Replay variety** | **4.5** | 105 items, cross-round letter no-repeat (`usedLetters`), ascending difficulty buckets, seeded deck shuffle. Massive headroom. Strong; barely touch it. |
| 9 | **Pace per phase** | **2.5** | `draw 4000` (too long for a non-interactive beat), `judge 6000` (fine), `result 2000` (too short for the payoff), `say` decay 8000→3000 is excellent. `roundEnd 4000` is fine. The mis-allocation: time is spent where nobody acts (`draw`) and starved where the laugh lands (`result`). |

**Weighted read:** the template is **content-rich and mechanically sound but retention-thin in the middle**: idle players during `say`, a non-interactive `draw`, a runaway-leader scoring curve with zero comeback, and a flat ending with no "again" hook.

---

## 2. Retention redesign — mechanic changes (scoped, contract-safe)

Every change below respects the pure `GameModule` contract: server-authoritative, seeded RNG only, per-viewer redaction, invalid events return the SAME state reference, no runtime AI. Each is unit-testable and redaction-auditable.

### P0 — build first (high impact, low/med risk)

#### P0-1. Side-bet on the spotlight ("survives or chokes?") — kills `say` idle time
**What:** during `say`, every non-spotlight player (alive OR eliminated juror) may tap one binary prediction: **will this word survive the jury?** (`bet: 'survives' | 'chokes'`). It is a NEW action resolved at the same moment the turn resolves. Correct predictors get **+1** (a new small currency, `betPoints`, distinct from word/survivor points). The bet is locked on first tap, redacted exactly like a vote (own-echo only; only counts published).
**Lever:** No dead time (1), Social fuel (5), Tension & comeback (4 — gives out players a way to keep scoring).
**Why it's the keystone:** today the spotlight acts and everyone else waits. This gives the other N−1 players an act EVERY turn, turns the room into a live odds market ("he's gonna choke, look at him"), and — critically — lets eliminated players KEEP EARNING, which directly attacks the dead-rubber problem (lever 4).
**Impact:** high. **Risk:** med (new action + new score stream + new view flags + redaction surface).
**Code scope:** `state.ts` (add `bet` to `LastStandingAction`; add `spotBets: Record<PlayerId, 'survives'|'chokes'>` to state, reset per turn; add `betPoints` to scores or a sibling map; add `betPointsConfig` + `youBet`/`betsIn` to the `say` view variant). `actions.ts` (add `{kind:'bet', value}` to the zod union). `last-standing.ts`: new reducer branch in `say` (guard: phase===say, not spotlight, eligible, not-yet-bet, lock first); resolve bets inside `resolveJudge`/`toResult` (the only places a turn finalizes) by comparing each bet to the actual `valid`/eliminated outcome; clear `spotBets` in `enterTurn`. View: `say` variant gains `youCanBet`, `myBet`, `betsIn`.
**Test impact:** new `bets.test.ts` (lock-on-first, spotlight-can't-bet, eligibility incl. dead players, scoring correctness vs both outcomes, timeout/giveUp/left outcomes resolve bets too). Redaction: extend `redaction.test.ts` — `spotBets` mapping must never leak (counts only). `views.test.ts` — `say` variant flags. Existing `phases.test.ts` durations untouched.

#### P0-2. Rebalance the comeback curve — survival reward must not lap the field
**What:** change scoring so a single trailing player can win on the last round. Concretely: (a) lower `survivorPoints` from **3 → 2**; (b) make survival reward **escalate by round** so the LAST round is worth fighting for from behind — `survivorPoints + round` (round 0→+2, round 1→+3, round 2→+4), implemented as a pure function of `state.round`; (c) raise `validWordPoints` 1→1 but add a **lap bonus**: surviving deep into a round (each completed lap you're still alive) is already implicit — instead reward the per-word grind so an out-early-but-loud player stays alive on the leaderboard.
**Lever:** Tension & comeback (4), Legible stakes (2), One-more-round (6).
**Why:** today +3×3 survival = +9 floor for a survivor; words can't catch it. Escalating survival (2/3/4 = up to +9 still possible across a run, but the LAST round alone is worth +4) means a player who was out rounds 1–2 can still take the win by surviving round 3 + a couple of words. This is the single biggest tension fix.
**Impact:** high. **Risk:** low (pure constant + a one-line `round`-indexed function; no new state, no redaction change).
**Code scope:** `state.ts` (`survivorPoints` default; optionally add `survivorPointsPerRoundStep`). `last-standing.ts` `endRound`: `const bonus = config.survivorPoints + state.round * step`. Optionally surface the current round's survivor value in the `roundEnd` view's `pointsAwarded` (already shipped — it reads `survivorPoints`; just make it read the computed value).
**Test impact:** rewrite the scoring assertions in `actions.test.ts` ("exact scoring across a full round (design barème)") and `phases.test.ts` ("every survivor takes the bonus") to the new numbers. Low effort, mechanical.

#### P0-3. Re-time the phases — move time from `draw` to `result`, add a duel-tightening
**What:** `drawMs 4000 → 2500`; `resultMs 2000 → 2800` (elimination needs room to land the laugh, esp. the duel-ending kill); keep `judgeMs 6000`; keep the `say` decay (it is perfect — do not touch). Add a **duel beat**: when `aliveOf().length === 2` (the final two), bump `resultMs` for that turn only via a `phaseDurationMs` branch so the head-to-head kills land bigger.
**Lever:** Pace per phase (9), Payoff beats (3).
**Impact:** med. **Risk:** low (pure `phaseDurationMs` + config edits).
**Code scope:** `state.ts` config constants; `last-standing.ts` `phaseDurationMs` (add `result` duel branch: `state.phase==='result' && aliveOf(state).length<=2 ? config.duelResultMs : config.resultMs`). Note: a `result`-phase duration that depends on alive-count is fine — `phaseKey` already keys `result` by `turnSeq`, so the shell re-arms with the duel duration correctly.
**Test impact:** update exact-duration assertions in `phases.test.ts` ("exact durations", "decaying shot clock" unchanged). Add one duel-result-duration assertion.

### P1 — high impact, higher risk (or med impact, low risk)

#### P1-1. Live standings beat in `result` + a "one word from winning" cliffhanger
**What:** `result` already carries `scores`/`alive` in `viewBase` — the CLIENT should render a live mini-standing (it has the data). On the MODULE side, add to the `roundEnd` view a `cliffhanger` flag computed from `scores`: if the gap between 1st and 2nd ≤ the value of one survival, set `closeFinish: true`; expose `leaderId` and `runnerUpId`. Drives "X is ONE round from winning" UI and a tighter final-round.
**Lever:** Legible stakes (2), One-more-round (6), Tension (4).
**Impact:** med-high. **Risk:** low-med (view-only additions, no new actions/state; pure derivation from `scores`).
**Code scope:** `last-standing.ts` `view()` `roundEnd` and `over` branches add derived `closeFinish`/`leaderId`. `state.ts` view types. No reducer change.
**Test impact:** `views.test.ts` — assert `closeFinish` derivation at known score gaps; `over` superlative fields. Redaction unaffected (scores are already public).

#### P1-2. Streak / "on a run" surfacing for the session shell
**What:** the GAME can't own session streaks (the shell does), but it CAN export a per-game superlative signal the Oracle uses: in the `over` view add `survivedAllRounds: PlayerId[]` and `mostWordsValidated` (already derivable from `wordsValidated`). This feeds meta-01 superlatives ("Unbreakable", "The Mouth") so the END-OF-NIGHT roast names THIS game's moments — the real one-more-round pull lives at the session layer, and the game must hand it ammunition.
**Lever:** One-more-round (6), Social fuel (5).
**Impact:** med. **Risk:** low (additive `over` view fields; the meta-manifest already consumes opt-in superlative signals per §2).
**Code scope:** `state.ts` (`over` view variant gains `survivedAllRounds`); `last-standing.ts` track a `roundsSurvived: Record<PlayerId, number>` counter incremented in `endRound` for `roundWinners`, exposed only in `over`. `view()` `over` branch.
**Test impact:** new state counter — extend `phases.test.ts` full-walk to assert `survivedAllRounds` at `over`; redaction test confirms it only appears in `over`.

#### P1-3. "Sudden death" final round at a tie (config-gated)
**What:** when the last round ends with a top-score tie, optionally play one bonus single-word `say`-only showdown between the tied leaders (config `tieBreaker: 'none' | 'duel'`, default `'none'` to keep v1 behavior). Pure new phase reachable only from `afterRound` when `round` is terminal and `scores` has a top tie.
**Lever:** Payoff beats (3), Tension (4), One-more-round (6).
**Impact:** med. **Risk:** med-high (new phase, new transitions, new redaction/view surface — biggest surface here).
**Code scope:** new `'tieBreak'` phase in `LastStandingPhase`; `afterRound` branch; `phaseDurationMs`/`phaseKey`/`view` additions. Default-off so it ships dark.
**Test impact:** substantial new phase coverage; gate behind the default-off flag so existing tests are unaffected until enabled.

### P2 — experimental / nice-to-have

#### P2-1. Escalating-spice across rounds (content-config, zero engine)
**What:** the `ascending` difficulty curve already makes themes harder per round; pair it with a pack-authored `intensity` so later rounds also draw spicier/colder copy. Pure content + the existing `difficultyCurve` — no code.
**Lever:** Replay variety (8), One-more-round (6). **Impact:** low-med. **Risk:** low. **Code scope:** content pack only. **Test impact:** none (pack lint).

#### P2-2. "Grudge reveal" opt-in at `over` (DO NOT default-on)
**What:** experimental session-level toggle to reveal aggregate "most-buried player" at `over` (never per-vote — that violates TK16/D2). Counts only, anonymized voters. Default off; spicy-tier rooms only.
**Lever:** Social fuel (5). **Impact:** low. **Risk:** high (touches the sacred anonymous-jury rule; only counts, never per-vote, and only opt-in). **Code scope:** `over` view additive field gated by config + tier. **Test impact:** redaction test must prove no per-vote leak even with the toggle on.

---

## 3. Concrete timing proposals (ms per phase)

| Phase | Current | Proposed | Why |
|---|---|---|---|
| `draw` | 4000 | **2500** | Non-interactive spectacle; 4s drags the highest-attention opener. 2.5s still reads the slot-machine reveal. |
| `say` | 8000→3000 decay | **unchanged** | The decaying shot clock is the best mechanic in the game. Do not touch the curve, `sayDecayPerLapMs`, or `minSayMs`. |
| `judge` | 6000 | **unchanged** (6000) | Enough to thumbs-vote + argue; ends early on all-acted. Good. |
| `result` | 2000 | **2800** (normal) / **3600** (duel, `aliveOf ≤ 2`) | Elimination is the payoff beat and 2s clips the laugh. The final-two kill deserves more. |
| `roundEnd` | 4000 | **unchanged** (4000) | Survivor crown + ad boundary; fine. |
| `over` | null | unchanged (untimed) | Terminal. |

Net per-turn delta is roughly neutral (+800ms `result`, −1500ms `draw` once per round) — the room feels *tighter at the start, fatter at the kill*, which is exactly the right energy reallocation.

---

## 4. Keep as-is (do NOT touch — already sticky)

- **The decaying shot clock** (`sayMsForLap`, 8000→3000, `sayDecayPerLapMs 1500`, `minSayMs 3000`). It is the convergence guarantee AND the tension machine. Changing it would break both feel and the math safety belt. Sacred.
- **Jury-as-validation with no dictionary** (`resolveJudge`, `rejectThreshold 0.5` strict, tie→valid). The 5-second table fight is the product. Benefit-of-the-doubt keeps it "funny never cruel".
- **Anonymous tally counts only** — never reveal per-vote (`judgeVotes` mapping stays hidden even after resolution). Revealing who-voted-what weaponizes the jury and was explicitly cut (TK16/D2). Any social-fuel idea must respect this.
- **Eliminated players join the jury** (`deadPlayersJudge = true`). Nobody idle in spirit; this is the right default. (P0-1's side-bet extends this — it does not replace it.)
- **Jurors unscored.** Scoring votes corrupts them (lesson from ToD §5). The side-bet (P0-1) is a SEPARATE currency for the PREDICTION, not the verdict — keep the verdict itself unscored.
- **Spoken-only, zero typed text** (`actions.ts` has no free-text). Smallest moderation surface in the catalog. The side-bet adds only a binary enum — it does NOT open a text surface.
- **Seeded determinism** (`buildDeck`, per-`(round,item)` letter stream, cross-round `usedLetters` no-repeat). 105 items, ascending buckets — replay variety is already a 4.5. Leave it.
- **Presence ≠ elimination** handling (the whole disconnect matrix). It is exhaustively correct and tested. Do not refactor.
- **The content pack.** It is the best-written pack in the catalog (see §5) — sharpen a handful of items, do NOT rewrite.

---

## 5. Writing-polish priorities

**Headline: the content is NOT bland AI.** The 105-item pack already executes the voice guide — evidence→verdict drops with periods, call-out-the-room phrasing, jury-conflict-by-design themes. This is the opposite of the usual "blandly-AI" problem. Examples already shipping:
- `jdt-metiers-006` FR: *"Un métier. Ta daronne en voulait un pour toi. Regarde-toi."* — evidence→verdict, daron fuel, call-out. Textbook.
- `jdt-pizza-018` FR: *"Ça se met sur une pizza. Dis « ananas » et regarde la pièce se diviser."* — the theme TEXT seeds the jury fight the mechanic needs. Best-in-class.
- `jdt-ciel-041`, `jdt-roues-050`, `jdt-lourd-105` — explicitly engineer jury conflict.

So writing polish is **surgical, not wholesale.** Priorities:

1. **The hardest items (diff-3) lean on a weaker structure.** Several diff-3 themes are abstract ("C'est invisible mais ça existe. Comme tes efforts.") — funny, but they're harder to ANSWER under a 3s clock AND the abstraction softens the call-out. Audit the 6 diff-3 items: keep the cold roast, but make sure each still names a concrete answerable category so the shrinking-clock panic stays about WORDS not "what does this even mean". The decaying clock + an abstract theme = unfair-feeling timeouts (the §8 "injustice" risk).
2. **UI / verdict copy is where the AI-tell risk actually lives** (the pack is clean; the chrome is the gap). The shipped design only specifies stamp strings (`VALIDE ✅` / `💥 ÉLIMINÉ`). Per voice guide §5.14 these must be **verdict drops that get colder as the clock does**:
   - Elimination stamp variants (rotate, redaction-free, client-side): *"Silence. Éliminé. Cheh."* / *"Le thème t'a plié devant tout le monde."* / EN *"Cooked. Sit down."*
   - Survival with irony: *"Toujours en vie. Personne ne sait comment."* / EN *"Still standing. Nobody knows how."*
   - Jury-vote prompt invites bad faith: *"Le mot est faible ? Punissez."* / *"Déjà dit = pouce rouge."* / EN *"Weak word? Bury it."*
3. **Side-bet copy (new, P0-1)** must be a live-odds taunt, not a neutral prompt: FR *"Il va survivre ou il va choke ? Mise."* / EN *"Does bro survive or choke? Call it."* Reveal the correct predictors at `result` with a roast: *"Vous l'aviez vu venir. Lui non."*

**Two concrete prompt rewrites (sharpening, not fixing-broken):**

| BEFORE (current diff-3, weaker) | AFTER (sharper, answerable under clock) | Why |
|---|---|---|
| `jdt-invisible-099` FR: *"C'est invisible mais ça existe. Comme tes efforts."* | *"Un truc qu'on sent jamais mais qui pue quand y'en a trop. Genre ton aura ce soir."* | Keeps the cold roast, but "qu'on sent / qui pue" gives a concrete answer lane (gaz, odeur, wifi…) so the 3s clock panics about WORDS, not about decoding the prompt. Voice §1.1. |
| `jdt-comprendre-102` FR: *"Tu fais semblant de comprendre ça depuis des années. Là aussi."* | *"Un truc que personne capte mais que tout le monde hoche la tête dessus. Le crypto, la TVA, ton couple."* | Names the answer space (crypto/TVA/impôts/…) so it's playable fast; escalation ladder ends on the most incriminating ("ton couple"). Voice §1.3. |

**Spice curve.** Pack is 100% spicy-0 by design (D17) — correct for launch. The `jeu-du-theme-18` sibling (§5 of the design) is the spice escalation, pure pack+config. The IN-pack curve to enforce: ~60–70% edgy / 30–40% clean-absurd palate cleansers (voice guide §3 deck composition) so the dirty themes stay loud. Audit the 105 items against that ratio before the next pack version.

---

## 6. Ship order (summary)

| Priority | Change | Lever | Risk |
|---|---|---|---|
| **P0-1** | Spotlight side-bet (survives/chokes) — kills `say` idle, lets dead players earn | dead-time, social, comeback | med |
| **P0-2** | Comeback rebalance: survivorPoints 3→2, escalate by round | tension/comeback | low |
| **P0-3** | Re-time: draw 4000→2500, result 2000→2800 (+duel 3600) | pace, payoff | low |
| **P1-1** | `roundEnd`/`over` cliffhanger + live-standings flags | stakes, one-more | low-med |
| **P1-2** | `over` superlative signals (survivedAllRounds, mostWords) for the Oracle | one-more, social | low |
| **P1-3** | Config-gated sudden-death tie-break (default off) | payoff, tension | med-high |
| **P2-1** | Escalating-spice content config (zero code) | variety, one-more | low |
| **P2-2** | Opt-in aggregate grudge reveal (counts only, default off) | social | high |

**The single highest-leverage build is P0-1** (side-bet): it converts the room's idle majority into active predictors every single turn, gives eliminated players a way to keep scoring, and feeds the comeback curve — three of the four weakest levers at once, without touching the sacred clock, jury, or anonymity rules.
