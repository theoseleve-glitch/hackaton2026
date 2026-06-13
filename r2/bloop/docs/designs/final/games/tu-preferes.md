# Tu Préfères ? / Would You Rather — FINAL design

| | |
|---|---|
| **Game id** | `tu-preferes` |
| **Name (FR)** | Tu Préfères ? |
| **Name (EN)** | Would You Rather |
| **Template + mode** | `VOTE@2` — option-ballot, `scoring: 'predict-majority'` |
| **Module** | `@bloop/game-option-vote` → `createOptionVote('tu-preferes', TU_PREFERES_CONFIG)` |
| **Players** | min **3**, max **16** (module `minPlayers: 3 / maxPlayers: 16`) |
| **Spicy tier** | 0 (all-ages) shipped; an 18+ sibling config is specified in §5 |
| **Physical** | seated |
| **Status** | **SHIPPED** — reducer/views/configs implemented & tested; 261-item pack authored |

Sibling under the same module/config family: `gauche-ou-droite` (`GAUCHE_DROITE_CONFIG`, `scoring: 'majority-herd'` + debate). This doc covers **`tu-preferes` only**.

---

## 1. Pitch & room fantasy

**One-liner.** "Deux choix, zéro échappatoire. Devine le camp de tes potes !" / "Two options, no escape. Call which side the room picks!"

**The fantasy.** Classic would-you-rather, but the points never ride on *your* answer — they ride on **how well you read the room**. Each player makes two taps on one dilemma: their own pick (A/B), and a secret bet on which side the *majority* will land on. The reveal is a bar-race with everyone's avatar stacked under the option they chose, **names attached**. That is the whole engine: the split manufactures the argument ("TOI t'as choisi ça ?!"), and the prediction layer manufactures the second, better argument — being publicly *wrong about your friends* ("you really thought I'd pick A??"). Your own pick is score-neutral, so honesty is the dominant strategy; the only skill axis is knowing your people. A perfectly divisive dilemma — a 50/50 tie — is not a failure, it is the loudest moment of the night (the "PERFECT SPLIT" banner). Per the voice guide (§5.2): the deck's spine is **social-stakes dilemmas where the table splits and fights**, not whimsical superpowers — both options must cost something personal (dignity, secrets, the group chat).

---

## 2. Shipped ruleset (AUTHORITATIVE)

All numbers below are from `TU_PREFERES_CONFIG` in `packages/games/option-vote/src/state.ts` and the reducer in `option-vote.ts`.

### Config constants (`TU_PREFERES_CONFIG`)
| Field | Value |
|---|---|
| `scoring` | `'predict-majority'` |
| `totalRounds` | **8** (capped at pool length in `init`: `Math.min(8, items.length)`) |
| `chooseMs` | **15 000** ms |
| `revealMs` | **15 000** ms |
| `debateMs` | **0** — debate phase **disabled** for this config |
| `debateSkipThreshold` | 0.5 (inert here; only used when `debateMs > 0`) |
| `pointsCorrect` | **1** |

### Phases (`phaseKey` from `phaseKey(state)`; durations from `phaseDurationMs(state)`)

| Phase | `phaseKey` | Duration | Beat |
|---|---|---|---|
| `choose` | `choose:r{round}` | 15 000 ms | Dilemma card shows Option A vs Option B. Each player makes one **atomic** ballot `{ kind:'ballot', pick:'A'\|'B', predict:'A'\|'B' }` into the HIDDEN buffer (two-tap UI; second tap auto-submits). A ballot is *rejected* (same-state return) unless **both** `pick` and `predict` are `'A'`/`'B'` — for `predict-majority`, a ballot without a prediction is incomplete. Early-advance the instant `allActed(connectedPlayers, ballots)` is true. |
| `reveal` | `reveal:r{round}` | 15 000 ms | Atomic promotion of the buffer: tally, score, expose picks publicly. `result.counts`, `result.majority`, `result.picks` and `result.awarded` go public. Emits `analytics:round_revealed` on entry. Since `debateMs === 0`, `hasDebate` is `false` and there is no debate phase. |
| `debate` | — | — | **Not reachable** in `tu-preferes` (`debateMs: 0`). `afterReveal` calls `endRound` directly. (This phase only exists for the `gauche-ou-droite` sibling.) |
| `over` | `over` | `null` (untimed) | Terminal podium. Emits `gameOver` with a **cloned** scores map (`{ ...over.scores }`). Shell converts placement → session XP. |

**Round advance.** On the `reveal` deadline (or, in the debate sibling, after debate), `endRound` increments `round`; if `round >= totalRounds` → `over` + `gameOver`; else resets `ballots`/`skips`/`lastResult` and returns to `choose:r{n+1}`. Each round emits `analytics:round_completed`. The ad interstitial fires **client-side** off the `phaseKey` transition to `over` (server-shell design), never as a reducer effect.

### Scoring (exact)
On `resolveChoose`:
- Tally submitted picks: `a` = count of `pick==='A'`, `b` = count of `pick==='B'`. Non-submitters (timeout / disconnected) are simply absent from the tally → score 0 this round.
- **Majority** = the option with **strictly** more picks: `a > b ? 'A' : b > a ? 'B' : null`. `null` = perfect tie (incl. the degenerate zero-ballot case).
- If `majority !== null`: every player whose `ballot.predict === majority` gains `+pointsCorrect` (**+1**) and is pushed into `awarded[]`. **Your own pick never scores.** Predictions themselves stay private — only the `awarded[]` list (who scored) is public.
- If `majority === null` (tie): **nobody scores**; the reveal plays the "PERFECT SPLIT — ÉGALITÉ PARFAITE" banner. (`minorityCount` is untouched — it is only written by the `majority-herd` sibling.)

### Win / draw / tie
- **Win:** highest cumulative `scores` after 8 rounds → "Oracle of the group" / "Oracle du groupe" crown.
- **Round tie (50/50 split):** no points, celebration banner (above).
- **Final-score tie between players:** the module ships scores as a flat map and emits `gameOver` with the cloned map; **final-rank ties are broken by the shell's placement logic**, not in-game. The game does not implement a tiebreaker round (decided: not needed — see §4).

### Presence / disconnect
- `playerLeft` sets `connected[p] = false`. A leave **can complete** the expected set: if it leaves `choose` with `allActed(connected, ballots)` true, the round **resolves immediately** — an absent player can never block the room.
- `playerRejoined` sets `connected[p] = true` (idempotent: a no-op if already in the target state).
- Disconnected players are excluded from `expected` everywhere via `connectedPlayers`, so a passive/absent room never stalls; the `choose` deadline resolves with whatever was buffered.
- Actions from non-roster players (`!state.players.includes(playerId)`) are rejected with same-state.

### Redaction (what's secret from whom) — `view(state, viewer)`
- **`choose`:** `hasSubmitted` is a per-player **boolean** map only (never partial counts, never picks). `myBallot` is the **owner echo** `state.ballots[viewer] ?? null` — you see only your own buffered ballot. Both `pick` and `predict` of every other player are fully hidden until reveal. This is the anti-stall guard: a player who waits to "peek" sees only booleans, and the deadline resolves regardless.
- **`reveal`/`over`:** picks and the `awarded` list become public (`result.picks`, `result.counts`, `result.majority`). **Predictions are never exposed**, even at reveal — only *whether* a prediction was correct (via `awarded[]`). `scores` is public throughout.

---

## 3. Content model

**Item shape** (`OptionVoteItem`, bilingual authoring form):
```jsonc
{ "id": "wyr-...",                 // kebab-case, unique in pack
  "optionA": { "fr": "...", "en": "..." },   // ≤90 chars, completes "Tu préfères… / Would you rather…"
  "optionB": { "fr": "...", "en": "..." },   // comparably attractive/awful so the room genuinely splits
  "category": "absurd|food|social|deep",     // ("spicy" reserved for the 18+ sibling pack)
  "spicyLevel": 0,                            // 0|1|2; pack tone must be ≥ max item level
  "tags": ["..."] }                          // curation metadata, IGNORED by the reducer
```
The reducer reads only `id`, `optionA`, `optionB` (via `view().item`) and `id` (for `result.itemId`). `prompt`, `emoji`, `debateStarter` exist on the type but are **unused by `tu-preferes`** (they belong to the `gauche-ou-droite` axis-label form). `category`/`spicyLevel`/`tags` are pure curation metadata.

**Shipped pack** (`content/packs/tu-preferes.json`, `version: 1`): **261 items**, all `spicyLevel: 0`. Category mix: absurd 70, social 61, deep 66, food 64 (no `spicy`-category items in this all-ages pack). This is **~33× `totalRounds`** — far above the pool-sizing lint floor of `≥ 3 × totalRounds` (24) and above the "~200+ healthy pack" target. `init` shuffles with the **seeded RNG** (`shuffle(createRng(seed), items)`) and caps `totalRounds` at pool length.

**Publish pipeline.** The bilingual authoring pack is split into single-locale R2 packs `tu-preferes-fr` / `tu-preferes-en` per the platform `data.locale` convention; the shell resolves locale at `startGame`.

**AI precompute.** **None.** `needsOfflineAiPipeline: false` — the majority is computed deterministically at runtime from the room's own votes; nothing is precomputed. (Offline AI may *assist drafting* dilemmas at volume, but every entry passes the human gate; no AI runs at runtime, per platform invariant.)

**Voice/tone (voice guide §5.2).** "Genuinely horrible dilemmas, not whimsical ones." Both options must cost something personal — dignity, secrets, relationships, the group chat. Gross-absurd is welcome (sausage fingers stays) but the spine is **social-stakes dilemmas that split the table 50/50 and start a fight**. Kill every wholesome/superpower item (the early "talk to animals vs speak every language" sample is exactly the kind of low-stakes item the guide rejects — it is *not* in the shipped pack). The prediction layer means reveal copy should **taunt wrong predictors**: « Tu connais pas tes potes. »

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / hostTunable bullet from §2.2 and the by-game `recommendations[]`, ruled. No TBD.

| # | Former item (was) | FINAL decision (now) | Why |
|---|---|---|---|
| D1 | *Open: which scoring model?* | **Ship v1: predict-the-majority, exactly.** +1 per correct strict-majority prediction; own pick never scores; tie = no points. | Already shipped (`scoring:'predict-majority'`, `resolveChoose`). Only model where honesty about your own pick is dominant while adding a real "know your friends" skill axis. Rejected: majority-conformity, minority-reward, contrarian-oracle bonus (all create perverse incentives). |
| D2 | *Open: tie handling?* | **Ship v1: nobody scores + loud "PERFECT SPLIT / ÉGALITÉ PARFAITE" banner.** | Shipped (`majority === null` branch). Converts the scoring dead-end into the round's best moment. |
| D3 | *Open: public or anonymous picks?* | **Ship v1: public picks with names** (`publicPicks: true`, avatars stack + `+1` badges). Anonymity reserved for the 18+ sibling (§5). | Shipped: `result.picks` is public at reveal; predictions stay private. Debate needs names. |
| D4 | *Open: genuinely zero-code on VOTE?* | **Done — VOTE@2 generalization shipped.** `ballotKind:'options'` + `scoring:'predict-majority'` with the second hidden-buffer field is implemented in `option-vote.ts`. | The 1–2-day "new-params" work landed; every future variant (themed/spicy packs) is now pure Cadence B (KV config + R2 pack, no deploy). |
| D5 | *Open: one phase or split pick/predict?* | **Ship v1: one `choose` phase, one atomic `{pick,predict}` action, two-tap UI (second tap auto-submits).** | Shipped: single hidden buffer, single `allActed` check, no extra phaseKey churn. 15 s comfortably covers two taps. |
| D6 | *Open: minPlayers?* | **Ship v1: minPlayers 3** (module floor is also 3). | Shipped (`minPlayers: 3`). At 2, a disagreement is always a tie and prediction degenerates to "do we agree?". |
| D7 | *Defer to v2: streaks / bonus multipliers* | **Roadmap v2 — fire-streak, param-gated, OFF by default** (see §7). | Great juice + deterministic (one per-player counter), but adds reducer state beyond the quick-win scope. Doubles as the relief valve for tie-heavy small rooms (D-risk R2). |
| D8 | *Spicy content (sibling config later)* | **Roadmap v1.x — ship `tu-preferes-spicy` as a sibling config** (see §5 for the concrete diff). Launch all-ages-only. | game_config schema already enforces spicy ⇒ minAge ≥ 18; a sibling config is zero extra code and keeps the Home tile clean. |
| D9 | *hostTunable "extend debate" / fixed 15 s reveal can cut a great debate short* | **Ship v1: lobby-tunable `revealMs` (extends the reveal/debate-spill window).** Replaces a literal debate phase for this config — `debateMs` stays 0. See §6. | Pure config field already in the module; safe-ranged in the lobby allowlist. The relief valve the §2.2 risk asked for, without adding a phase. |
| D10 | *Final-score tiebreaker?* (implied open) | **Cut — no in-game tiebreaker.** Ties resolve via the shell's placement → XP logic. | Module ships scores as a flat map; cross-game XP is placement-based, so a tie at the podium is a tie in placement. Adding a sudden-death round is scope the quick-win game doesn't need. |
| D11 | *hostTunable round count* | **Ship v1: lobby-tunable `totalRounds`** (default 8), auto-capped at pool length. See §6. | `init` already honours and caps `config.totalRounds`; the lobby just exposes it within a safe range. |

---

## 5. The 18+ spicy sibling config (CONCRETE)

**Ship it** as a SIBLING catalog config — zero new code, pure Cadence B (KV config + R2 packs). It is **not** a separate module; it reuses `createOptionVote('tu-preferes-spicy', {...})`.

**Config diff vs `tu-preferes`:**
```jsonc
{
  "gameId": "tu-preferes-spicy",
  "module": "option-vote",
  "tone": "spicy",
  "minAge": 18,                 // schema enforces spicy ⇒ minAge ≥ 18
  "publicPicks": false,         // FLIP: anonymous percentages-only reveal — no avatars under options
  "packIds": ["tu-preferes-spicy-fr", "tu-preferes-spicy-en"],  // separate R2 packs, spicyLevel 1–2 items
  // unchanged from the all-ages config:
  "scoring": "predict-majority", "totalRounds": 8,
  "chooseMs": 15000, "revealMs": 15000, "debateMs": 0, "pointsCorrect": 1
}
```

**What changes and why:**
- **`publicPicks: false`** is the load-bearing flip. At spicyLevel 1–2 the dilemmas touch sex/intimacy/taboo; attaching names to picks crosses the "funny never cruel" line. Reveal shows the **bar-race split as anonymous percentages only** — predictions still score off the anonymous majority, so the prediction game is fully intact, but no avatar is pinned to a spicy answer.
  - *Implementation note:* `publicPicks` is a **catalog/view-layer** flag, not yet a module field — the reducer always computes `result.picks`. To honour `publicPicks:false` the **client must render percentages-only** AND the per-viewer view must redact `result.picks` down to counts for non-owners. This is a **~0.5-day view-redaction add** (the one piece of the sibling that is not literally zero-code); track it as part of shipping the spicy tile. Until it lands, the spicy pack must not ship.
- **Separate pack ids** keep all spicyLevel>0 content out of the all-ages catalog (pack tone ≥ max item level; the all-ages pack stays `spicyLevel:0`).
- **Scoring, rounds, timers unchanged** — the spice is in the *content*, not the math.

**Tone note for the spicy pack (extends voice guide §5.2):** keep the "both options cost something personal" spine, escalate the stakes into adult/taboo territory, but never punch at identities (voice guide §5.1) — only at behaviours/choices. The anonymity flip is what makes that safe.

---

## 6. Host-tunable params (lobby allowlist for `tu-preferes`)

| Param | Default | Safe range | Notes |
|---|---|---|---|
| `totalRounds` | 8 | **5–12** | Auto-capped at pool length by `init` (`Math.min`); pool is 261 so the cap is moot. Below 5 feels thin; above 12 overstays the TikTok-native ~30 s/round pacing. |
| `revealMs` ("debate length") | 15 000 ms | **8 000–30 000** ms | The relief valve (D9). Shorter for snappy rooms, longer for arguers; the reveal *is* the debate window since `debateMs:0`. |
| `chooseMs` | 15 000 ms | **10 000–20 000** ms | 15 s comfortably covers two taps; floor 10 s avoids timeout-path spam, ceiling 20 s avoids dead air. |
| `spicy` toggle | off | off / on | Switches the catalog entry to the `tu-preferes-spicy` sibling (§5); on ⇒ minAge 18 gate + anonymous reveal. Lobby-level, not a module field. |

`debateMs`, `debateSkipThreshold`, `scoring`, `pointsCorrect`, `ballotKind` are **NOT** host-exposed (changing them changes the game's identity / the sibling's identity).

---

## 7. Future modes roadmap

| Mode | Decision | One-line spec |
|---|---|---|
| **Fire-streak bonus (v2)** | **Roadmap v2, param-gated, OFF by default.** | One per-player `streak` counter in state; `+1` bonus on every 3rd consecutive correct prediction; gated by a new `streakBonus` config field so it's pure config once the reducer branch ships. Doubles as compensation for tie-heavy small rooms. |
| **`tu-preferes-spicy` (v1.x)** | **Ship-later (next content drop).** | 18+ sibling config per §5; needs the ~0.5-day `publicPicks:false` view-redaction add, then pure Cadence B. |
| **Themed seasonal packs (v1.x)** | **Ship-later, pure Cadence B.** | New R2 packs (e.g. "Spécial Fêtes", "Couples", "Boulot") under the same all-ages config — KV config + pack, no deploy. The 261-item base proves the authoring pipeline. |
| **Remote / async play (later)** | **Roadmap, zero realtime-layer change.** | Same DO room, same reducer; only the client transport differs. No game-specific work — covered by the platform's same-room-first/remote-later invariant. |
| **"Contrarian oracle" scoring variant** | **Cut.** | Bonus for predicting correctly while personally in the minority creates a perverse incentive to pick the side you predict will lose — explicitly rejected in D1. Not revisited. |
| **Live debate phase for `tu-preferes`** | **Cut for this config.** | The debate machinery exists (sibling `gauche-ou-droite`), but `tu-preferes` keeps `debateMs:0`; the tunable `revealMs` (§6) is the debate window. Adding a separate phase here only adds phaseKey/alarm churn. |

---

## 8. Risks & content-ops notes

- **Pack sizing / lint.** 261 items ≈ 33× `totalRounds`; the lint floor (`≥ 3 × totalRounds` per category mix, ~200+ healthy) is comfortably met. As `totalRounds` is host-tunable to 12, the floor rises to 36 — still trivially met. Lint must run **per locale** after the publish split (`tu-preferes-fr` / `-en`).
- **Content balance is the whole game.** Lopsided dilemmas make prediction trivial and kill the debate. Author/curate so A and B are comparably attractive/awful; **monitor `round_revealed`/`round_completed` analytics** for items that never split (candidates for retirement) and items that always tie at even counts.
- **Tie-heavy small rooms (4-player).** Even counts tie often → score-starved nights. Mitigated by the loud PERFECT SPLIT moment and by recommending odd-count rooms; the v2 fire-streak (§7) is the planned compensation. Watch tie-rate by player-count in analytics.
- **Tap friction.** Two decisions in one 15 s phase — the two-tap UI must make pick→predict one fluid gesture (second tap auto-submits) or slow players hit the timeout path. Watch the timeout-exclusion rate.
- **Redaction surface (mandatory tests).** `pick` AND `predict` are HIDDEN buffer fields until the atomic reveal; the owner-echo is `state.ballots[viewer] ?? null` only; the `choose` view exposes `hasSubmitted` **booleans** only, never partial counts. A leaked early tally would let players game their prediction. The `leakedSecrets` audit + per-viewer view tests are required, and **predictions must stay private even at reveal** (only `awarded[]` is public).
- **Freshness / decay.** Topical dilemmas (phone/social-media references) date faster than evergreen ones (food, body, deep). Plan quarterly content refreshes; the seeded shuffle means a stale top-of-pack item recurs predictably — rotate via pack edits, not reducer changes.
- **Moderation surface.** All-ages pack is `spicyLevel:0` and authored under the voice guide's "punch at behaviours/choices, never identities" rule (§5.1). The spicy sibling's anonymous reveal (§5) is the safety mechanism for higher-stakes content; its minAge:18 gate is schema-enforced. No live/user-generated content, so the moderation surface is the offline authoring gate only.
