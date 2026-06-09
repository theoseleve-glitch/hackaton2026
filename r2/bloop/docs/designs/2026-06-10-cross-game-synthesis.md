# Cross-Game Synthesis — Shared Mechanics, Contract Amendments, Build Order

**Date:** 2026-06-10
**Status:** Architecture decision (input to implementation planning)
**Author:** Platform architect
**Scope:** Synthesis of the four game designs (`impostor`, `truth-or-dare`, `hot-seat`, `rank-friends`)
against the implemented engine contract (`packages/engine/src/types.ts`, 50 tests green) and the
`tracer` template (`packages/games/tracer/src/tracer.ts`).

> **Authority note.** This doc does not modify any game doc or any existing source file. It is the
> definitive ruling on (1) what gets built once in `@bloop/engine`, (2) which contract amendments are
> approved, (3) shared content-pack conventions, (4) build order, and (5) inconsistencies the four docs
> must reconcile before implementation. Where a game doc asked for something already expressible in the
> current contract, this doc rejects it explicitly and names the section.

---

## 0. What the current contract actually is (the ruler we measure against)

From `packages/engine/src/types.ts` and `index.ts`, the contract surface is **exactly**:

```ts
interface GameModule<S, A, V, C = unknown> {
  id; version; minPlayers; maxPlayers;
  init(seed, players, content): S;
  reduce(state, event): { state: S; effects: Effect[] };   // pure
  view(state, viewer): V;
  phaseDurationMs(state): number | null;
}
type GameEvent<A> = action | deadline | playerLeft | playerRejoined;   // each carries `at`
type Effect = { type:'analytics'; name; props? } | { type:'gameOver'; scores };
```

Exported helpers today: `createRng`, `shuffle`, `replay`, `leakedSecrets`. **`emptyPlayerMap` is NOT
exported** — it is redefined locally inside `tracer.ts`, and every game doc copies it again. That is
the first piece of duplication to delete.

All four games fit this contract with **one** additive method (`phaseKey`) and **zero** new event or
effect types. Everything else the docs ask for is either already expressible or belongs in a shared
helper library that lives *alongside* the contract without changing it.

---

## 1. Shared mechanics to build ONCE in `@bloop/engine`

These are helpers/utilities, not contract changes. They live in `packages/engine` (or a sibling
`packages/engine/src/kit/`), are pure, JSON-safe, and unit-tested independently. Every game imports
them instead of re-deriving the pattern (the four docs currently re-derive all of them by hand).

### 1.1 `emptyPlayerMap` — null-prototype player-keyed map (extract from tracer)

Already implemented identically in `tracer.ts`; copied verbatim into all four game docs (impostor
§Appendix A, t-or-d §4, hot-seat §3.1, rank-friends §3). Promote it to the engine and export it.

```ts
/** Null-prototype, JSON-serializable map keyed by untrusted player ids. */
export function emptyPlayerMap<V>(): Record<PlayerId, V>;
```

Rationale (already in tracer): assigning `obj['__proto__']` on a default-prototype object silently
corrupts the map; null-proto stays JSON-serializable (unlike `Map`), which event-sourcing requires.

### 1.2 Presence model — `PresenceState` + `connectedPlayers` (kills the 4-way naming split)

The single largest inconsistency across the docs (see §5.1) is that each game invents its own
disconnect representation. Standardize on ONE shape and the predicates over it.

```ts
/** Canonical presence. `connected[p] === false` => greyed seat, still in roster. */
export type Presence = Record<PlayerId, boolean>;

export function initPresence(players: readonly PlayerId[]): Presence; // all true
export function setConnected(p: Presence, id: PlayerId, v: boolean): Presence; // copy-on-write
export function connectedPlayers(players: readonly PlayerId[], p: Presence): PlayerId[];
```

Convention (mandatory for all four games): the field is named **`connected: Presence`** in state,
initialized all-`true`, flipped by `playerLeft`/`playerRejoined`. `playerLeft` flips to `false`;
it NEVER deletes a roster key and NEVER changes scores (spec §6 "seat greyed, not freed"). Note this
is orthogonal to a game's own **elimination** concept (impostor `alive`, which is vote-driven only):
keep that as a separate game-local map. Presence ≠ elimination.

### 1.3 `allActed` — the all-acted-or-deadline predicate (build once, reused 4×)

Every game reimplements "have all the players we're waiting on acted?" (tracer
`state.players.every(p => votes[p] !== undefined)`; impostor §4.3 "alive && connected"; t-or-d §4
"eligible voters"; hot-seat `allAnswered`; rank-friends `activePlayers(...).every(...)`). One helper:

```ts
/**
 * True when every expected actor has an entry in `acted`.
 * `expected` is the game-specific eligible set (e.g. connected players,
 * connected-and-alive, present-non-active). The game computes `expected`; the
 * engine owns the "all present in the buffer" loop so the disconnect-can't-stall
 * rule is implemented identically everywhere.
 */
export function allActed<V>(
  expected: readonly PlayerId[],
  acted: Record<PlayerId, V>,
): boolean;
```

This bakes in the platform-wide rule that **a disconnected player can never stall a phase past its
deadline** (spec §6): the game passes a `connected`-filtered `expected`, so absent players are simply
not awaited. It does NOT decide eligibility (that stays game logic) — it only owns the buffer-complete
loop so the four games stop hand-rolling it with subtly different bugs.

### 1.4 Turn rotation — `nextActiveSeat` (impostor clue, t-or-d turn, hot-seat hot seat)

Three of four games rotate a "current actor" through a fixed seeded order, skipping disconnected
seats, wrapping at the end, and never deadlocking when everyone is gone (impostor `turnOrder`/
`turnIndex` §4.2; t-or-d `enterTurn` §4; hot-seat `nextConnectedSeat` §4.4). One helper:

```ts
/**
 * Advance from `fromIndex` forward through `order` (mod length) to the next
 * connected seat. If NO seat is connected, returns (fromIndex + 1) % length
 * (degenerate, non-deadlocking — the shell's empty-room/grace logic ends it).
 * `wrapped` lets the caller bump a round/lap counter on wrap.
 */
export function nextActiveSeat(
  order: readonly PlayerId[],
  fromIndex: number,
  connected: Presence,
): { index: number; wrapped: boolean };
```

rank-friends does not rotate a seat (everyone acts simultaneously) and simply won't import this.

### 1.5 Simultaneous-hidden-input + atomic reveal — the `HiddenBuffer` convention + `tally`

The platform's signature beat (spec §6: "buffered into hidden state … promoted into public views in
one atomic broadcast"). tracer's hidden `votes` → public `tally` is the reference; impostor `votes`,
hot-seat `answers`, rank-friends `ballots`, t-or-d `verdicts` are all the same pattern. We do NOT
abstract the *semantics* (each game's reveal math differs), but we DO provide the two reusable pieces:

```ts
/** Count occurrences of each value in a player-keyed buffer (generalizes tracer.tallyVotes). */
export function tally<T extends string>(buffer: Record<PlayerId, T>): Record<T, number>;

/** True iff `viewer` is the owner — use to gate the owner-only echo (myVote/myAnswer/myOrder). */
// (convention, not a function: every view computes `mine = buffer[viewer] ?? null`,
//  structurally preventing foreign-secret leakage — see tracer myVote, rank myOrder.)
```

The **convention** (mandatory, enforced by tests via `leakedSecrets`): hidden buffers are named in
state with a doc-comment `HIDDEN`, never appear in any `view()` for a non-owner, and are promoted to
public aggregates (`tally`/`tally`-derived) only on the reveal transition. The owner-only echo is
always `buffer[viewer] ?? null` — never an indexed lookup that could return a foreign value.

### 1.6 `phaseKey` conventions (see §2 for the contract amendment itself)

`phaseKey` is the one *contract* addition (§2). The **convention** for its string scheme, which the
four docs currently format four different ways, is standardized here so the shell's diff logic is
uniform and the strings are safe to log:

- Format: colon-delimited segments, lowest-cardinality first: `"<phase>"` or `"<phase>:<r{round}>"`
  or `"<phase>:<r{round}>:<sub>"`. Terminal phase is always the bare string `"over"`.
- **It MUST change on every transition the shell reacts to** (new alarm, ad check, broadcast),
  including per-turn and per-reveal-beat transitions.
- **It MUST NOT embed a secret** (treat as logged). No words, roles, ballots, answers.
- **Uniqueness rule:** if a game has multiple actor-turns inside one logical round (impostor clue
  turns, t-or-d turns), the key MUST include a component that is unique per (phase, turn) — either a
  per-turn index (`clue:r0:t3`) or a global monotonic `turnSeq` (`prompt:7`). `round` alone is NOT
  sufficient for those games (t-or-d §2 correctly identifies this; the convention makes it a rule).

Optional shared formatter (sugar, not required):

```ts
export function phaseKeyOf(phase: string, round?: number, sub?: string | number): string;
// phaseKeyOf('over') -> "over"; phaseKeyOf('reveal',0,'gold') -> "reveal:r0:gold"
```

### 1.7 Scoring / XP convention (normative; helpers optional)

The four docs use wildly different point scales (see §5.3). The engine does not need a scoring API —
`scores: Record<PlayerId, number>` already flows through `gameOver`. But the platform needs ONE
**convention** so the cross-game session leaderboard (shell-owned) is meaningful:

- **Per-match scores are match-local and start at 0 each `init`** (already every doc's decision; the
  shell owns the session running-total — impostor §5.2). Keep it.
- **Normalize the *display* leaderboard, not the reducer.** Each game keeps its natural internal
  scale (Borda 1–3, 0/3/10/15, 50/100). The shell computes a per-match **placement** (1st/2nd/…) and
  awards session XP off placement, NOT raw points, so a hot-seat 750 doesn't dwarf a tracer 3. This is
  a shell rule; it requires nothing from the engine.
- **`gameOver.scores` must be the final per-match scores, cloned (never aliasing live state)** — the
  tracer invariant (`phases.test.ts` "gameOver effect scores do not alias live state"). Mandatory for
  all four games; the helper below makes it hard to get wrong:

```ts
/** Build the gameOver effect with a defensively cloned scores object. */
export function gameOver(scores: Record<PlayerId, number>): Extract<Effect, { type: 'gameOver' }>;
// returns { type: 'gameOver', scores: Object.assign(emptyPlayerMap(), scores) }
```

### 1.8 Text normalization — `normalizeText` (impostor guess compare; future write-your-own modes)

Impostor §6.3 needs deterministic "café === Café" comparison (trim, lowercase, strip diacritics +
punctuation). It is the only game that compares player text today, but t-or-d §9 and hot-seat §9 both
flag future "write your own" modes that will want the same. Build it once, pure:

```ts
/** Deterministic, locale-independent normalization for equality compares. NOT a profanity filter. */
export function normalizeText(s: string): string;
```

(The profanity filter stays at the DO boundary — spec §6/§10 — and is explicitly NOT an engine
concern. `normalizeText` is for in-reducer equality only.)

---

## 2. Definitive engine / contract amendments

Ruthless YAGNI applied. The bar: an amendment ships only if at least one game **cannot** express its
behavior within the current contract. Exactly one method clears that bar.

### APPROVED — additive

#### A1. `phaseKey(state: S): string` — **ADDITIVE** (the known planned gap)

```ts
interface GameModule<S, A, V, C = unknown> {
  // ...existing...
  /** Stable per-phase-instance label; changes on every shell-observable transition. Never a secret. */
  phaseKey(state: S): string;
}
```

- **Why it's genuinely needed (all four games):** the shell cannot generically detect phase
  transitions to (a) re-arm the single-alarm multiplexer (spec §6), (b) fire the between-rounds
  interstitial, (c) trigger the atomic broadcast. `phaseDurationMs` diffing is insufficient: impostor
  clue turns and rank-friends reveal beats keep the **same** duration across distinct transitions
  (per-turn `clueTurnMs`; `revealStepMs` for both bronze and silver), so a duration diff misses them.
  Only a key that changes per transition works. This is the documented "KNOWN CONTRACT GAP."
- **Additive, not breaking?** Adding a required method to an interface is technically a breaking change
  for *existing implementors* — but the only implementor today is `tracer`, which we control. **Ruling:
  add it as a required method AND add `tracer.phaseKey` in the same change** (`vote:r{round}` /
  `reveal:r{round}` / `over`), so the contract stays internally consistent and the "50 tests green"
  baseline grows by a few rather than breaking. Net effect to game authors: additive.
- **Migration cost:** `tracer` gains ~4 lines + 1 test. Engine `GameModule` gains 1 method + doc.

That is the **entire** approved amendment list. One method.

### REJECTED — expressible within the current contract (per-game ruling)

#### R1. Impostor — new `Effect` variant `{ type: 'adSlot' }` for mid-session ads — **REJECTED**

Impostor §8.3 floats this and **correctly self-rejects it** ("not needed now"). Confirmed rejected:
ads are 100% client-side (spec §3); the shell fires the interstitial off the `phaseKey → 'over'` (or
`→ scoreboard:*`) transition. No effect type is needed. If product ever wants the *module* to demand
an ad mid-round, revisit then — not now.

#### R2. Impostor — "multi-timer" / per-turn timer contract — **REJECTED**

Impostor §8.5 wants per-turn timers inside one `clue` phase. Already expressible: `phaseDurationMs`
returns the per-turn duration and `phaseKey` changes each turn (`clue:r0:t0` → `clue:r0:t3`), so the
shell re-arms on the key change. No "multi-timer" primitive. Confirmed: the doc reaches the same
conclusion; ruling upholds it.

#### R3. Impostor — engine-level disconnect/eviction handling — **REJECTED**

Impostor §4.3's "alive && connected" resolution rule, eviction, and room-collapse are **reducer
logic** built on the existing `playerLeft`/`playerRejoined` events. No new event type. (We DO factor
the `connected` presence map and `allActed` into shared helpers — §1.2/§1.3 — but that's a library,
not a contract change.)

#### R4. Truth-or-Dare — `round_completed` as the ad signal needing a new effect — **REJECTED**

T-or-D §5/§8 routes the between-rounds ad cue through an `analytics`/`round_completed` effect — i.e.
it explicitly needs **no** new effect type, reusing the existing `analytics` variant. Confirmed
correct and rejected as a contract change. **However**, see §5.4: the *analytics event name* must be
reconciled with the other three games, which emit `round_revealed`. That's a naming fix, not a
contract amendment.

#### R5. Truth-or-Dare / Hot-Seat / Rank — "shell derives phaseKey from view" as a contract hedge — **REJECTED as a contract item; KEPT as a fallback note**

T-or-D §2/§8 and hot-seat §8 note the shell could derive the key from `view.turnSeq + view.phase` if
`phaseKey` slips. Good defensive design, but it is NOT a contract change and should NOT be the shipped
path. **Ruling:** ship `phaseKey` (A1); the view-derivation is a one-release fallback only. Do not
design the shell around two key sources.

#### R6. Hot-Seat — nickname/`subjectId` substitution as an engine need — **REJECTED (it's a convention)**

Hot-seat §8.2 already concludes this needs nothing from the engine: `init` stays identity-free, the
rendered `HotSeatQuestion` carries `subjectId: PlayerId`, the client substitutes the nickname.
Confirmed: pure client/engine responsibility split, no contract change. (See §3.4 for the cross-game
rule that the engine NEVER handles nicknames.)

#### R7. Hot-Seat — `hotSeatAnswer: 0 | 1 | null` "contract refinement" — **REJECTED as a contract item**

Hot-seat §4.6/§8 calls the `null` widening a "contract refinement to §3.3." It is not — `View` is
game-defined (`V` is the module's own type); widening a field in the game's own view union touches no
shared contract. **Ruling:** it's a game-internal type fix (and the doc has an internal inconsistency
about it — see §5.5). Not an engine amendment.

#### R8. Rank-Friends — atomic hidden-state-to-view promotion — **REJECTED (it already exists)**

Rank-friends §8 lists this as a "confirmation, not a change." Correct: spec §6 already guarantees the
shell promotes hidden state to views in one atomic broadcast on transition. Nothing to add.

#### R9. Any game — new event types for join/reconnect/skip-reveal — **REJECTED**

No game needs a mid-game join event (roster fixed at init — types.ts contract). Rank-friends §9 floats
a host `skipReveal` action; t-or-d §9 floats per-turn intensity — both would be **new `Action` union
members inside a game's own `A`**, not engine events, and both are out of scope for v1 anyway.

### Summary table

| # | Requested by | Item | Ruling | Additive / Breaking |
|---|---|---|---|---|
| A1 | all four | `phaseKey(state): string` | **APPROVE** | Additive (update tracer same-change) |
| R1 | impostor | `Effect: adSlot` | Reject | — |
| R2 | impostor | multi-timer primitive | Reject | — |
| R3 | impostor | engine disconnect/eviction | Reject (reducer + shared helpers) | — |
| R4 | truth-or-dare | new effect for ads | Reject (reuse `analytics`) | — |
| R5 | t-or-d/hot-seat | phaseKey-from-view as contract | Reject (fallback note only) | — |
| R6 | hot-seat | nickname/subjectId engine need | Reject (convention) | — |
| R7 | hot-seat | `hotSeatAnswer` null "refinement" | Reject (game-local view type) | — |
| R8 | rank-friends | atomic promotion | Reject (already in spec §6) | — |
| R9 | rank/t-or-d | new events/actions | Reject (game-local / out of scope) | — |

**Net: one additive method. Everything else lives in shared helpers (§1) or is already in the
contract.**

---

## 3. Content pack conventions across games

All four packs already target the engine's `ContentPack<D> = { id, version, data }` envelope (spec §3,
R2-hosted, versioned JSON). Standardize the `data` envelope and the localization/versioning rules so
the catalog, the loader, and the moderation kill-switch treat every game's pack uniformly.

### 3.1 Shared `data` envelope

Every game's `data` MUST carry these two fields, plus its game-specific payload:

```ts
interface PackDataBase {
  /** Single-language pack. ISO-639-1. Mixed-language packs are NOT supported. */
  locale: 'fr' | 'en';
  /** Content rating for catalog filtering + store-compliance gating. */
  tone?: 'classic' | 'spicy';
  /** game-specific arrays below (pairs | entries | questions | prompts) */
}
```

This reconciles four near-identical-but-inconsistent shapes:

| Game | Payload field | Current locale field (per doc) | Reconcile to |
|---|---|---|---|
| impostor | `pairs: WordPair[]` | per-entry `lang` on each pair | `data.locale` + drop per-entry `lang` (see §5.6) |
| truth-or-dare | `entries: TodPromptEntry[]` | `data.lang` + per-entry `lang` | `data.locale` (rename `lang`→`locale`), keep per-entry only if needed for lint |
| hot-seat | `questions[]` | `data.locale` | already correct — canonical |
| rank-friends | `prompts: string[]` | `data.locale?` | make `locale` required, keep `tone` |

**Ruling:** the field is **`locale`** everywhere (hot-seat and rank-friends are already right;
impostor uses per-entry `lang`, t-or-d uses `data.lang` — both must rename). Single-language packs:
one `locale` per pack `id`; FR and EN ship as **separate pack ids** (`tod-classic-fr`,
`tod-classic-en`), never mixed (t-or-d §6 rule, generalized to all).

### 3.2 Versioning

- `ContentPack.version` is a monotonic integer, **bumped on every edit, never mutated in place**
  (rank-friends §6, impostor §6.1 — already aligned). R2 objects are immutable per version.
- A KV catalog entry pins the live `{ packId, version }` per game per locale; a **kill switch** in KV
  disables a bad pack region-wide without a deploy (spec §3/§4; all four docs cite this). The reducer
  receives whatever `ContentPack` the shell hands `init`; it never selects a version itself.
- Snapshot/replay note (spec §7): because `init` consumes the pack, **a room pins its pack version for
  its whole life**. Replay determinism requires the *same* pack version on rehydration — the shell
  stores the resolved `{ packId, version }` alongside the seed. This is a shell rule; restate it in
  each game's test plan (replay test must feed the identical pack).

### 3.3 Localization FR/EN

- Two launch locales: **FR and EN**, parallel coverage required (impostor §6.2 "maintain parallel
  FR/EN coverage"; generalize). Each is a separate pack id.
- Pack selection is **shell-owned**: the host/room locale picks the pack id at `init`; the engine is
  identity- and locale-policy-free (it just shuffles `data` and indexes, like tracer takes
  `prompts[0]`). Impostor §6.1's "init filters by locale" is **rejected** in favor of the cleaner
  rule: the shell selects the locale-correct pack id; `init` does not filter (consistent with hot-seat
  and rank-friends; see §5.6).
- Per-entry `minAge` (t-or-d) and `tags` (all) are advisory metadata for catalog/curation; the
  reducer ignores them except where a config gate (`allowedIntensities`) excludes a tier from draws.

### 3.4 Identity rule (applies to content rendering)

The engine NEVER sees nicknames. Where a pack template references a player (hot-seat `{name}`), `init`
leaves the token intact and the rendered item carries a `subjectId: PlayerId`; the **client**
substitutes the nickname from lobby roster (hot-seat §6.1/§8 — generalize as the platform rule for any
future templated pack). Packs reference players by token, never by literal name.

### 3.5 Authoring sizing rule (shared)

For draw-without-repeat games (t-or-d decks, hot-seat questions, rank/impostor prompts/pairs), a pack
SHOULD supply enough entries that a max-size game never exhausts mid-session: t-or-d §6 codifies
`>= maxPlayers × totalRounds` per `(choice, intensity)`; generalize as **"size every drawable pool to
at least the worst-case draw count for `maxPlayers` at default `totalRounds`."** Enforce as a soft
authoring lint, not a runtime error; runtime exhaustion degrades gracefully (cap `totalRounds` like
tracer's `Math.min(totalRounds, pool.length)`).

---

## 4. Recommended build order for the 4 games

Ordering optimizes for **reuse gradient** (each game seeds helpers the next reuses) and **demo value**
(earliest visible "wow"). All four are 3–16 players except t-or-d (2–16).

### Build order: **1) rank-friends → 2) hot-seat → 3) truth-or-dare → 4) impostor**

| # | Game | Why here | What it establishes for later games |
|---|---|---|---|
| 1 | **rank-friends** | Closest to tracer (its §1 calls itself a "direct evolution"): same `vote→reveal→over` skeleton, simultaneous hidden buffer, no turn rotation, no per-player secret asymmetry. Lowest-risk first real game; proves `phaseKey` + multi-beat reveal (`reveal:r:bronze…full`) within `phaseDurationMs`. | Validates A1 (`phaseKey`), the `emptyPlayerMap`/`tally`/`gameOver` helpers (§1.1/§1.5/§1.7), the hidden-buffer + atomic-reveal convention, and the multi-beat-reveal-without-new-phases pattern. High demo value: the podium walk is the most visually exciting reveal of the four. |
| 2 | **hot-seat** | Adds **seat rotation** (`nextActiveSeat`, §1.4) and an explicit `scoreboard` ad-slot phase, but keeps the binary hidden answer (simplest hidden-input shape: `0|1`). Reuses everything from #1. | Proves `nextActiveSeat`, the dedicated-scoreboard ad cadence, and the `subjectId` client-nickname convention (§3.4). Demo value: simultaneous flip reveal + "you really thought I'd pick that?!" — strong, and it stresses the rotation helper before the harder games need it. |
| 3 | **truth-or-dare** | Adds **per-turn structure** (one active player per turn, `turnSeq` keying), a **verdict sub-vote** over a non-active subset, **skip/pass economy**, and **deck-draw-without-repeat**. Reuses rotation (#2) + hidden buffer (#1). It is also the only 2-player game, so it exercises the small-room edges. | Proves `turnSeq`-based `phaseKey` uniqueness (§1.6 rule), eligible-subset `allActed` (verdict voters = present minus active), and the deck/cursor draw pattern (which impostor's word-pair pick is a degenerate case of). |
| 4 | **impostor** | Most complex and highest-stakes redaction surface (the "hidden-state showcase," its §intro): roles + two secret words, per-turn clue timers, `impostorGuess` text input + `normalizeText` compare, multi-condition win-check, room-collapse. Builds on rotation (#2), per-turn keys (#3), hidden buffer (#1). | Capstone. By now `phaseKey`, `nextActiveSeat`, `allActed`, presence, `tally`, `normalizeText`, and the redaction-audit harness are all battle-tested, so impostor's risk is concentrated in its *own* role/word redaction (where it should be), not in shared plumbing. Best saved for last: a redaction bug here is the worst-case platform failure, so it gets the most-hardened toolkit. |

**Why not impostor first** (it's the flagship): its redaction surface is the one place a bug is
catastrophic (a leaked role kills the genre). Building the shared redaction harness + `leakedSecrets`
discipline on three lower-stakes games first means impostor lands on proven rails. Demo-value-wise,
rank-friends' podium and hot-seat's flip reveal carry early demos fine while impostor bakes.

---

## 5. Inconsistencies between the four docs that MUST be fixed

Specific, file-referenced. These are pre-implementation blockers — left unreconciled they produce four
incompatible state shapes and a shell that needs per-game special-casing.

### 5.1 Disconnect/presence field name — **4 different names for one concept** (BLOCKER)

| Doc | File / section | Field |
|---|---|---|
| impostor | `2026-06-10-game-impostor-design.md` §3.2 | `connected: Record<PlayerId, boolean>` (+ separate `alive`) |
| truth-or-dare | `2026-06-10-game-truth-or-dare-design.md` §3 / §4 | `connected: Record<PlayerId, boolean>` |
| hot-seat | `2026-06-10-game-hot-seat-design.md` §3.1 | `disconnected: Record<PlayerId, true>` |
| rank-friends | `2026-06-10-game-rank-friends-design.md` §3 | `left: Record<PlayerId, true>` |

**Fix:** standardize on `connected: Presence` (§1.2) everywhere. hot-seat (`disconnected`) and
rank-friends (`left`) must rename and invert (presence true = connected). impostor and t-or-d already
match. This lets the shell, `allActed`, and `nextActiveSeat` treat presence uniformly. (impostor's
separate `alive` is fine and stays — it's elimination, not presence; §1.2.)

### 5.2 The "all-acted over the right subset" predicate — **4 hand-rolled variants** (BLOCKER for helper reuse)

- tracer: `state.players.every(p => votes[p] !== undefined)` (no presence filter).
- impostor §4.3: "all alive-and-connected players acted."
- t-or-d §4: "all present non-active eligible voters voted."
- hot-seat §4 (`allAnswered`): "expectedAnswerers (not disconnected, incl. hot seat) answered."
- rank-friends §4: "activePlayers (not left) all submitted."

**Fix:** all four route through `allActed(expected, acted)` (§1.3); each game computes `expected` from
the standardized `connected` map (+ its own role filter). Same loop, no per-game reimplementation.

### 5.3 Scoring scales are incomparable, with **no shared XP convention** (BLOCKER for the session leaderboard)

- tracer: `+1` per round to vote-leaders.
- impostor §5.1: `+1..+4` at match end by outcome.
- truth-or-dare §5: `0 / 3 / 10 / 15` per turn.
- hot-seat §5.1: `100` (guesser) / `50 × matchers` (hot seat) — totals up to `750`.
- rank-friends §5: Borda `1..3` per round (or `1..L`).

**Fix:** adopt the §1.7 convention — keep each game's internal scale, but the **shell's session
leaderboard awards XP off per-match placement, not raw points.** Document in each game doc that
`scores` is match-local and the session total is placement-derived (impostor §5.2 already says
match-local; the other three must state it explicitly). Without this, a single hot-seat match
out-points a whole night of tracer/rank and the cross-game leaderboard is meaningless.

### 5.4 Ad-cue analytics event name — `round_revealed` vs `round_completed` (BLOCKER for the shell's ad trigger)

- tracer, impostor §4.1, hot-seat §4.2, rank-friends §4 (`enterReveal`) all emit
  **`analytics: round_revealed`**.
- truth-or-dare §5/§8 emits **`analytics: round_completed`** as the between-rounds ad cue, and cites
  spec §8.6 which names `round_completed`.

These are different events doing related jobs. The shell can't key its interstitial off two names.
**Fix:** define both with distinct, documented meanings and use them consistently:
- `round_revealed` = "a reveal beat happened" (per-reveal analytics; NOT the ad trigger).
- `round_completed` = "a round/lap boundary the shell may show an ad at" (spec §8.6, §8.5).

Then: the **ad interstitial is triggered by the shell off the `phaseKey` transition** (→`over`,
→`scoreboard:*`, or `reveal:*:full`→`rank:*`), NOT off an analytics effect. The analytics events are
for PostHog only. Reconcile all four docs to (a) emit `round_completed` at the lap/round boundary for
metrics parity with spec §8.6, and (b) stop implying the *ad* fires off an analytics effect — it fires
off `phaseKey`. (t-or-d §5 currently conflates the two; impostor §8.3 has the right model.)

### 5.5 Hot-seat internal inconsistency: `hotSeatAnswer` type (BLOCKER within that doc)

`2026-06-10-game-hot-seat-design.md` §3.3 declares the reveal view `hotSeatAnswer: 0 | 1`, but §4.6
and §8 revise it to `0 | 1 | null` (to represent hot-seat abstention). The `reveal` view union in §3.3
is stale. **Fix:** §3.3 must read `hotSeatAnswer: 0 | 1 | null`. (Not a contract change — §3.3's own
`HotSeatView` type; see R7.)

### 5.6 Content-pack locale field: `lang` (per-entry) vs `data.lang` vs `data.locale` (BLOCKER for the loader)

- impostor §6.1: per-entry `lang: 'en' | 'fr'` on each `WordPair`, no pack-level locale; and §6.1
  says `init` *filters pairs by locale*.
- truth-or-dare §6: `data.lang` **and** per-entry `lang`, with a validation rule that they match.
- hot-seat §6.1: `data.locale` (pack-level). ✅
- rank-friends §6: `data.locale?` (optional, pack-level). ✅

Three different shapes and two different field names. **Fix (per §3.1/§3.3):** pack-level
**`data.locale`** is canonical and required; packs are single-locale (FR and EN are separate ids).
Drop per-entry `lang` (impostor, t-or-d) — it's redundant once packs are single-locale. **Also reject
impostor's "`init` filters by locale"**: the shell selects the locale-correct pack id; `init` shuffles
and indexes like tracer, no filtering. impostor §6.1 must change to match hot-seat/rank-friends.

### 5.7 `minPlayers` divergence — intentional but must be cataloged (NON-blocking, document it)

impostor=3 (§4), hot-seat=3 (§1), rank-friends=3 (§1), truth-or-dare=2 (§1). This is a deliberate
per-game floor, not a bug — but the lobby/catalog must gate "Start" per game's `minPlayers` (every doc
assumes this). **Fix:** no code conflict; just ensure the catalog manifest carries each game's
`minPlayers` and the lobby reads it (it already must, since the contract exposes `minPlayers`). Noted
so no one "standardizes" it to a single value.

### 5.8 `emptyPlayerMap` redefined in every doc (NON-blocking, dedupe)

All four docs (impostor Appendix A, t-or-d §4, hot-seat §3.1, rank-friends §3) re-declare
`emptyPlayerMap` locally, as does `tracer.ts`. **Fix:** export it from `@bloop/engine` (§1.1); games
import it. Cosmetic but it removes five copies of a security-load-bearing primitive (null-proto
correctness) drifting independently.

### 5.9 `leakedSecrets` + impostor blank-mode empty string (latent BLOCKER for impostor tests)

`packages/engine/src/redaction.ts` **throws** on an empty secret value
(`'leakedSecrets: empty secret value is not auditable'`). impostor §3.2/§3.4 allow
`impostorWord === ''` when `impostorWordMode === 'blank'`, and §3.5 instructs auditing with
`secrets = [{value: civilianWord}, {value: impostorWord}, ...]`. In blank mode `impostorWord` is `''`
→ the audit helper throws. **Fix (impostor doc + test plan):** in blank mode, omit the empty
`impostorWord` from the `secrets` array (there is no secret word to leak). Call out in impostor §3.5 /
Appendix B so the redaction test doesn't crash. (No engine change — the helper's guard is correct;
the doc must not feed it `''`.)

---

## 6. One-paragraph implementation directive

Land **A1 (`phaseKey`)** and the **shared kit** (§1: `emptyPlayerMap`, `Presence`/`connectedPlayers`,
`allActed`, `nextActiveSeat`, `tally`, `gameOver`, `normalizeText`) in `@bloop/engine` first, updating
`tracer` to use them so the 50-test baseline grows rather than breaks. Then build the games in order
**rank-friends → hot-seat → truth-or-dare → impostor**, each importing the kit and the standardized
`connected: Presence` field, the `data.locale` pack envelope, and the placement-based session-XP rule.
Before any game PR merges, reconcile the §5 inconsistencies in the respective game docs (presence
naming, `allActed`, scoring/XP convention, `round_completed` ad-cue semantics, hot-seat
`hotSeatAnswer` type, pack `locale` field, impostor blank-mode `leakedSecrets`). No new event or effect
types — ever, for these four.
