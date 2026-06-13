# Vérité ou tu Bois / Truth or Drink — Final Game Design (SHIPPED)

| Field | Value |
|---|---|
| **Game id** | `truth-or-drink` |
| **Names** | FR **VÉRITÉ OU TU BOIS** · EN **TRUTH OR DRINK** |
| **Tagline** | FR « Une question vérité : tu réponds… ou tu bois. Santé ! » · EN "One truth question: answer it… or drink. Cheers!" |
| **Template + mode** | `TRUTH_DARE@2` — **truth-only** (`allowedChoices:['truth']`, choose phase auto-skipped) with the **drink/forfeit escape** (`escapeMode:'forfeit-draw'`) |
| **Module instance** | `createTruthDare('truth-or-drink', TRUTH_OR_DRINK_CONFIG)` (config in `packages/games/truth-dare/src/state.ts`) |
| **Players** | **min 2 · max 16** — `minPlayers: 2`, `maxPlayers: 16` straight from the module (`truth-dare.ts`). The authoring pack header says `players.max: 16`; the catalog floor is the module floor of 2 (the classic pair format) |
| **Spicy tier** | **2 (18+)** — `tone:'spicy'`, `minAge 18` on every drink-pack row, schema-enforced behind the device age gate. Default-surfaced safe sibling = `truth-or-forfeit` (all-ages, gage forfeits) |
| **Physical** | **seated** |
| **AI at runtime** | **None.** `needsOfflineAiPipeline: false` — no pre-computed item fields. No live AI; the platform forbids runtime AI. AI is optional offline *drafting* only, behind the human gate |
| **Status** | **SHIPPED** — implemented, tested, playable on the `truth-dare` module (`packages/games/truth-dare/`), config `TRUTH_OR_DRINK_CONFIG` |

---

## 1. Pitch & room fantasy

**One-liner.** One truth question fills every phone at once. The player in the hot seat answers it **out loud** to the room — or taps **« Je bois 🍺 »**, drinks one sip (or does a gage), and buys their silence. The room then votes whether the answer was a **real answer** or an **esquive** (dodge). Two laps of the table; most points wins.

**Room fantasy.** This is the **interrogation room with a bar tab**. Every question is engineered to be *worth dodging* — it aims at secrets with named stakes: an ex sitting in the room, group-chat treason, a body count, the worst drunk text ever sent. The drama is the fork: **answer and expose yourself, or drink and let the room imagine the worst.** Drinking is never the cowardly option — it's the *spicy* option, stamped « SANTÉ ! » with ceremony. The manufactured argument is the **verdict vote**: the table gets to call bullshit on a too-smooth answer (« Vraie réponse » vs « Esquive 🐔 »), which turns a private confession into a public trial. Brand spine **funny never cruel**: answering is *always* available so nobody is forced to drink; questions never target identifiable third parties or solicit doxxing/medical/illegal confessions; every forfeit is one-sip-only.

---

## 2. Shipped ruleset (AUTHORITATIVE)

All numbers below are quoted verbatim from `TRUTH_OR_DRINK_CONFIG` (`state.ts`) and the reducer (`truth-dare.ts`).

```ts
export const TRUTH_OR_DRINK_CONFIG: TruthDareConfig = {
  totalRounds: 2,
  chooseMs: 0,        // auto-skipped: allowedChoices has one entry
  promptMs: 35_000,
  verdictMs: 15_000,
  scoreMs: 7_000,
  passesPerPlayer: 0, // ignored: escape is unlimited under forfeit-draw
  allowedIntensities: ['party', 'spicy'],
  donePoints: 10,
  passPoints: 3,
  chickenedPoints: 0,
  dareBonus: 0,
  verdictThreshold: 0.5,
  allowedChoices: ['truth'],
  escapeMode: 'forfeit-draw',
  deck: null,
  labels: { escape:{fr:'Je bois 🍺',en:'I drink 🍺'}, claimDone:{fr:"J'ai répondu",en:'I answered'},
            verdictDone:{fr:'Vraie réponse ✅',en:'Real answer ✅'}, verdictChickened:{fr:'Esquive 🐔',en:'Dodged 🐔'},
            forfeitStamp:{fr:'SANTÉ !',en:'CHEERS!'} };
```

**Session shape.** A turn is the atomic spotlight beat (~35 s prompt + up to 15 s verdict + 7 s score ≈ **40 s typical**). `totalRounds: 2` laps of the seeded rotation: a 4–8-player room is 8–16 turns ≈ **8–12 min**; a full 16-player room is 32 turns ≈ ~25 min. The lap wrap is the **single mid-session ad boundary** (2 laps = exactly one interstitial).

### Phases (real `phaseKey` + `phaseDurationMs`)

`phaseKey(state)` returns `'over'` when terminal, else `` `${state.phase}:${state.turnSeq}` `` — keyed on **`turnSeq`** (a monotonic counter that `++` on every turn entry), NOT `round`, so 2-player laps never collide on the same key. `turnSeq` starts at 0.

| Phase | `phaseKey` | `phaseDurationMs` | Beat |
|---|---|---|---|
| **choose** | `choose:{turnSeq}` | `config.chooseMs` = **0 ms** | **Auto-skipped.** `allowedChoices.length === 1` → `enterTurn`/`init` call `resolveChoice(state, 'truth', …)` immediately, drawing the truth question. There is no UI beat, no auto-pick coin, no timer. The phase never renders. |
| **prompt** | `prompt:{turnSeq}` | `config.promptMs` = **35 000 ms** | The drawn truth question appears on **every** phone (everyone reads it — the fun is in the room). The active player answers out loud then taps **« J'ai répondu »** (`declare:done` → verdict) — or taps **« Je bois 🍺 »** (`pass`). Only the active player may act (others rejected to same-state). |
| **verdict** | `verdict:{turnSeq}` | `config.verdictMs` = **15 000 ms** | Reached **only** after a `done` claim. Every present non-active player votes **« Vraie réponse »** vs **« Esquive »** into a HIDDEN buffer. Early-resolves when `allActed(eligibleVoters, verdicts)`. First vote locks (re-votes rejected). |
| **score** | `score:{turnSeq}` | `config.scoreMs` = **7 000 ms** | Reveal card: verdict, public tally, points, and the forfeit card text (with the « SANTÉ ! » stamp) if a drink was taken. Auto-advances at the deadline to the next present player's turn, or to `over` after the final lap. |
| **over** | `over` | `null` (untimed terminal) | Scoreboard. Reducer is inert (`if (state.phase === 'over') return NOOP(state)`). |

### Scoring (exact constants)

Only the **active player** is ever scored; **voters never score** (this keeps the verdict honest — ToD design §5). All awards go through `toScore`, which adds to `scores[activePlayer]`.

| Outcome | Path | Points | Notes |
|---|---|---|---|
| **Verdicted real answer** | `declare:done` → verdict resolves `done` | **+10** (`donePoints`) | `dareBonus 0` (no dare choice exists, so `donePoints(config,'truth')` = 10). Tally `{done, chickened}` shown at score. |
| **Drink / forfeit taken** | `pass` (escape) | **+3** (`passPoints`) | Under `forfeit-draw`: **unlimited**, ignores the pass economy, draws one card from the `dare` deck and shows it at score (« Une gorgée ! / One sip! »). Verdict is **skipped** entirely — the drink is physically visible, a vote on it would be dead air. |
| **Self-admitted chicken** | `declare:chickened` | **0** (`chickenedPoints`) | Skips the vote (nothing to adjudicate). |
| **Dodged (voted down)** | verdict resolves `chickened` | **0** (`chickenedPoints`) | `done/cast < 0.5`. |
| **Prompt timeout / active disconnect** | deadline or `playerLeft` | **0** (`chickenedPoints`) | **NO forfeit drawn or assigned** — the platform never auto-assigns alcohol to a passive/absent player. |

**Verdict resolution rule** (`resolveVerdict`): `cast === 0 || done/cast >= verdictThreshold (0.5)` → `done`. So **zero votes → answered** (benefit of the doubt) and **ties → answered** (0.5 is `>=`). Eligible-voter set empty at entry (e.g. 2-player room, partner disconnected) → resolves instantly as `done` (`enterVerdict` guards this at entry, not just at deadline).

### Win / draw / tie

There is no explicit tiebreak inside the module: `gameOver(scores)` clones the raw `scores` map and the **shell** ranks it. Ties on points are surfaced as joint placement; cross-game session **XP is placement-based** (shell §1.7), so the internal 10/3/0 scale never needs to be comparable across games. Highest cumulative points after 2 laps is the room winner.

### Presence / disconnect behaviour

- **Active player leaves during `choose`**: no prompt drawn yet → `enterTurn` hands the turn on (emits `active_left`), skipping the reveal entirely. The room never blocks.
- **Active player leaves during `prompt`**: `chickened` (emits `active_left`) — 0 points, **no forfeit drawn**, no pass spent.
- **Active player leaves during `verdict`**: the `done` claim still stands; `resolveVerdict` fires with whatever votes are in.
- **Any voter leaves during `verdict`**: if their leave completes (or empties) the expected set, `resolveVerdict` fires; otherwise the buffer waits.
- **Rejoin** (`playerRejoined`): the player is simply re-marked connected and re-expected; no state rewind.
- **Turn rotation** uses `nextActiveSeat`, which **skips disconnected seats**, so a turn never lands on an absent player.
- **Pool exhaustion**: if a draw returns `null` (whole choice exhausted across all allowed tiers), the game ends gracefully → `over` + `pool_exhausted` analytics + `gameOver`.

### Redaction (what is secret from whom)

- **HIDDEN forever from `view()`**: the full item catalog (`itemsById`), the per-`choice:intensity` draw decks + cursors, `usedPromptIds`, and the `seed`. Only the *current* prompt text and the *last result's* text ever surface.
- **Per-voter verdicts are HIDDEN in-flight**: during `verdict`, the view exposes only `votesIn` (count) and `votersExpected` — **never** who voted what. Your own vote is echoed back (`youVoted`), never anyone else's. The full `{done, chickened}` tally only becomes public at `score`.
- **`canPass`/`youCanVote` are viewer-specific** (active-player-only escape; non-active connected non-voters only).
- The active player and the room **see the same prompt** — there is no hidden-prompt mechanic in this config (that footgun was deliberately kept out of TRUTH_DARE@2; see §5.4 of the wave-2 synthesis).

---

## 3. Content model

**Authoring item shape** (one bilingual master pack → the offline splitter emits single-locale runtime packs `truth-or-drink-fr` / `truth-or-drink-en` per cross-game-synthesis §3.1; `spicy`/`minAge` are catalog metadata dropped at build, `deck` is unused here):

```jsonc
{ "id": "totd-t-spicy-006",            // stable unique id = the no-repeat key
  "choice": "truth" | "dare",          // 'truth' = questions; 'dare' = the FORFEIT POOL (sip cards)
  "intensity": "soft" | "party" | "spicy",
  "text": { "fr": "...", "en": "..." },// shown verbatim, pre-moderated
  "minAge": 18,                        // 18 on every drink-pack row (schema-enforced for spicy)
  "tags": ["sex", "classic"] }         // freeform curation hints
```

The `choice:'dare'` rows **double as the forfeit pool** drawn when the active player escapes — this reuses the TRUTH_DARE deck machinery with **zero new content schema and zero new redaction surface**.

**Counts shipped** (`content/packs/truth-or-drink.json`, version 1): **189 items total**.

| `choice:intensity` | Count | Used by `truth-or-drink` (party+spicy)? |
|---|---|---|
| `truth:soft` | 40 | No (sibling pool) |
| `truth:party` | 50 | **Yes** (≥32 sizing-lint floor met) |
| `truth:spicy` | 45 | **Yes** (≥32 met) |
| `dare:soft` | 18 | No (sibling gage pool) |
| `dare:party` | 18 | **Yes** forfeit pool (≥16 met) |
| `dare:spicy` | 18 | **Yes** forfeit pool (≥16 met) |

minAge distribution: 131 rows at 18 (the party+spicy drink pack), 58 at 0 (the soft/safe-sibling rows). At `init` the module filters to `allowedIntensities: ['party','spicy']`, so the 58 soft rows (incl. the `totf-` safe-sibling gages) are **excluded from the live drink deck** — they still ship in the master and feed the `truth-or-forfeit` sibling. 53 distinct curation tags.

**What's AI-precomputed offline:** **nothing** (`needsOfflineAiPipeline: false`). No item field is computed at runtime or baked by an AI estimator. AI is permitted only as offline *drafting at volume* (e.g. ~770 bilingual ToD-family entries) behind the standard human gate: schema validation, sizing lints, obscenity scan, the **alcohol-excess lint** (rejects chug / « cul sec » / quantity-escalation wording), the **funny-never-cruel** authoring rule (no doxxing/medical/illegal/third-party-targeting), replay smoke with `leakedSecrets`, and per-locale transcreation sign-off.

**Voice / tone note** (content-voice guide §5.8 — *"interrogation room with a bar tab"*): questions must be **worth dodging** — if nobody would ever tap « Je bois » to avoid it, the question is too weak, cut it. The escape is the dramatic beat, so questions aim at secrets with named stakes (exes present, group-chat treason, money). Forfeit cards are deadpan-ceremonial (« SANTÉ ! »), one-sip phrasing only, lint-enforced. The verdict vote invites the table to call bullshit — copy should encourage the accusation. Register adds (§4.2 of the guide): direct sexual frankness as table stakes (body count, faked orgasms, threesome, plan cul), ken-tier FR vulgarity — but never incitement to actual harm or excessive-drinking framing.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / host-tunable bullet from §2.8 + the by-game `recommendations[]` and `risks[]`, each given a FINAL ruling. No TBD.

| # | Was (deferred/open/spicy item) | FINAL decision |
|---|---|---|
| 1 | **Drink-vs-gage toggle (the brief's open ask)** | **Ship v1 — two sibling configs, not a lobby switch.** `truth-or-drink` (this game: spicy/18+, sip forfeits, party+spicy) ships now. `truth-or-forfeit` (classic/all-ages, 10-second gage forfeits, soft+party) is the **default-surfaced** sibling. The "toggle" is which Home tile the group taps — age-gating is per-config and schema-enforced, so one tile can't be both 18+ and store-safe. **(Sibling content already ships in the master pack: 58 soft + `totf-` gage rows.)** |
| 2 | **Reconciliation with the existing truth-or-dare module** | **Shipped — same module, bumped @2 with three additive params.** `allowedChoices` (`['truth']` auto-resolves choose at 0 ms), `escapeMode` (`'pass'` default = ToD's skip economy, untouched | `'forfeit-draw'` = this game), `labels` (localized client copy). Existing `truth-or-dare-2` / lover configs keep all defaults and are byte-untouched. Verified live in `state.ts`/`truth-dare.ts`. |
| 3 | **Should the room verdict whether the player actually drank?** | **Cut — no.** Drinking resolves instantly via the escape path (skip verdict, +3, show forfeit card). The drink is physically visible; a vote on it is dead air. Verdict adjudicates only a contested `done` claim. Shipped exactly this way. |
| 4 | **Timeout / disconnect semantics on the question** | **Shipped — dodged, 0 points, NO forfeit drawn.** Prompt deadline or active-player leave → `chickened`. Verdict deadline → tally votes in; zero votes → answered. Hard platform rule: never block the room, never assign alcohol to someone not actually there. |
| 5 | **Responsible-drinking guardrails (18+ alcohol pack)** | **Ship v1 — multi-layer, mostly offline.** (a) Authoring alcohol-excess lint rejects chug/«cul sec»/escalation, caps every forfeit at one-sip phrasing. (b) **Persistent lobby footer**: « Bois de l'eau, ne conduis pas — les softs comptent » / "Drink water, don't drive — soft drinks count" → **host-tunable: no (always on for this config)**. (c) Answering is ALWAYS available (drinking never forced). (d) The safe `truth-or-forfeit` sibling is the promoted under-18 path. |
| 6 | **Session length: 2 laps × 16 players = 32 turns (~25 min)** | **Ship v1 default `totalRounds: 2`; auto-scale to 1 lap at large rosters is Roadmap v2.** Default stays 2 (4–8 players ≈ 8–12 min; lap wrap = exactly one ad). The "tighten to 1 lap when roster ≥ 10" scaling rule is **deferred to v2** as a host-tunable round count (see §6) — the module already reads `totalRounds` from config, so this is config/lobby-only, no code. Lean on the "play again" CTA for marathon sessions. |
| 7 | **Store compliance (alcohol) — Apple 1.4.3 / Google rating** | **Ship-gated — launch dependency, decided as a hard gate.** The config MUST ship `tone:'spicy'` + `minAge:18` (schema-enforced) behind the device age gate; under-18 devices only ever see `truth-or-forfeit`. **Region flags supported** (config-level): markets with stricter alcohol-content rules get the drink tile suppressed, forfeit sibling promoted. Product+legal sign-off is the real gate, not code. |
| 8 | **"Not pure config" — needs TRUTH_DARE@2 params before shipping** | **Resolved — done.** The three additive params are implemented and tested; the protocol `templateParamsSchema` grew accordingly. This is no longer a blocker. |
| 9 | **Excessive-drinking liability — final product+legal sign-off** | **Ship-gated.** Mitigations (#5) are in code/content; the **final product+legal sign-off before the spicy pack goes live** is retained as an explicit pre-launch checklist item (same gate as ToD §9 Q2). Not a code change. |
| 10 | **Verdict griefing — room votes a genuine answer as "Dodged"** | **Ship v1 — template mitigations, monitor.** Ties → answered, votes are unscored, individual votes never revealed (counts only). All shipped. **Decision: monitor `verdict_resolved` analytics for dogpiling** — if playtests show systemic griefing, the advisory-verdict rule (#11) extends upward. No further code now. |
| 11 | **2-player rooms make the verdict a single judge** | **Ship v1 as-is; advisory-only verdict below 3 players is Roadmap v2.** Accepted for the pair format (original Truth-or-Drink is literally played in pairs; an empty eligible set resolves instantly to `done`). If pair playtests feel punitive, v2 makes sub-3-player verdicts advisory (display-only, auto-`done`). Deferred, not cut. |
| 12 | **Spoken answers are off-platform & unmoderated** | **Ship v1 — authoring rule, accepted residual risk.** Questions must never target identifiable third parties or solicit medical/illegal/doxxing confessions — enforced in the offline safety scan (funny-never-cruel). The spoken answer itself is inherently unmoderatable; this is an accepted, documented residual risk mitigated entirely at authoring time. |
| 13 | **Pack exhaustion — 16 × 2 = 32 truth draws/game** | **Ship v1 — sizing lint + graceful fall-down.** Lint requires ≥32 truth rows/allowed tier + ≥16 forfeit rows/tier (met: 50/45 truth, 18/18 forfeit). At runtime the draw falls `spicy → party → soft`(within allowed tiers) then ends the game gracefully (`pool_exhausted`). Shipped. |

---

## 5. The 18+ spicy sibling config (concrete)

**This game IS the spicy member of the pair.** The "sibling" is the *safe* config, `truth-or-forfeit` — both run on the same `createTruthDare` module sharing one truth-question pack family. The concrete config diff:

| Field | `truth-or-drink` (THIS, 18+) | `truth-or-forfeit` (safe sibling) |
|---|---|---|
| `tone` (catalog) | `spicy` | `classic` |
| `minAge` (catalog) | **18** (schema-enforced under spicy) | **0** (all-ages, store-safe default) |
| Home-tile visibility | hidden on under-18 devices, behind age gate + region flags | **default-surfaced** |
| `allowedIntensities` | `['party','spicy']` | `['soft','party']` |
| Forfeit pool drawn (`dare` rows) | sip cards (« Une gorgée ! ») — `minAge 18` | 10-second gage cards (« parle avec un accent… ») — `minAge 0`, `totf-*` |
| `labels.escape` | « Je bois 🍺 » / "I drink 🍺" | « Je relève le gage » / "I take the dare" (copy-only) |
| `labels.forfeitStamp` | « SANTÉ ! » / "CHEERS!" | « GAGE ! » / "FORFEIT!" (copy-only) |
| Lobby footer | water/no-driving responsibility footer (always on) | none (no alcohol) |
| Mechanics (phases, scoring, `escapeMode:'forfeit-draw'`, durations) | **identical** | **identical** |

The mechanic is byte-identical; only `allowedIntensities`, the drawn forfeit pool (via intensity filter), `labels` copy, and the catalog `tone`/`minAge`/footer differ. **Anonymity is unchanged** (platform invariant — fully anonymous forever; no public-picks toggle exists; the only per-viewer privacy surface is the hidden in-flight verdict buffer, identical in both). Cost of the sibling: one KV config entry + one forfeit pool — **zero code**.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

The module reads everything from `TRUTH_OR_DRINK_CONFIG`, so any tunable is a config override the lobby can expose. The **allowlist for this game** (everything else is locked):

| Param | Default | Safe range | Notes |
|---|---|---|---|
| `totalRounds` (laps) | **2** | **1–3** | 1 lap for rosters ≥10 (quicker session, one fewer ad); 3 only for tiny rooms. Lap wrap = ad boundary, so capped at 3. |
| `allowedIntensities` (spice level) | `['party','spicy']` | `['party']` or `['party','spicy']` | Host may drop `spicy` for a tamer table; **cannot add `soft`** (that's the safe sibling's job) and **cannot remove `party`** (would risk pool starvation). minAge 18 stays regardless. |
| `promptMs` (answer time) | **35 000** | **20 000–60 000** | Slower tables get more talk time; faster for big rooms. |
| `verdictMs` (vote time) | **15 000** | **10 000–25 000** | |

**NOT host-tunable (locked):** `escapeMode` (always `forfeit-draw` for this tile), `allowedChoices` (always truth-only), the responsible-drinking footer (always on), `minAge`/`tone` (catalog-locked at 18/spicy — flipping these would mean tapping the *other* tile), all scoring constants (`donePoints`/`passPoints`/`chickenedPoints`/`verdictThreshold`) so the placement-based XP stays comparable.

---

## 7. Future modes roadmap (v2/v3)

Each line is a decided ship-later spec or a cut-with-reason.

- **v2 — Large-roster auto-scale (1 lap at ≥10 players).** *Ship.* Config/lobby rule that sets `totalRounds: 1` when the lobby roster ≥10 at game start. Zero module code (module already honours `totalRounds`); needs only a lobby pre-fill rule. (Resolves §2.8 session-length item #6.)
- **v2 — Advisory verdict below 3 players.** *Ship.* In a sub-3-player room, the verdict renders display-only and auto-resolves `done` (the empty-eligible-set path already does this; v2 makes it explicit + labels it "advisory" so the pair format never feels punitive). (Resolves §2.8 risk #11.)
- **v2 — Region-flagged alcohol suppression.** *Ship.* Catalog flag that hides the drink tile in stricter markets and promotes `truth-or-forfeit` there. Config-only. (Operationalises §4 #7.)
- **v3 — "Couples / spicy-couples" deck variant.** *Roadmap.* A `truth-or-drink` pack variant scoped to two-person intimacy questions, reusing the lover-deck authoring discipline. New pack ids only, same module/config. Ship only if couples-mode demand shows up in analytics.
- **v3 — "Soft launch" 0% rollout pack experiments.** *Roadmap.* Use `rolloutPct` to A/B fresh spicy batches against decay metrics before full promotion. Content-ops, not a game mode.
- **Cut — host-tunable scoring / custom point values.** *Cut.* Scoring constants stay locked so cross-game placement XP stays comparable (shell §1.7) and the verdict stays honest. Letting hosts retune points adds confusion for no fun gain.
- **Cut — "double or nothing" drink-stakes mode.** *Cut.* Escalating-stakes drinking directly violates the one-sip-only / no-escalation lint and the excessive-drinking guardrail. Non-starter for store compliance.
- **Cut — public per-vote reveal of the verdict.** *Cut.* Revealing who voted "Esquive" breaks the anti-griefing redaction (counts-only) and the funny-never-cruel spine; it would weaponise the verdict into a pile-on.

---

## 8. Risks & content-ops notes

- **Store compliance is the launch gate, not the code.** Apple 1.4.3 / Google alcohol-content rating review must pass with `tone:'spicy'` + `minAge:18` schema-enforced behind the age gate; under-18 devices only ever see `truth-or-forfeit`. Region flags ready for stricter markets. **Final product+legal sign-off before the spicy pack goes live is a hard pre-launch checklist item.**
- **Pack-sizing lint** (synthesis §3.5): ≥32 truth rows per allowed tier + ≥16 forfeit rows per tier. **Currently met** (truth party 50 / spicy 45; forfeit party 18 / spicy 18). CI should run this lint on every pack publish; the soft/`totf-` rows are excluded at `init` but must keep shipping for the sibling.
- **Freshness / decay.** Truth-or-Drink questions are the kind players remember; repeats kill the bit. The `usedPromptIds` no-repeat guard protects *within* a session, but **across sessions a small pool will recur fast**. Content-ops should track per-item serve frequency and rotate fresh spicy batches via `rolloutPct`; aim well above the 32-row floor (the recommendation cites ~770 bilingual ToD-family entries as the volume target) so the room rarely sees a repeat.
- **Moderation surface.** Two surfaces: (1) the **authored questions** — fully moderated offline (obscenity scan + funny-never-cruel rule: no third-party targeting, no doxxing/medical/illegal solicitation); (2) the **spoken answers** — inherently off-platform and unmoderatable, mitigated entirely by question design (don't *ask* for the dangerous confession). The verdict tally never names voters, so the verdict surface carries no moderation exposure.
- **Verdict griefing** is a behavioural risk, not a code bug: ties→answered, unscored votes, hidden individual votes all ship. **Monitor `verdict_resolved`** for dogpiling; escalate to advisory verdicts (v2) if observed.
- **Alcohol liability** is mitigated by lint (one-sip-only, no escalation) + always-answerable + the water/no-driving footer + the safe-sibling promotion — but it is a *residual* risk requiring the legal sign-off above; the platform never auto-assigns a drink to an absent/passive player (timeout/disconnect = 0, no forfeit drawn).
