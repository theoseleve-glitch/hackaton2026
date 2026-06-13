# devine-l-objet — Final Design (SHIPPED)

**Game id:** `devine-l-objet`
**Names:** FR *Devine l'Objet* · EN *Guess the Object*
**Template + mode:** `PERFORM_JUDGE` mode `credit` (`DEVINE_L_OBJET_CONFIG`, shared reducer with devine-l-action / mime-inverse / double-le-mouvement)
**Players:** 3–16 (`minPlayers: 3` from config, `maxPlayers: 16` hardcoded in `createPerformJudge`)
**Spicy tier:** 0 (all 135 pack items `spicy: 0`)
**Physical:** mixed (one performer mimes standing; the room judges seated on-phone)
**Status:** SHIPPED — module `packages/games/perform-judge/`, pack `content/packs/devine-l-objet.json` (135 items).

> **Authority note.** The shipped reducer is canonical over the wave-2 design prose. Two things the design doc text gets *wrong* vs. the shipped code, resolved here in favour of the code: (a) phase names — the design's `handoff/mime/validate/reveal` are realised in the generic shared reducer as **`ready` / `perform` / `judge` / `reveal`** (phaseKey `${phase}:${turnSeq}`); (b) the original `PERFORM_GUESS`/`PERFORM_GUESS` proposal collapsed into the consolidated `PERFORM_JUDGE` module — there is no separate module. Numbers below are quoted from `DEVINE_L_OBJET_CONFIG` in `state.ts`.

---

## 1. Pitch & room fantasy

**One-liner.** A secret cursed object lands on one player's phone; zero words, 45 seconds, the room shouts; the mime taps whoever nailed it first — then the table votes on whether that credit was *earned*.

**Room fantasy.** This is the classic charades reflex re-wired into a **claim-credit dispute engine**. The fun is not the mime — it's the fight *after* the mime. The performer points at one avatar and says "you got it"; instantly two people both yell « c'est MOI qui l'ai dit ! », and the app hands the room a gavel: a 12-second *"C'était bon ?"* validation vote. The game manufactures the argument the genre always produces in living rooms ("I said it first!", "you didn't even say the word!") and makes it *votable*, public, and scored. Performer and credited guesser score **identically** — so crediting the right friend is a social act with stakes, and crediting your mate who was scrolling Instagram is a cheat the table can strike down. The tone is a dispute-stoking referee (voice guide §5.15): mock-judicial, relishing « X s'attribue la victoire. Le tribunal populaire tranche. »

---

## 2. Shipped ruleset (AUTHORITATIVE)

### Phases (real `phaseKey` + durations from `DEVINE_L_OBJET_CONFIG`)

`phaseKey = ${phase}:${turnSeq}` (turnSeq is monotonic, ++ per turn entry — many turns per lap; terminal phase is bare `over`). The interstitial ad fires client-side off the phaseKey transition into `over` (server-shell design), never from a reducer effect.

| Order | phase | phaseKey | duration | Beat |
|---|---|---|---|---|
| 1 | `ready` | `ready:{turnSeq}` | **4 000 ms** (`readyMs`) | "Lève-toi, {nickname} !" spotlight. No actions accepted for credit mode (only guided/rate consume `ready`); the deadline auto-advances. The item is already drawn (offer sliced at turn entry); the secret is gated to the performer's own view. |
| 2 | `perform` | `perform:{turnSeq}` | **45 000 ms** (`performMs`) | Performer's phone shows the secret object (its own echo, `promptVisibility: 'performer'`). Everyone else sees only the **public category chip** (`categoryHint`, credit mode always exposes category) + timer and shouts guesses IRL. Performer taps a guesser avatar (`claimFound`) → `judge`; or `pass` (1/game). Deadline or performer disconnect = **MISSED** (`fail`, no pass burnt) straight to `reveal`. `performStartedAt` is set on entry (powers the deterministic fast bonus). |
| 3 | `judge` | `judge:{turnSeq}` | **12 000 ms** (`judgeMs`) | Reached only after a claim. The object becomes **public to ALL** (`publicItem`, claim is on the table — voters must know it). Every connected player except performer + credited guesser votes "C'était bon ?" yes/no. `adjudication: 'claim-validate'`. Resolves on all-acted or deadline. |
| 4 | `reveal` | `reveal:{turnSeq}` | **6 000 ms** (`revealMs`) | Public `TurnResult` for everyone: object + outcome stamp + aggregate tally + points + next performer. Deadline → `afterReveal` → rotate. Lap wrap emits analytics `round_completed {round: lap}` (the shell's interstitial boundary). After **2 laps** (`laps: 2`) → `over`. |
| — | `over` | `over` | `null` | Final scoreboard; `gameOver(cloned scores)` effect. |

> `scoreboardEvery: 0` → there is **no** dedicated scoreboard beat for this game (that beat exists only for puppet/mime-inverse). `promptChoices: 1` → one item per turn, `chosenIndex` fixed at 0 (no performer pick beat).

### Scoring (exact constants from `resolveValidate`)

- **Validated find** (`outcome: 'success'`): `award = successPoints + (fast ? fastBonusPoints : 0)` = **10**, or **15** with fast bonus. Awarded **identically** to BOTH the performer AND the credited guesser (`points[performer]` and `points[claim.guesser]`).
- **Fast bonus** (`fastBonusPoints: 5`): `fast = claim.at - performStartedAt <= performMs/2` → claim landed in the **first 22 500 ms** of the 45 s perform timer → **+5 each** (so **15/15**). Computed from server `event.at` deltas only — deterministic, no wall-clock.
- **Pass** (`outcome: 'passed'`): `passPoints: 0` → **0 points**, burns the single pass (`passesLeft[performer]--`).
- **Missed / timeout / performer-disconnect-during-perform** (`outcome: 'fail'`): **0**, no pass burnt.
- **Contested** (validation voted down, `outcome: 'contested'`): **0/0** — neither performer nor guesser scores.
- **Void** (performer leaves during `ready`, `outcome: 'void'`): **0**, item still revealed.
- Validation votes are themselves **unscored** (judges gain nothing for voting). `successPoints: 10`, `helperPoints: 0` (no helper economy in credit mode).

### Validation resolution (`resolveValidate`)

`valid = (cast.length === 0) ? true : yes/cast >= verdictThreshold` with `verdictThreshold: 0.5` and `zeroVotesSucceed: true`. So: **zero votes cast → valid** (benefit of the doubt), **ties → valid** (≥ 0.5 is generous), **empty eligible set → valid**. A hostile room can only sink a claim by an actual majority of `no`.

### Win / draw / tie

Highest cumulative `scores` after 2 full laps wins; the module returns `gameOver(scores)` and the shell ranks placement. The reducer does **not** break ties internally — `over` view ships the raw `scores` map; ties are a shell/scoreboard presentation concern. Cross-game session XP is **placement-based** (cross-game-synthesis §1.7), so this game's internal 10/15-point scale never needs to align with any other game.

### Presence / disconnect behaviour (`onLeft`, `nextActiveSeat`)

- **Performer leaves during `ready`** → `void` (0 pts, object revealed).
- **Performer leaves during `perform`** → `fail` / MISSED (0, no pass burnt) — a passive or absent performer can never block the room.
- **Performer leaves during `judge`/`reveal`** → votes decide / timers roll on (never aborts).
- **Voter leaves during `judge`** → eligible set shrinks; resolves if the remaining all-acted (empty set → valid). Leavers never block.
- Rotation **skips disconnected seats** (`nextActiveSeat` with connected filter); a greyed seat is never freed; `scores`/`passesLeft` preserved; a rejoiner takes their seat the next lap. Every phase is deadline-driven, so no disconnected/passive player can stall the game.
- **Pool exhaustion**: if `cursor + promptChoices > deck.length` at turn entry → early `over` + analytics `pool_exhausted`. With 97 drawable items and 16×2 = 32 max turns, this is unreachable in practice (see §3).

### Redaction (what's secret from whom)

`promptVisibility: 'performer'` → the secret object's name is the **performer's own echo only**. Every other roster player, every spectator, and every **unknown id** (treated as the performer's possible second device) is blind to the object during `ready` and `perform` — they get only `categoryHint` (the public category chip). At `judge` the object flips **public to all** (the claim is on the table). Individual ballots are **never** published — `votesIn`/`votersExpected` are counts only; `myVote` is the voter's own echo; the `reveal` tally is aggregate `{yes, no}` only. leakedSecrets audit surface: the in-flight `current.object` for non-performers pre-claim, all undrawn `deck` objects in every phase, and in-flight individual votes during `judge`. phaseKey and analytics strings never embed item ids or object text.

---

## 3. Content model

**Pack item shape** (`PerformJudgeItem`, the `object`/`category`/`difficulty`/`tags`/`spicy` subset used by credit mode):

```jsonc
{
  "id": "obj-easy-001",              // stable unique no-repeat draw key + report key
  "object": { "fr": "...", "en": "..." },   // THE SECRET — performer-only during ready/perform, public from judge
  "category": { "fr": "...", "en": "..." }, // PUBLIC hint chip, shown to all from perform start
  "difficulty": "easy|medium|hard",         // drawable iff in allowedDifficulties (easy+medium)
  "tags": ["household", "inRoomLikely", ...], // curation metadata
  "spicy": 0                                 // tone marker; default pack all 0
}
```

**Counts (shipped pack, v1, generatedAt 2026-06-11):** **135 items** — 45 easy, 52 medium, 38 hard. **97 are drawable** under `allowedDifficulties: ['easy','medium']`; the 38 hard items are authored-but-parked (see §7). 0 duplicate ids. Sizing lint (`≥ maxPlayers × laps = 16 × 2 = 32` per drawable difficulty): **PASS** (45 and 52 both ≥ 32). Tag distribution skews to `inRoomLikely` (36) and `household` (35) per the recommendation to curate toward common-room objects.

**AI-precomputed offline:** **none** (`needsOfflineAiPipeline: false`). No decoys, no generated alternates — this is the only PERFORM_JUDGE game with zero offline-AI dependency (contrast RULE_HUNT's decoy generation). Pack is hand-authored, bilingually transcreated, gated by the standard AI content-gate (schema + sizing + profanity scan), pinned by version for deterministic replay.

**Voice/tone note (guide §5.15 — "dispute-stoking referee").** Claim-credit is the conflict engine; copy anticipates and relishes the « c'est MOI qui l'ai dit ! » fight. Validation-vote copy is mock-judicial (« Le tribunal populaire tranche. »). Objects must be **concrete and slightly cursed** — the best mimes come from objects with one shameful use case. The shipped pack honours this: the `object` field is **not** the short-noun originals from the design samples ("une brosse à dents") but the rewritten cursed-anecdote register ("la brosse à dents partagée une fois en festival — les deux personnes concernées sont peut-être dans cette pièce"), with EN transcreated (not translated), categories as deadpan verdict-labels ("Hygiène douteuse / Hygiene, allegedly", "Crimes de cuisine / Kitchen crimes"). All `spicy: 0`, all hard-floor clean.

---

## 4. RESOLVED DECISIONS

Every deferred/open/v2/spicy/hostTunable item from §2.15, the by-game `recommendations[]`, and `risks[]` → a FINAL ruling.

| # | Former open item | FINAL decision |
|---|---|---|
| D1 | *Pre-mime "existence vote" (co-founder's open Q: be sure the object exists in the room)?* | **Cut as a standalone beat; shipped as the post-claim `judge` vote.** The 12 s `judge` *"C'était bon ?"* validation vote IS the repurposed idea — it keeps every non-performer engaged each turn and catches the only real cheats. No dead pre-mime beat. **Shipped v1.** |
| D2 | *Pack-driven vs. performer-chosen real objects?* | **Pack-driven — Ship v1.** Deterministic runtime (hard platform constraint), zero free-text moderation surface, curated bilingual comedy, difficulty tiers. Confirmed by the actions schema being enum-only (no free text). |
| D3 | *`bonusFetch` physical twist (8 s brandish-a-matching-object, +5, group-tap-confirmed)?* | **Roadmap v1.1, currently CUT from runtime.** The param does **not** exist in shipped `PerformJudgeConfig` (it was a `PERFORM_GUESS`-era flag; consolidation dropped it). Re-introducing it requires a 5th phase + a 2nd mini-vote per turn → pacing risk. Spec if shipped: post-`success`, 8 s `fetch:{turnSeq}` phase, first physical-brandish tap earns +5, one group tap confirms; default off, host-tunable. Gate on playtest demand for chaos. |
| D4 | *Share a template with devine-l-action ("même mécanique")?* | **Shipped v1 — yes, consolidated.** Both ride the single `PERFORM_JUDGE` reducer as game_configs (`DEVINE_L_OBJET_CONFIG` credit vs `DEVINE_L_ACTION_CONFIG` guided) + separate packs. The original two-module risk is closed. |
| D5 | *Harder objects score more (difficulty multiplier)?* | **Cut — flat 10/10 (+5/+5) shipped.** `successPoints: 10` flat, no multiplier field exists. Legible at a party, no fairness arguments; the fast bonus already rewards skill; session XP is placement-based so internal scale inflation buys nothing. Revisit only if playtest data shows hard-tier under-attempted (it isn't drawable in v1 anyway — see D11). |
| D6 | *16×2 ≈ 30+ min pacing at large rooms — cap maxPlayers or auto-scale laps?* | **Ship v1 with host-tunable laps (1–2) as the relief valve.** No hard maxPlayers cap below 16 (kept at 16). Host picks 1 lap for 10+ players in the lobby (see §6). Auto-scale stays a v2 nicety (D12), not a v1 blocker. |
| D7 | *Accessibility "describe-without-the-word" variant (miming excludes shy/low-mobility players)?* | **Roadmap v2 as a new pack/param, not v1.** The 1-pass economy + 0-cost misses + never-mock copy are the shipped relief valve. A `describe` channel (talk, don't mime, but the object word is taboo) would reuse the credit reducer unchanged with a forbidden-words pack — viable but unbuilt. **Roadmap v2.** |
| D8 | *Redaction load-bearing risk.* | **Resolved — shipped & enforced.** `promptVisibility: 'performer'` gates the secret to the performer's own view (and unknown ids stay blind); object is public only from `judge`; ballots never published; leakedSecrets audit covers deck + in-flight object + votes. No action outstanding. |
| D9 | *IRL honor-system grief (hostile "invalid" votes).* | **Mitigated in v1, monitor in prod.** `verdictThreshold: 0.5` + ties-to-valid + zero/empty-to-valid + unscored votes + no negative points anywhere. A claim can only fall to an actual `no` majority. **Ship v1**; watch the `contested`-rate analytic and revisit `verdictThreshold` only if abuse shows. |
| D10 | *Converge with devine-l-action on one module + pack schema before build.* | **Resolved — done.** Single `PerformJudgeConfig`/`PerformJudgeItem` schema backs all four games. |
| D11 | *`allowedDifficulties` — is `hard` drawable?* | **Ship v1: easy + medium only.** `hard` (38 items) is authored but parked behind the allowlist. **Roadmap v2:** a host "hard mode" toggle (or a difficulty-blend host param) unlocks them. |
| D12 | *Auto-scale laps to 1 at 10+ players.* | **Roadmap v2.** v1 leaves it to the host lap toggle (D6). v2 spec: if `players.length >= 10` default `laps` to 1 in the lobby (host can override). One-line, low-risk; deferred only because the manual toggle covers it. |

---

## 5. 18+ spicy sibling config

**Ruling: NO spicy (18+) tier for devine-l-objet — keep it spicy-0 single-tier.** Reasoned, not lazy:

1. **The mechanic is not a confession/intimacy engine.** Spicy tiers earn their gate where the *answer* is socially radioactive (truth-or-drink, truth-or-dare lover, pires-potes). Here the deliverable is a **mimed household object** — the comedy lives in the cursed-anecdote *framing of an object*, not in anything a player must say or do. There's no sexual or substance payload to gate.
2. **Edge is already maxed at tier 0 the right way.** Per voice-guide §3, spicy-0 is the *clean-hands, still-punchy* tier. The shipped pack hits exposure + petty-betrayal + cartoon-pettiness ("le voleur est ici et dort très bien depuis", "le saboteur est dans cette pièce et n'a jamais avoué") with zero innuendo. Adding a tier-2 object pack would mean innuendo-objects, which collapses the game into a worse version of truth-or-dare lover.
3. **Physical IRL mime + an 18+ object is a moderation/safety landmine** (a real body acting out a tier-2 object in a mixed room) for negligible upside.

**Concrete config:** the spicy sibling is the **null config** — `DEVINE_L_OBJET_CONFIG` stays as-is, `minAge` unset, one pack id `devine-l-objet` (`spicy: 0` enforced by the AI gate against pack tone). No `-18`/`-spicy` sibling pack id is reserved. If a future "after-dark party objects" pack is ever wanted it should ship as a **separate game_config** (its own catalog entry + age gate), not as a tier toggle on this one — exactly the separate-pack discipline the item shape already supports (`spicy: 0|1|2` must match pack tone).

---

## 6. Host-tunable params (lobby allowlist for THIS game)

| Param | Maps to | Default | Safe range | Note |
|---|---|---|---|---|
| **Laps** (rounds per player) | `config.laps` | 2 | **1–3** | The pacing relief valve (D6). 1 lap for 10+ players keeps a match under ~15 min; 3 only for small rooms (≤ 6). |
| **Perform timer** | `config.performMs` | 45 000 ms | **30 000–60 000 ms** | Shorter = more frantic / TikTok pacing; longer = friendlier to harder objects. Note the fast-bonus window is always `performMs/2`. |
| **Validation timer** | `config.judgeMs` | 12 000 ms | **8 000–20 000 ms** | Lower bound keeps the dispute snappy; never 0 (the vote is the conflict engine). |
| **Passes per player** | `config.passesPerPlayer` | 1 | **0–2** | 0 = hardcore (no mercy mime); 2 = inclusive/shy-friendly. |
| **Fast bonus** | `config.fastBonusPoints` | 5 | **0 or 5** | Off for a flat 10/10; on for skill reward. |
| **Hard mode** (difficulty blend) | `allowedDifficulties` | `['easy','medium']` | `+'hard'` toggle | Unlocks the 38 parked hard items (D11). |

Not host-tunable: scoring base (`successPoints` 10, fixed for legibility), redaction/visibility, adjudication mode, crewSize — these define the game's identity. The spicy toggle is **absent by design** (§5).

---

## 7. Future modes roadmap

| Version | Mode / change | Decision (one-line spec) |
|---|---|---|
| **v1.1** | `bonusFetch` chaos beat | **Roadmap.** Post-`success` 8 s physical-brandish beat, +5, group-tap-confirmed; default off, host-tunable; ship iff playtests demand more chaos (D3). |
| **v2** | Hard-mode unlock | **Ship-later.** Host toggle adds `'hard'` to `allowedDifficulties`; the 38 hard items already pass the gate (D11). |
| **v2** | Auto-scale laps | **Ship-later.** Default `laps = 1` when `players.length >= 10`, host-overridable (D12). |
| **v2** | `describe` accessibility channel | **Ship-later.** New pack + flag: speak (don't mime) the object while its name is taboo (reuse `forbidden` words); credit reducer unchanged; relief for shy/low-mobility players (D7). |
| **v2** | New content packs (same module, new theme) | **Roadmap.** The template was built for catalog leverage: `emotions`, `jobs`, `movies`, `songs` packs on credit mode — each a pack + game_config, zero reducer change. |
| **—** | 18+ spicy object tier | **CUT** with reason (§5): the mime-an-object mechanic has no intimacy payload to gate; edge is already correctly maxed at tier 0; a "spicy objects" idea must ship as its own game_config, never a toggle here. |
| **—** | Difficulty score multipliers | **CUT** (D5): flat scoring is a deliberate party-legibility choice. |
| **—** | Pre-mime existence vote | **CUT** (D1): superseded by the `judge` validation vote. |

---

## 8. Risks & content-ops notes

- **Pack sizing lint.** PASS today: 45 easy + 52 medium drawable, both ≥ the `16×2 = 32` floor; 38 hard parked. If `laps` host-max rises or `maxPlayers` ever increases, re-run the lint (`per-drawable-difficulty count ≥ maxPlayers × maxLaps`). Adding a 3rd lap host option does **not** raise the floor (no-repeat draw is over a single match's 32 turns max, well under 97 drawable).
- **No-repeat / freshness.** Deck is a single seeded shuffle (`createRng(seed+'|deck')`); within a match no item repeats (cursor advances). Across sessions, freshness depends on pack size — 97 drawable items is healthy but the cursed-anecdote register can feel repetitive faster than neutral nouns; **content-ops: target a +40–60 item refresh per quarter**, biased to under-represented categories (only 2 `fitness`, 3 `safety`, 4 `cleaning`/`diy`). Decay risk is low (objects are evergreen) except for any trend-anchored line — keep trend nouns out of categories (UI chrome) per voice-guide §1.9/§2.
- **Redaction (load-bearing).** Covered & shipped (§2, D8). Any future client work must keep the secret gated on `viewer === performer`, never an indexed lookup; the `judge` flip to `publicItem` is the only sanctioned reveal-before-reveal.
- **Moderation surface.** **Minimal** — actions are enum-only (`performJudgeActionSchema`, no free text), objects come from a pre-moderated pack, no AI at runtime, no offline-AI decoys. The only live moderation surface is the IRL honor system (§D9: monitor `contested`-rate; the `turn_resolved` analytic carries `outcome` for dashboards). The miming itself is unobservable by the engine — the validation vote is the sole on-platform anti-cheat.
- **Inclusivity.** Miming excludes shy/low-mobility players; shipped relief = 1 pass (host-tunable to 2), 0-cost misses, never-mock copy. The `describe` accessibility channel (D7) is the planned proper fix.
