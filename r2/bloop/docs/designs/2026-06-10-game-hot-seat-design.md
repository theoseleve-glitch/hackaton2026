# HOT SEAT — Game Design Document

**Date:** 2026-06-10
**Status:** Design (ready to implement)
**Game id:** `hot-seat`
**Owners:** Théo (+ William)
**Implements:** `GameModule<HotSeatState, HotSeatAction, HotSeatView, HotSeatContent>` (see `packages/engine/src/types.ts`)
**Template:** modeled on the `tracer` package (`packages/games/tracer/src/tracer.ts`) — same hard rules: null-prototype player-keyed maps (`emptyPlayerMap`), HIDDEN state never reaches `view()`, effects-not-side-effects, JSON-serializable state only, no `Date.now`/`Math.random` (nondeterminism enters via `seed` + event `at`).

> **Engineering note — `phaseKey`.** This design is written assuming the planned contract addition `phaseKey(state): string` (see §8). The shell needs it to detect phase transitions generically (so it can fire the interstitial ad and re-arm alarms per transition). Every `phaseKey` value below is defined precisely so the implementer can add the one method without redesign. The game is fully implementable on the *current* contract too; `phaseKey` only improves the shell's generic transition detection.

---

## 1. Game overview

Each round one player is the **hot seat** (in the spotlight). Everyone else secretly predicts how the hot-seat player will answer a question *about themselves* ("Would Théo rather fight 100 duck-sized horses or one horse-sized duck?"); the hot-seat player secretly picks their own real answer. On reveal, **guessers score for matching the hot-seat player's answer**, and the **hot-seat player scores for how many people read them right** — so being predictable is rewarded, and knowing your friends is rewarded.

**Player count:** min **3**, max **16**. (Two players is degenerate: with one hot seat and a single guesser the "group perception" mechanic collapses to a 1v1 coin-flip with no social tension — see §4.7. We set `minPlayers = 3`.)

**Why it's fun at a party (3 sentences):** It's *about the people in the room*, not trivia, so every reveal is a laugh or an argument ("you really thought I'd pick that?!"). Simultaneous hidden answers create a synchronized reveal moment — the core party beat. Rotating the spotlight guarantees everyone gets roasted and everyone gets to roast.

---

## 2. Phase / state machine

Phases (in order, looping per round): `intro → answer → reveal → (next round | scoreboard) → over`.

| Phase | `phaseDurationMs` | Untimed? | Transition out |
|---|---|---|---|
| `answer` | `config.answerMs` = **25_000** | no | **all-acted** (every *expected* answerer has submitted) **OR** `deadline` → `reveal` |
| `reveal` | `config.revealMs` = **7_000** | no | `deadline` → next round's `answer`, or → `scoreboard` if this was the last round of the round-block, or → `over` if game complete |
| `scoreboard` | `config.scoreboardMs` = **6_000** | no | `deadline` → next round's `answer` (this is the **interstitial ad slot**, see §5) |
| `over` | `null` (untimed) | yes | terminal — reducer is a no-op |

There is no separate timed `intro` phase. The hot-seat reveal / "who's up" beat is rendered by the client at the *start* of `answer` (the `answer` view carries `hotSeat` + `isHotSeat`), so we don't pay a phase timer for it. This matches tracer's lean two-working-phase shape (`vote`/`reveal`) and keeps party pacing tight.

### 2.1 Round structure & the scoreboard cadence

- A **round** = one hot-seat player answering one question, guessed by everyone else.
- The hot seat **rotates** through a fixed shuffled order (`seatOrder`, computed at `init`). `seatIndex` points at the current hot-seat player.
- We play `config.roundsPerPlayer` (**default 1**) full passes of the seat order. Total rounds = `seatOrder.length * roundsPerPlayer`, capped by available questions.
- A **scoreboard** phase is inserted after every `config.scoreboardEvery` rounds (**default: every round**, i.e. after each reveal) to give a running-totals beat and a natural ad break. With `scoreboardEvery = 1`, the loop is `answer → reveal → scoreboard → answer → …`. (Set `scoreboardEvery` higher, e.g. 3, for fewer ad breaks; default 1 maximizes the "between rounds" interstitial slot the platform wants.)
- After the final round's `reveal`, we always show one `scoreboard`, then go to `over`.

### 2.2 `phaseKey` scheme

`phaseKey(state)` returns a string that is **stable within a phase instance and changes on every phase transition**, so the shell can detect transitions generically:

```
answer:<round>       e.g. "answer:0", "answer:5"
reveal:<round>       e.g. "reveal:0"
scoreboard:<round>   e.g. "scoreboard:0"   (the scoreboard shown after round <round>)
over                 e.g. "over"
```

`round` is the 0-based global round counter (`state.round`), which is unique per round, so no two distinct phase instances collide. The shell fires the interstitial when `phaseKey` newly equals `scoreboard:*` (see §5).

---

## 3. TypeScript shapes

### 3.1 State (`HotSeatState`)

```ts
import type { PlayerId } from '@bloop/engine';

export interface HotSeatConfig {
  /** How many full passes through the seat order. Default 1. */
  roundsPerPlayer: number;
  /** Insert a scoreboard phase after every N rounds. Default 1. */
  scoreboardEvery: number;
  answerMs: number;     // 25_000
  revealMs: number;     // 7_000
  scoreboardMs: number; // 6_000
  /** Points a guesser earns for matching the hot-seat answer. Default 100. */
  matchPoints: number;
  /** Points the hot-seat player earns per guesser who matched them. Default 50. */
  readPoints: number;
}

export const DEFAULT_CONFIG: HotSeatConfig = {
  roundsPerPlayer: 1,
  scoreboardEvery: 1,
  answerMs: 25_000,
  revealMs: 7_000,
  scoreboardMs: 6_000,
  matchPoints: 100,
  readPoints: 50,
};

export type HotSeatPhase = 'answer' | 'reveal' | 'scoreboard' | 'over';

/** A question with two named options. `text` has {name} already substituted at init/round-entry time. */
export interface HotSeatQuestion {
  id: string;
  /** Rendered prompt, e.g. "Would Théo rather …" — {name} already substituted. */
  text: string;
  /** Exactly two options for v1 (binary "would they rather"). Index 0 / 1. */
  options: [string, string];
}

export interface HotSeatState {
  config: HotSeatConfig;
  players: PlayerId[];            // roster fixed at init (engine contract)
  /** Shuffled rotation order of hot-seat players (a permutation of players). */
  seatOrder: PlayerId[];
  /** Pre-rendered question per round index; length === totalRounds. */
  questions: HotSeatQuestion[];

  round: number;                  // 0-based global round counter
  totalRounds: number;
  seatIndex: number;              // index into seatOrder for current hot seat
  phase: HotSeatPhase;
  /** Rounds remaining until the next scoreboard insertion; 0 means "scoreboard next". */
  sinceScoreboard: number;

  /**
   * HIDDEN. Answers buffered during `answer`, keyed by player.
   * Value is the chosen option index (0 | 1). Includes the hot-seat player's
   * own answer AND every guesser's prediction. NEVER exposed via view() while
   * phase === 'answer'. Promoted into the public reveal view atomically on
   * transition to 'reveal'.
   */
  answers: Record<PlayerId, 0 | 1>;

  /** Public running totals. Safe to expose every phase. */
  scores: Record<PlayerId, number>;

  /**
   * Disconnected players (grace period handled by shell). Tracked so the
   * reducer can exclude them from the "all expected answerers acted" check and
   * skip them as hot seat. JSON-serializable; null-proto map of booleans.
   */
  disconnected: Record<PlayerId, true>;
}
```

> **Why a null-proto map for `answers`/`scores`/`disconnected`:** identical reasoning to tracer's `emptyPlayerMap` — player ids are untrusted strings; `obj['__proto__'] = …` on a default-prototype object silently corrupts the map. Null-proto objects stay JSON-serializable (unlike `Map`), which the event-sourced shell requires for snapshots.

### 3.2 Action (`HotSeatAction`)

A single action kind. Both the hot-seat player and every guesser submit the same shape — "pick option 0 or 1" — which keeps the reducer uniform and the wire payload tiny.

```ts
export type HotSeatAction = { kind: 'answer'; option: 0 | 1 };
```

Zod schema (server-side validation at the DO boundary, mirrors `tracerActionSchema`):

```ts
import { z } from 'zod';

export const hotSeatActionSchema = z.object({
  kind: z.literal('answer'),
  option: z.union([z.literal(0), z.literal(1)]),
});
```

There is **no free-text action in v1** (binary options only), so the action path itself never carries player-entered text → no profanity surface on actions. (Player-submitted questions are an explicitly deferred feature; see §6 moderation notes and §9.)

### 3.3 View (`HotSeatView`) — per phase, per role

`view(state, viewer)` returns one of these. `viewer` may be any string (active player, the hot seat, a non-answering disconnected player, an unknown/spectator id) — implementations **must** return a non-leaking projection for unknown viewers (engine contract). The discriminant is `phase`; an additional per-viewer `role` field tells the client what to render without leaking anyone else's hidden answer.

```ts
export type HotSeatRole = 'hotSeat' | 'guesser' | 'spectator';

export type HotSeatView =
  | {
      phase: 'answer';
      round: number;
      totalRounds: number;
      hotSeat: PlayerId;              // public: who's in the spotlight
      question: HotSeatQuestion;      // public prompt + both options
      role: HotSeatRole;              // viewer's role THIS round
      /** Per-player "has this person locked in an answer yet" — booleans only, NEVER the value. */
      submitted: Record<PlayerId, boolean>;
      /** The viewer's own locked-in option, or null. Owner-only echo. */
      myAnswer: 0 | 1 | null;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'reveal';
      round: number;
      totalRounds: number;
      hotSeat: PlayerId;
      question: HotSeatQuestion;
      role: HotSeatRole;
      /** The hot-seat player's real answer — now public. */
      hotSeatAnswer: 0 | 1;
      /** Each guesser's prediction — now public (the reveal moment). Hot seat excluded. */
      guesses: Record<PlayerId, 0 | 1>;
      /** Guessers who matched the hot seat this round. */
      matched: PlayerId[];
      /** Per-player points GAINED this round (delta), for the reveal animation. */
      gained: Record<PlayerId, number>;
      scores: Record<PlayerId, number>; // post-round totals
    }
  | {
      phase: 'scoreboard';
      round: number;
      totalRounds: number;
      /** Sorted leaderboard for the running-totals beat (ad slot underneath). */
      standings: Array<{ playerId: PlayerId; score: number }>;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'over';
      /** Final sorted leaderboard. */
      standings: Array<{ playerId: PlayerId; score: number }>;
      scores: Record<PlayerId, number>;
    };
```

#### 3.3.1 Redaction matrix — exactly what each viewer kind sees

`role` is derived: `viewer === hotSeat` → `hotSeat`; `viewer ∈ players && !disconnected` (and not hot seat) → `guesser`; otherwise (unknown id, spectator, or a fully-left player not in `players`) → `spectator`.

| Phase | Field | Hot-seat player | Guesser (other player) | Spectator / unknown / left-and-removed |
|---|---|---|---|---|
| `answer` | `hotSeat`, `question`, `scores`, `round`, `totalRounds` | sees | sees | sees |
| `answer` | `role` | `'hotSeat'` | `'guesser'` | `'spectator'` |
| `answer` | `submitted` (booleans) | sees all booleans | sees all booleans | sees all booleans |
| `answer` | `myAnswer` (own value) | own value or null | own value or null | **always `null`** (no hidden answer to echo) |
| `answer` | **anyone else's `answers` value** | **NEVER** | **NEVER** | **NEVER** |
| `reveal` | `hotSeatAnswer`, `guesses`, `matched`, `gained`, `scores` | sees all (now public) | sees all (now public) | sees all (now public) |
| `scoreboard` | `standings`, `scores` | sees | sees | sees |
| `over` | `standings`, `scores` | sees | sees | sees |

**The one leak class that matters:** during `answer`, no viewer's view may contain any *other* player's chosen option. Only `submitted: Record<PlayerId, boolean>` (presence, not value) and `myAnswer` (owner-only echo) expose answer state. Enforced by the engine's `leakedSecrets` audit (treat each player's answer value, namespaced, as a secret owned by that player) **plus** a field-level test asserting the serialized `answer`-phase view contains no `answers` map. Mirrors tracer's `hasVoted` (boolean) vs hidden `votes` (value) split.

> **Spectator-safety detail:** for an unknown/spectator viewer, `role` is `'spectator'` and `myAnswer` is `null`. The `answer`-phase view is identical to what a guesser sees *minus* an owned answer — fully safe, because it only ever contained public + own data.

---

## 4. Reducer behavior — every (phase, event) combination

Conventions (from tracer): `reduce` is pure; unknown/invalid events return `{ state, effects: [] }` unchanged; `answers`/`scores`/`disconnected` are rebuilt with `Object.assign(emptyPlayerMap(), …)` to avoid mutation; the `over` phase short-circuits to a no-op at the top.

Helper definitions used below:

- **`currentHotSeat(state)`** = `state.seatOrder[state.seatIndex]`.
- **`expectedAnswerers(state)`** = all `players` that are **not** `disconnected`, **including** the hot-seat player (the hot seat must also answer). The reveal cannot resolve until each expected answerer has an entry in `answers` (or the deadline fires).
- **`allAnswered(state)`** = `expectedAnswerers(state).every(p => state.answers[p] !== undefined)`.

### 4.1 `action` during `answer`

```
if !players.includes(playerId)            → no-op (unknown sender)        // tracer parity
if disconnected[playerId]                 → no-op (left player can't act; will rejoin to act)
if action.kind !== 'answer'               → no-op (zod also blocks)
if action.option !== 0 && !== 1           → no-op (zod also blocks)
else:
  answers' = Object.assign(emptyPlayerMap(), state.answers, { [playerId]: action.option })
  // DUPLICATE / CHANGE: last write wins. A player may change their pick until
  // reveal — overwriting is allowed and intentional (lets you fix a fat-finger).
  next = { ...state, answers: answers' }
  if allAnswered(next) → resolveReveal(next)     // early reveal, like tracer all-votes-in
  else                 → { state: next, effects: [] }
```

**Hot-seat player acts:** identical path — the hot seat's own answer is just another entry in `answers`. It counts toward `allAnswered`.

**Duplicate/changed answer is NOT a no-op** (differs from a strict "first write wins"): we accept overwrites so a player can change their mind before lock; the shell can ack privately each time (never broadcast the value). If product prefers locked answers, change to "ignore if `answers[playerId] !== undefined`" — noted in §9.

### 4.2 `deadline` during `answer`

```
deadline in 'answer' → resolveReveal(state)
```

`resolveReveal` scores using **only the answers present** at deadline (missing answerers simply scored nothing this round — see §4.6 abstention). Transition to `reveal` with the round's results promoted into public state.

`resolveReveal(state)`:

```ts
function resolveReveal(state): ReduceResult<HotSeatState> {
  const hot = currentHotSeat(state);
  const hotAns = state.answers[hot];          // may be undefined if hot seat abstained
  const gained = emptyPlayerMap<number>();
  for (const p of state.players) gained[p] = 0;
  const matched: PlayerId[] = [];

  if (hotAns !== undefined) {
    for (const p of state.players) {
      if (p === hot) continue;
      if (state.disconnected[p]) continue;       // can't match if they never answered
      const g = state.answers[p];
      if (g !== undefined && g === hotAns) {
        gained[p] += state.config.matchPoints;   // guesser read the room
        matched.push(p);
      }
    }
    gained[hot] += matched.length * state.config.readPoints; // hot seat: how many read them
  }
  // if hot seat abstained: nobody can match → 0 points this round for everyone.

  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  for (const p of state.players) scores[p] = (scores[p] ?? 0) + gained[p];

  // stash round-result fields for the reveal view by storing them on state OR
  // recomputing in view(). We recompute in view() from answers (still present
  // in state during 'reveal') to keep state minimal — answers are only cleared
  // when the NEXT 'answer' phase begins. See §4 note below.
  const effects: Effect[] = [
    { type: 'analytics', name: 'round_revealed',
      props: { round: state.round, matched: matched.length, hotAbstained: hotAns === undefined } },
  ];
  return { state: { ...state, phase: 'reveal', scores }, effects };
}
```

> **State-minimality choice (matches tracer):** tracer keeps `votes` in state through `reveal` and recomputes `tally` inside `view()`. We do the same: `answers` stays in state during `reveal`; `view()` recomputes `hotSeatAnswer`, `guesses`, `matched`, and `gained` from `answers` + `scores`-delta logic. `answers` is reset to an empty map only when the next `answer` phase begins (in `nextRound`). This keeps `HotSeatState` free of redundant per-round result fields. (The `gained` delta in the reveal view is recomputed deterministically from `answers` — same math as `resolveReveal`.)

### 4.3 `deadline` during `reveal`

```
deadline in 'reveal' → advance(state)
```

`advance(state)` decides scoreboard vs next round vs over:

```ts
function advance(state): ReduceResult<HotSeatState> {
  const isLastRound = state.round + 1 >= state.totalRounds;
  const scoreboardDue = state.sinceScoreboard <= 0; // 0 means "insert scoreboard now"

  if (isLastRound) {
    // always show one final scoreboard before over
    return { state: { ...state, phase: 'scoreboard' }, effects: [] };
  }
  if (scoreboardDue) {
    return { state: { ...state, phase: 'scoreboard' }, effects: [] };
  }
  return startNextRound(state); // skip scoreboard this time
}
```

### 4.4 `deadline` during `scoreboard`

```
deadline in 'scoreboard':
  if state.round + 1 >= state.totalRounds → gameOver
  else                                    → startNextRound(state)
```

`gameOver`:

```ts
function gameOver(state): ReduceResult<HotSeatState> {
  const over = { ...state, phase: 'over' as const };
  return { state: over, effects: [{ type: 'gameOver', scores: { ...over.scores } }] };
}
```

`startNextRound`:

```ts
function startNextRound(state): ReduceResult<HotSeatState> {
  const round = state.round + 1;
  // advance seat: skip disconnected players if any remain connected.
  const seatIndex = nextConnectedSeat(state, state.seatIndex);
  const sinceScoreboard =
    state.sinceScoreboard <= 0 ? state.config.scoreboardEvery - 1 : state.sinceScoreboard - 1;
  return {
    state: {
      ...state,
      round,
      seatIndex,
      phase: 'answer',
      answers: emptyPlayerMap<0 | 1>(),  // clear last round's hidden answers
      sinceScoreboard,
    },
    effects: [],
  };
}
```

`nextConnectedSeat(state, fromIndex)` walks `seatOrder` forward (modulo length) until it lands on a connected player; if **every** player is disconnected it returns `(fromIndex + 1) % seatOrder.length` (degenerate; the shell's grace/empty-room logic will end the room — the reducer never deadlocks).

### 4.5 `playerLeft` — every phase

The engine surfaces disconnects as `playerLeft` (the shell owns the grace timer; the reducer just records presence). The roster `players` is **fixed at init** and never shrinks (engine contract). We mark presence:

```
playerLeft(playerId), any phase except 'over':
  if !players.includes(playerId) → no-op
  disconnected' = Object.assign(emptyPlayerMap(), state.disconnected, { [playerId]: true })
  next = { ...state, disconnected: disconnected' }

  if phase === 'answer':
    // their absence may complete the round: re-check allAnswered against the
    // NEW expectedAnswerers (which now excludes them).
    if allAnswered(next) → resolveReveal(next)
    else                 → { state: next, effects: [] }

    // SPECIAL CASE: the LEAVER IS THE HOT SEAT during 'answer'.
    //   - If they had already submitted their own answer, the round can still
    //     resolve normally (hotAns present).
    //   - If they had NOT answered and are now disconnected, expectedAnswerers
    //     excludes them, so allAnswered may be true while hotAns is undefined.
    //     resolveReveal handles hotAns === undefined → 0 points round (§4.2),
    //     then 'reveal' shows "hot seat left — round void." We do NOT freeze.

  else (reveal | scoreboard):
    { state: next, effects: [] }   // presence noted; affects future rounds only
```

We **do not** end the game on a leave. With `minPlayers = 3`, a single leave can drop a round to 2 active players; that round still resolves (one hot seat + one guesser), and the next round skips the disconnected seat. If so many leave that fewer than `minPlayers` remain connected, **the shell** (not the reducer) ends/abandons the room per platform policy — the reducer stays a pure state machine and keeps resolving whatever events arrive.

### 4.6 Abstention semantics

- **Guesser abstains** (deadline hits, no answer): they simply gain 0 that round. No penalty. `submitted[them] === false` was visible during `answer`.
- **Hot seat abstains** (no own answer by deadline / left before answering): `resolveReveal` sets `hotAns === undefined` → no one can match → everyone gains 0; the `reveal` view's `hotSeatAnswer` is rendered by the client as "no answer" (the view type still needs a value — see §8 engineNeeds: we make `hotSeatAnswer: 0 | 1 | null`).

> **Contract refinement to §3.3:** to represent hot-seat abstention faithfully, the `reveal` view's `hotSeatAnswer` is `0 | 1 | null` (null = hot seat didn't answer). `matched` is then `[]` and all `gained` are 0.

### 4.7 `playerRejoined` — every phase

```
playerRejoined(playerId), any phase except 'over':
  if !players.includes(playerId) → no-op
  disconnected' = { ...state.disconnected }; delete disconnected'[playerId]
  next = { ...state, disconnected: disconnected' }
  // Re-including them as an expected answerer mid-'answer' can only ADD an
  // outstanding answerer, never complete the round, so no resolve check needed
  // here — but it is harmless to run allAnswered(next) and it stays correct.
  { state: next, effects: [] }
```

On rejoin during `answer`, the player is again an expected answerer and the shell resyncs them the full `answer` view (their `myAnswer` is whatever is still in `answers[them]`, or null if it was a fresh round). They can submit/resubmit until reveal.

### 4.8 Edge counts

- **Exactly `minPlayers = 3`:** seat order length 3; each round = 1 hot seat + 2 guessers. Reveal scoring is meaningful (a guesser can be right or wrong; hot seat scores 0/1/2 × `readPoints`). `roundsPerPlayer = 1` → 3 rounds → 3 scoreboards (one per round) → `over`. Fully non-degenerate.
- **2 players (excluded):** would be 1 hot seat + 1 guesser; "does the group know you" is a single coin-flip, hot seat scores 0 or `readPoints`, no social spread. We set `minPlayers = 3` so the shell/lobby never starts Hot Seat below 3.
- **16 players (max):** seat order length 16; per round 1 hot seat + 15 guessers. `answers` holds up to 16 entries (`0|1`), trivially small. `roundsPerPlayer = 1` → 16 rounds. At `scoreboardEvery = 1` that's 16 reveals + 16 scoreboards (16 ad-eligible breaks) — likely too long for one sitting, so for large rooms product may bump `scoreboardEvery` to 2–3 and/or cap `totalRounds` (see §5 and §9). The reducer itself scales fine (O(players) per resolve).
- **Question exhaustion:** `totalRounds = min(seatOrder.length * roundsPerPlayer, questions.length)` at `init` (mirrors tracer's `Math.min(totalRounds, shuffled.length)`), so we never index past the question bank.

### 4.9 `action` outside `answer` / stray events

- `action` during `reveal`, `scoreboard`, `over` → **no-op** (answers only accepted in `answer`).
- Any event during `over` → **no-op** (top-of-`reduce` short-circuit, exactly like tracer).
- `deadline` with no matching phase branch → **no-op**.

---

## 5. Scoring, multi-round structure, and the ad slot

### 5.1 Scoring (per round)

- **Guesser:** `+matchPoints` (default **100**) if their predicted option equals the hot seat's real option; else 0.
- **Hot seat:** `+readPoints × (number of guessers who matched)` (default **50** each). So a perfectly-read hot seat in a 16-player room earns `15 × 50 = 750`; a hot seat nobody predicted earns 0.
- **Why asymmetric defaults (100 vs 50):** a guesser stakes one correct prediction (binary, ~50% baseline) → 100 rewards a single read. The hot seat passively benefits from *many* guessers, so each match is worth less (50) to keep totals comparable; tune in playtest (§9). Both are config so balancing is a content/flag change, not a code change.
- Ties are allowed (multiple players can share the top score); `over` `standings` is sorted desc by score (stable by `players` order for ties — deterministic, no RNG).

### 5.2 Multi-round structure

`answer → reveal → scoreboard → answer → … → reveal → scoreboard → over`, looping over `seatOrder` for `roundsPerPlayer` passes (default: every player is the hot seat exactly once). Total rounds and the scoreboard cadence are config (§2.1).

### 5.3 Interstitial ad slot

The platform shows interstitials **between rounds** (spec §8.5). In Hot Seat, the **`scoreboard` phase is the ad slot**: it's a natural "results so far" pause with no required input, durated at `scoreboardMs = 6_000` (enough to render the leaderboard and an interstitial without the ad eating gameplay). The shell triggers the AdMob interstitial when `phaseKey(state)` newly matches `^scoreboard:` (generic transition detection, §2.2) — subject to the platform's remote-config frequency caps (so not every scoreboard necessarily shows an ad). This is exactly the "interstitial slot between rounds" the spec's backbone build list calls for, and `scoreboardEvery` lets product tune ad frequency without touching game code.

---

## 6. Content pack — JSON schema + examples + moderation

### 6.1 Schema

Content packs are **versioned JSON in R2** (spec §3). The pack `data` is the `HotSeatContent` type. Questions use a `{name}` placeholder substituted with the hot-seat player's nickname when the round is built.

```ts
export interface HotSeatContent {
  /** ISO-639-1 locale of this pack, e.g. "fr" | "en". */
  locale: 'fr' | 'en';
  questions: Array<{
    id: string;            // stable unique id, e.g. "wr_horses"
    /** Template with exactly one {name} placeholder. */
    template: string;      // "Est-ce que {name} préférerait …"
    options: [string, string];
    /** Optional content tags for future filtering (spicy/sfw, theme). */
    tags?: string[];
  }>;
}
```

Zod (validated when the pack is loaded into the DO):

```ts
export const hotSeatContentSchema = z.object({
  locale: z.enum(['fr', 'en']),
  questions: z.array(z.object({
    id: z.string().min(1).max(64),
    template: z.string().min(1).max(200).refine(t => t.includes('{name}'),
      { message: 'template must contain {name}' }),
    options: z.tuple([z.string().min(1).max(60), z.string().min(1).max(60)]),
    tags: z.array(z.string().max(24)).max(8).optional(),
  })).min(3), // need at least minPlayers questions for a viable game
});
```

**Substitution (at `init`, deterministic):** `init` shuffles questions with `shuffle(createRng(seed), questions)` (tracer pattern), takes the first `totalRounds`, and renders each into a `HotSeatQuestion` by replacing **all** occurrences of `{name}` with the nickname of the hot-seat player for that round index. Since the seat order and question order are both seeded, rendering is fully deterministic and replayable. *(Implementation detail: the nickname comes from the shell-provided player profile; the engine `init` receives `PlayerId[]` only, so the rendered `text` may keep a stable token like the player id and the **client** substitutes the display nickname — see §8 engineNeeds. Default plan: store the player id token in `HotSeatQuestion.text` as `{name}` left intact plus a `subjectId` field, and let the typed client view render the nickname it already holds. This keeps `init` free of nickname/profile coupling and matches the "no identity in engine" rule.)*

> **Decision:** the rendered `HotSeatQuestion` carries `subjectId: PlayerId` and leaves `{name}` in `text`; the client substitutes the nickname (which it already has from the lobby roster). The engine never handles nicknames. (See revised shape note in §8.)

### 6.2 Example entries (FR pack, `locale: "fr"`)

```json
{
  "locale": "fr",
  "questions": [
    { "id": "wr_horses", "template": "Est-ce que {name} préférerait affronter 100 canards de la taille d'un cheval, ou 1 cheval de la taille d'un canard ?", "options": ["100 canards", "1 cheval"], "tags": ["sfw","silly"] },
    { "id": "wr_fame", "template": "Est-ce que {name} préférerait être célèbre mais détesté, ou inconnu mais adoré ?", "options": ["Célèbre & détesté", "Inconnu & adoré"], "tags": ["sfw"] },
    { "id": "wr_time", "template": "Est-ce que {name} préférerait voyager 100 ans dans le passé, ou 100 ans dans le futur ?", "options": ["Le passé", "Le futur"], "tags": ["sfw"] },
    { "id": "wr_power", "template": "Est-ce que {name} choisirait de voler, ou d'être invisible ?", "options": ["Voler", "Invisible"], "tags": ["sfw"] },
    { "id": "wr_food", "template": "Est-ce que {name} abandonnerait plutôt le fromage à vie, ou le chocolat à vie ?", "options": ["Adieu fromage", "Adieu chocolat"], "tags": ["sfw"] },
    { "id": "wr_party", "template": "À une soirée, est-ce que {name} est plutôt le premier arrivé, ou le dernier à partir ?", "options": ["Premier arrivé", "Dernier parti"], "tags": ["sfw"] },
    { "id": "wr_phone", "template": "Est-ce que {name} regarde son téléphone dans les 5 minutes après le réveil, ou pas du tout avant 1h ?", "options": ["Direct le tel", "1h sans"], "tags": ["sfw"] },
    { "id": "wr_money", "template": "Est-ce que {name} préférerait gagner au loto, ou avoir le job de ses rêves ?", "options": ["Le loto", "Le job rêvé"], "tags": ["sfw"] },
    { "id": "wr_karaoke", "template": "Au karaoké, est-ce que {name} fonce au micro, ou se cache au fond de la salle ?", "options": ["Au micro", "Au fond"], "tags": ["sfw"] },
    { "id": "wr_pet", "template": "Est-ce que {name} est plutôt team chien, ou team chat ?", "options": ["Team chien", "Team chat"], "tags": ["sfw"] }
  ]
}
```

All entries are SFW party-grade. A spicier pack ships as a separate R2 file (different pack `id`, same schema, `tags:["spicy"]`), gated by a host toggle / remote flag — not mixed into the default pack.

### 6.3 Moderation notes (player-entered text paths)

The spec mandates a server-side profanity filter (`obscenity`, pure TS in workerd) on **all player-entered text at the DO input boundary**. Hot Seat's text paths:

1. **Nicknames** — already filtered at join by the platform (spec §6). Hot Seat renders nicknames into question text (client-side substitution), so no new filter surface; the displayed `{name}` is a pre-filtered nickname.
2. **Action payloads** — Hot Seat actions are `{ kind:'answer', option:0|1 }`: **no free text**, so the action path has zero moderation surface. This is a deliberate v1 safety property.
3. **Content packs** — authored by us, reviewed pre-upload to R2; not player-entered. Validated by `hotSeatContentSchema` on load.
4. **Deferred: player-written questions/options** (a tempting "create your own" mode) **introduce a player-entered text path** and are **out of scope for v1** precisely to avoid that moderation surface. If added later, every submitted template/option must pass the same DO-boundary `obscenity` filter *before* persistence or broadcast, plus length caps and a `{name}`-only placeholder allowlist (reject any other `{...}` token) — see §9.

---

## 7. UI screens → Bloop moodboard components

(Brief — the mobile design doc owns visual detail. Mapped to moodboard primitives: Join chips, phase Timer ring, reveal Cards, Leaderboard rows, avatar chips.)

| Phase / screen | Components | Notes |
|---|---|---|
| Lobby (pre-game) | **Join chips** (avatar + nickname), host **Start** button, room code/QR | Platform-owned; Hot Seat needs ≥3 chips lit to enable Start. |
| `answer` — hot seat | Big **Spotlight card** (own avatar, "You're in the hot seat"), the question, two large **Option buttons** (0/1), **Timer ring** (`answerMs`) | Hot seat answers about themselves; same two buttons as guessers. |
| `answer` — guesser | Hot-seat avatar chip + "What will {name} pick?", two **Option buttons**, **Submitted dots** row (one dot per player, filled when `submitted[p]`), **Timer ring** | Dots use booleans only — never the chosen value. |
| `reveal` | **Reveal cards**: hot-seat answer card flips first, then guesser **prediction cards** flip, **Match badges** on matchers, **+points** count-up chips (`gained`) | The party beat — synchronized flip across all phones. |
| `scoreboard` (ad slot) | **Leaderboard rows** (avatar + score, sorted), running-total animation; **interstitial ad** rendered beneath/over per remote-config cap | This is the "between rounds" slot. |
| `over` | Final **Leaderboard** with winner highlight, **Play again / Back to lobby** | `gameOver` effect already fired. |

---

## 8. engineNeeds (beyond the current contract)

Conservative — almost everything fits the existing contract (the tracer proves the pattern). Two items:

1. **`phaseKey(state): string` (already planned).** Add to `GameModule`. Hot Seat needs it so the shell can generically detect the `→ scoreboard` transition and fire the interstitial / re-arm alarms without game-specific knowledge. Scheme defined in §2.2. This is the only *contract* addition, and it's already on the roadmap (known gap). The game also works without it (the shell can diff `phaseDurationMs`/view), but `phaseKey` is the clean generic hook.

2. **Nickname rendering happens client-side, not in `init` (no contract change — a convention).** The engine `init` receives `PlayerId[]` only and must stay identity-free ("no identity in engine"). So the rendered `HotSeatQuestion` carries `subjectId: PlayerId` and leaves the `{name}` token in `text`; the **typed client view** substitutes the hot-seat nickname it already holds from the lobby roster. Revised shape:

   ```ts
   export interface HotSeatQuestion {
     id: string;
     text: string;          // template with {name} left intact
     options: [string, string];
     subjectId: PlayerId;   // whose nickname the client substitutes for {name}
   }
   ```

   No engine API changes; just a documented split of responsibility (engine = ids, client = display), consistent with the platform's identity rule. **This needs no help from the engine** beyond what exists.

Everything else — hidden simultaneous answers (buffered in HIDDEN `answers`, revealed atomically), per-phase durations, all-acted-or-deadline resolution, leaver/rejoiner handling via `playerLeft`/`playerRejoined`, scoring map, `gameOver` effect, deterministic seeding via `createRng`/`shuffle`, redaction audit via `leakedSecrets` — is **fully expressible on the current contract** exactly as tracer does it. No new event types, no new effect types.

---

## 9. Open product questions

1. **Answer lock vs change-before-reveal.** Default chosen: allow changing your pick until reveal (last-write-wins, §4.1). Alternative: lock on first submit. Confirm which feels better in playtest.
2. **`scoreboardEvery` for large rooms.** Default 1 (scoreboard + ad after every round) maximizes ad slots but, at 16 players × 1 round each, yields a long session with 16 breaks. Should large rooms auto-bump `scoreboardEvery` (e.g. 2–3) and/or cap `totalRounds`? Needs a product/ads-revenue-vs-pacing call.
3. **Scoring constants (100 / 50).** Asymmetric defaults are a guess; balance in playtest. Should the hot seat also score for being *un*predictable in some modes (anti-read points)? Out of scope for v1.
4. **3+ options / sliders.** v1 is binary "would they rather." A future "pick from 4" or "rank" variant changes `option: number` and scoring. Keep v1 binary.
5. **Player-written questions ("ask the room").** Tempting and very on-brand, but introduces a player-entered text moderation path (§6.3). Deferred; if greenlit, define the filter + placeholder allowlist + length caps before build.
6. **Hot-seat abstention UX.** When the hot seat doesn't answer (left / timed out), the round voids (0 points). Acceptable, or should we re-deal that player a later round? Default: void and move on.
7. **Spicy pack gating.** A spicier content pack exists conceptually; confirm host-toggle vs remote-flag gating and whether it needs an age-gate given fully-anonymous play.
8. **`roundsPerPlayer` default.** 1 (everyone hot once) is the tight party default; 2 doubles length. Confirm 1 for launch.

---

## 10. Implementation checklist (for the engineer, tracer-style)

- `packages/games/hot-seat/src/state.ts` — `HotSeatConfig`, `DEFAULT_CONFIG`, `HotSeatPhase`, `HotSeatQuestion`, `HotSeatState` (mark `answers` HIDDEN in a doc comment), `HotSeatAction`, `HotSeatRole`, `HotSeatView`.
- `packages/games/hot-seat/src/actions.ts` — `hotSeatActionSchema`.
- `packages/games/hot-seat/src/content.ts` — `HotSeatContent`, `hotSeatContentSchema`.
- `packages/games/hot-seat/src/hot-seat.ts` — `emptyPlayerMap`, `currentHotSeat`, `expectedAnswerers`, `allAnswered`, `resolveReveal`, `advance`, `startNextRound`, `nextConnectedSeat`, `gameOver`, and the `GameModule` object (`id:'hot-seat'`, `version:1`, `minPlayers:3`, `maxPlayers:16`, `init`/`reduce`/`view`/`phaseDurationMs`, plus `phaseKey` once the contract lands).
- `packages/games/hot-seat/src/index.ts` — re-exports.
- Tests (Vitest, no cloud): reducer per (phase,event) table in §4; property test "no other player's answer value appears in any `answer`-phase view" via `leakedSecrets` (answers as per-owner secrets) + field-level "view has no `answers` map"; edge counts 3 and 16; leaver-is-hot-seat; rejoin mid-answer; question exhaustion cap; determinism (same seed → same seat order + question order).

`phaseDurationMs`:

```ts
phaseDurationMs(state) {
  if (state.phase === 'answer') return state.config.answerMs;
  if (state.phase === 'reveal') return state.config.revealMs;
  if (state.phase === 'scoreboard') return state.config.scoreboardMs;
  return null; // 'over'
}
```

`phaseKey` (when contract lands):

```ts
phaseKey(state) {
  return state.phase === 'over' ? 'over' : `${state.phase}:${state.round}`;
}
```
