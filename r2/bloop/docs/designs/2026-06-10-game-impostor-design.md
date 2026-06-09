# Impostor / Undercover — Game Design Document

**Date:** 2026-06-10
**Status:** Design (ready to implement)
**Game id:** `impostor`
**Owners:** Théo (+ William)
**Targets:** `packages/games/impostor` (server reducer + views), content pack in R2

> Written against the engine contract in `packages/engine/src/types.ts` (50 tests green) and the
> tracer template in `packages/games/tracer/src/tracer.ts`. Hard rules inherited from the tracer
> are non-negotiable here: **null-prototype player-keyed maps** (`emptyPlayerMap`), **hidden state
> never appears in any `view()`**, **effects are returned, never executed**, and **state is
> JSON-serializable** (no `Map`/`Set`/`Date`/class instances). This game is the platform's
> hidden-state showcase, so §3 (redaction) is the load-bearing section.

This doc assumes one planned, additive contract change: **`phaseKey(state): string`** (see
"KNOWN CONTRACT GAP"). The shell uses it to detect phase transitions generically (arm a fresh
deadline, fire an interstitial ad, snapshot). The design is written so the module works even if
`phaseKey` ships later — it is purely shell-facing and never leaks secrets.

---

## 1. Game overview

Everyone in the room secretly receives the **same secret word** except 1–3 **impostors**, who get a
**decoy word** from the same theme (or nothing, configurable). Each living player speaks one
one-word clue aloud about their word (phones drive turn order + a per-turn timer), then the room
discusses and **votes simultaneously** to eliminate someone; civilians win by ejecting every
impostor, impostors win by surviving to parity or by **correctly guessing the civilians' word** the
moment they are caught.

**Players:** min **3**, max **16** (see §4 for the role table and why 2 is excluded).

**Why it's fun at a party:** it weaponizes the room — you are bluffing out loud, face to face, and
the phone only holds the secrets and the timer so nobody can cheat by peeking. The decoy word is
close enough that the impostor can fake it for a round or two, which makes the "who said *banana*
when it should've been *plantain*?" reveal land hard. Short turns and a hard vote deadline keep
party pacing tight (~3–6 min per match).

---

## 2. Phase / state machine

Phases are linear within a **match**, with a clue→discuss→vote→reveal loop repeated each **round**
until a win condition fires. A "round" = one full elimination cycle. Multiple matches per session
are a shell/lobby concern (§5); one `GameModule` instance plays exactly one match end-to-end.

```
                  init
                   │
                   ▼
            ┌───────────────┐   (untimed; host/all-ready)
            │   roleReveal  │   each living phone privately shows its own word
            └──────┬────────┘
                   │ all living players ack  OR  deadline
                   ▼
            ┌───────────────┐   per-turn timer, advances turnIndex
        ┌──▶│     clue      │   active player taps "done" OR deadline → next turn
        │   └──────┬────────┘
        │          │ last living player's turn done/deadline
        │          ▼
        │   ┌───────────────┐   single discussion timer (talking happens IRL)
        │   │   discuss     │   any living player may tap "ready to vote" → early end
        │   └──────┬────────┘
        │          │ all living ready  OR  deadline
        │          ▼
        │   ┌───────────────┐   simultaneous secret vote (buffered in HIDDEN state)
        │   │     vote      │   each living player votes once; abstain allowed at deadline
        │   └──────┬────────┘
        │          │ all living voted  OR  deadline
        │          ▼
        │   ┌───────────────┐   eviction resolved; if an IMPOSTOR is evicted →
        │   │    reveal     │   that impostor gets a guess window (see impostorGuess)
        │   └──────┬────────┘
        │          │ deadline (or guess submitted)
        │          ▼
        │   ┌───────────────┐   only entered if an impostor was just evicted AND
        │   │ impostorGuess │   civilians have NOT already won; evicted impostor
        │   └──────┬────────┘   types civilians' word (one attempt)
        │          │ guess submitted OR deadline
        │          ▼
        │     check win conditions (pure, in reducer)
        │          │
        │   no win ─┘  (loop back to clue, next round)
        │
        │   win ────────────────────────────┐
        ▼                                    ▼
   (loop)                            ┌───────────────┐
                                     │     over      │  final standings + winning side
                                     └───────────────┘
```

### 2.1 Per-phase durations (`phaseDurationMs`)

`phaseDurationMs` is a **pure function of state** (modules never see wall-clock time). Values are
read from `state.config` so a content/remote-config override can retune pacing without code.

| Phase | `phaseDurationMs(state)` | Ends early when… | Notes |
|---|---|---|---|
| `roleReveal` | `config.roleRevealMs` (15_000) | all **living** players `ackRole` | gives everyone time to memorize their word |
| `clue` | `config.clueTurnMs` (20_000) **per turn** | active player `clueDone` | duration is per-turn; phaseKey encodes the turn (§2.3) |
| `discuss` | `config.discussMs` (45_000) | all **living** players `readyToVote` | the social core; talking is IRL |
| `vote` | `config.voteMs` (30_000) | all **living** players have voted | buffered; never broadcast (§3) |
| `reveal` | `config.revealMs` (8_000) | — (always runs full) | eviction made public atomically |
| `impostorGuess` | `config.guessMs` (20_000) | evicted impostor submits `guessWord` | only entered when applicable |
| `over` | `null` (untimed) | — | shell shows standings + offers rematch |

`phaseDurationMs` returns `null` only for `over`. Every other phase returns a number; the shell
converts it to an absolute deadline on phase entry and fires a `deadline` event when it elapses.

### 2.2 Transitions: all-acted vs deadline

Every gated phase resolves on **whichever comes first** — all relevant living players acting, or the
`deadline` event. The reducer treats them identically at the resolution point:

- `roleReveal` → `clue`: trigger = every living player in `ackRole` set, **or** `deadline`. On entry
  to `clue`, `turnIndex = 0` (first living player in `turnOrder`).
- `clue` (turn *k*) → `clue` (turn *k+1*): trigger = active player's `clueDone`, **or** `deadline`.
  A skipped-by-deadline turn records `clues[playerId] = null` (no clue given). After the **last**
  living player's turn → `discuss`.
- `discuss` → `vote`: every living player `readyToVote`, **or** `deadline`. On entry to `vote`,
  `votes` is reset to an empty player map.
- `vote` → `reveal`: every living player present in `votes`, **or** `deadline` (abstainers omitted).
  Resolution computes the evicted player (§4 tie rules) and writes it into public reveal state.
- `reveal` → (`impostorGuess` | next `clue` | `over`): always on `deadline`. The reducer decides the
  branch *at reveal-resolution time* and stores it in `pendingAfterReveal` so the `deadline` handler
  is a trivial dispatch:
  - if civilians already won by this eviction (all impostors gone) → `over`.
  - else if the evicted player **was an impostor** and impostors not yet all gone → `impostorGuess`.
  - else (civilian evicted, or impostor evicted but more remain — note: any impostor eviction
    grants a guess, so this "else" is the civilian-evicted / nobody-evicted-tie-resolved case) →
    win-check, then next `clue` round **or** `over`.
- `impostorGuess` → (`over` | next `clue`): on `guessWord` action **or** `deadline`. Correct guess →
  impostors win → `over`. Wrong/absent guess → win-check, then loop or `over`.

### 2.3 `phaseKey` scheme

`phaseKey(state): string` is a stable, monotonic-ish label the shell diffs to detect "we entered a
new phase" (arm deadline, snapshot, maybe show an ad). It must change on **every** transition the
shell needs to react to — including each clue turn and each new round — and must **never embed a
secret** (it is shell-facing, but treat it as if logged).

```
roleReveal              → "roleReveal:r{round}"
clue (turn k)           → "clue:r{round}:t{turnIndex}"
discuss                 → "discuss:r{round}"
vote                    → "vote:r{round}"
reveal                  → "reveal:r{round}"
impostorGuess           → "impostorGuess:r{round}"
over                    → "over"
```

Examples: `"roleReveal:r0"`, `"clue:r0:t3"`, `"vote:r1"`, `"over"`. `round` is 0-based and increments
when a new `clue` round begins. The per-turn `t{turnIndex}` component is what lets the shell re-arm
the per-turn timer each turn (the alarm multiplexer keys off the changed phaseKey).

Implementation (pure, no secrets):

```ts
phaseKey(state: ImpostorState): string {
  switch (state.phase) {
    case 'clue':          return `clue:r${state.round}:t${state.turnIndex}`;
    case 'over':          return 'over';
    default:              return `${state.phase}:r${state.round}`;
  }
}
```

---

## 3. State, Action, View (with redaction)

### 3.1 Config

```ts
export interface ImpostorConfig {
  /** Phase durations, ms. */
  roleRevealMs: number;   // 15_000
  clueTurnMs: number;     // 20_000  (per turn)
  discussMs: number;      // 45_000
  voteMs: number;         // 30_000
  revealMs: number;       // 8_000
  guessMs: number;        // 20_000
  /** Impostor-word policy: 'decoy' = give a related word; 'blank' = impostor gets nothing. */
  impostorWordMode: 'decoy' | 'blank';
  /** Hard cap honored alongside the per-count table in §4. */
  maxImpostors: number;   // 3
}

export const DEFAULT_CONFIG: ImpostorConfig = {
  roleRevealMs: 15_000,
  clueTurnMs: 20_000,
  discussMs: 45_000,
  voteMs: 30_000,
  revealMs: 8_000,
  guessMs: 20_000,
  impostorWordMode: 'decoy',
  maxImpostors: 3,
};
```

### 3.2 State shape

`HIDDEN` marks fields that **must never** appear in any `view()` output for a non-owner. All
player-keyed maps are null-prototype (`emptyPlayerMap`). State is fully JSON-serializable.

```ts
export type ImpostorPhase =
  | 'roleReveal' | 'clue' | 'discuss' | 'vote' | 'reveal' | 'impostorGuess' | 'over';

export type Role = 'civilian' | 'impostor';

/** Why the match ended (only meaningful when phase === 'over'). */
export type EndReason =
  | 'civiliansEjectedAllImpostors'
  | 'impostorsReachedParity'
  | 'impostorGuessedWord'
  | 'roomCollapsed';        // too many players left mid-match (see §4)

/** What just happened in the most recent reveal (public, drives the reveal card). */
export interface RevealRecord {
  round: number;
  /** Player evicted this round, or null if the vote tied to no-eviction (config-dependent). */
  evicted: PlayerId | null;
  /** True iff the evicted player was an impostor. Public — eviction outcome is always shown. */
  evictedWasImpostor: boolean;
  /** Final vote tally for this round (public). */
  tally: Record<PlayerId, number>;
  /** Players who abstained / failed to vote by deadline (public, for "X didn't vote"). */
  abstained: PlayerId[];
}

export interface ImpostorState {
  config: ImpostorConfig;
  /** Fixed roster from init (tracer rule: roster is fixed at init). */
  players: PlayerId[];
  /** Theme label shown to everyone, e.g. "Fruits" (NOT a secret). */
  theme: string;

  round: number;                 // 0-based; increments at each new clue round
  phase: ImpostorPhase;

  // ── roles & words ──────────────────────────────────────────────────────
  /** HIDDEN: role per player. The single most important secret in the platform. */
  roles: Record<PlayerId, Role>;
  /** HIDDEN: civilians' secret word. */
  civilianWord: string;
  /** HIDDEN: impostors' decoy word, or '' when impostorWordMode === 'blank'. */
  impostorWord: string;

  // ── liveness ───────────────────────────────────────────────────────────
  /** Public: who is still in the game (false = evicted OR left mid-match). */
  alive: Record<PlayerId, boolean>;
  /** Public: connection presence (greyed seats); does NOT remove from the game. */
  connected: Record<PlayerId, boolean>;

  // ── per-phase working state ─────────────────────────────────────────────
  /** roleReveal: living players who have ack'd their word. Public-as-booleans only. */
  ackRole: Record<PlayerId, boolean>;
  /** clue: deterministic seated order of ALL players; living ones take turns. */
  turnOrder: PlayerId[];
  /** clue: index into turnOrder of the current speaker (skips dead seats on advance). */
  turnIndex: number;
  /**
   * Public clues spoken this round, keyed by player. `null` = turn skipped (no clue).
   * Cleared at the start of each clue round. Player-entered text → profanity-filtered
   * at the DO boundary BEFORE it reaches the reducer (§6).
   */
  clues: Record<PlayerId, string | null>;
  /** discuss: living players who tapped "ready to vote". Public-as-booleans only. */
  readyToVote: Record<PlayerId, boolean>;
  /** HIDDEN: this round's secret votes (voter → target). Promoted to a tally on reveal. */
  votes: Record<PlayerId, PlayerId>;
  /** Public: the most recent reveal outcome (null until first reveal). */
  lastReveal: RevealRecord | null;

  // ── reveal → next dispatch ──────────────────────────────────────────────
  /** Set during reveal resolution; consumed by the reveal `deadline` handler. */
  pendingAfterReveal: 'loop' | 'over' | 'impostorGuess';
  /** impostorGuess: which impostor is guessing (the one just evicted). */
  guessingImpostor: PlayerId | null;
  /** HIDDEN until 'over': the impostor's submitted guess (filtered text). */
  pendingGuess: string | null;

  // ── results ─────────────────────────────────────────────────────────────
  /** Cumulative scores across rounds within this match (see §5). */
  scores: Record<PlayerId, number>;
  /** Only set when phase === 'over'. */
  endReason: EndReason | null;
}
```

### 3.3 Action union

One discriminated union; the DO validates the payload with a zod schema (mirrors
`packages/games/tracer/src/actions.ts`) before calling `reduce`. Text-bearing actions
(`clueDone`, `guessWord`) carry text that has **already passed the profanity filter** at the DO
boundary; the reducer assumes clean text (§6).

```ts
export type ImpostorAction =
  | { kind: 'ackRole' }                              // roleReveal
  | { kind: 'clueDone'; clue: string }               // clue: my one-word clue + end my turn
  | { kind: 'readyToVote' }                          // discuss: request early vote
  | { kind: 'vote'; target: PlayerId }               // vote: secret, buffered
  | { kind: 'guessWord'; word: string };             // impostorGuess: civilians' word attempt
```

```ts
// packages/games/impostor/src/actions.ts (zod, validated at DO boundary)
export const impostorActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ackRole') }),
  z.object({ kind: z.literal('clueDone'), clue: z.string().min(1).max(40) }),
  z.object({ kind: z.literal('readyToVote') }),
  z.object({ kind: z.literal('vote'), target: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('guessWord'), word: z.string().min(1).max(40) }),
]);
```

### 3.4 View union

The view is a discriminated union on `phase`. Every variant is computed by `view(state, viewer)` and
is **spectator-safe**: an unknown viewer (`viewer` not in `players`) gets the same projection as a
non-involved alive player with `me`/`myWord`/`myVote` nulled. The view NEVER contains `roles`,
`civilianWord`, `impostorWord` (except the viewer's own word), the raw `votes` map, or
`pendingGuess` (until `over`).

Shared "envelope" present in **all** non-`over` variants:

```ts
interface ImpostorViewBase {
  round: number;
  theme: string;
  /** Public roster with display-relevant flags; NO roles. */
  seats: Array<{
    id: PlayerId;
    alive: boolean;
    connected: boolean;
  }>;
  scores: Record<PlayerId, number>;
  /**
   * The viewer's own word, IF the viewer is a living/involved player.
   * null for spectators, unknown viewers, and (by choice) eliminated players
   * once 'over'? No — see redaction table: eliminated players keep seeing their
   * own word for context. null only for non-players.
   */
  myWord: string | null;
  /** The viewer's own role, mirror of myWord availability. null for non-players. */
  myRole: Role | null;
  /** Is the viewer alive (false = evicted or left). false/false-safe for non-players. */
  iAmAlive: boolean;
}
```

```ts
export type ImpostorView =
  | (ImpostorViewBase & {
      phase: 'roleReveal';
      /** Living players' ack progress (booleans only — never roles). */
      acked: Record<PlayerId, boolean>;
      iAcked: boolean;
    })
  | (ImpostorViewBase & {
      phase: 'clue';
      turnOrder: PlayerId[];          // public seating order
      currentSpeaker: PlayerId | null;// whose turn (null only in degenerate empty case)
      isMyTurn: boolean;
      /** Clues spoken SO FAR this round (public). Not-yet-spoken players absent/omitted. */
      cluesSoFar: Record<PlayerId, string>;
    })
  | (ImpostorViewBase & {
      phase: 'discuss';
      cluesSoFar: Record<PlayerId, string>;  // full round's clues, public
      ready: Record<PlayerId, boolean>;       // booleans only
      iAmReady: boolean;
    })
  | (ImpostorViewBase & {
      phase: 'vote';
      cluesSoFar: Record<PlayerId, string>;
      /** Booleans only: who has cast a vote. The TARGETS are hidden. */
      hasVoted: Record<PlayerId, boolean>;
      /** The viewer's OWN vote, echoed privately. null for non-voters/non-players. */
      myVote: PlayerId | null;
      /** Valid eviction targets for the viewer (living players except self). */
      votableTargets: PlayerId[];
    })
  | (ImpostorViewBase & {
      phase: 'reveal';
      reveal: RevealRecord;          // evicted, evictedWasImpostor, tally, abstained — all public
    })
  | (ImpostorViewBase & {
      phase: 'impostorGuess';
      /** Who was caught (public — they were just revealed as impostor). */
      guessingImpostor: PlayerId;
      /** Is the viewer the one guessing? Only they get the text input. */
      iAmGuessing: boolean;
    })
  | {
      phase: 'over';
      theme: string;
      seats: Array<{ id: PlayerId; alive: boolean; connected: boolean }>;
      scores: Record<PlayerId, number>;
      endReason: EndReason;
      /** Winning side, public. */
      winners: 'civilians' | 'impostors';
      /** FULL reveal now that the match is over: roles + both words are public. */
      finalRoles: Record<PlayerId, Role>;
      civilianWord: string;
      impostorWord: string;          // '' when impostorWordMode === 'blank'
      /** The impostor's last guess if any, now public. */
      lastGuess: string | null;
    };
```

### 3.5 Redaction matrix — what each viewer kind sees, per phase

Viewer kinds:
- **Active** = the specific player the phase is "waiting on" (e.g. current speaker in `clue`, the
  guessing impostor in `impostorGuess`). Still a living player.
- **Other living** = a living player who is not the active one.
- **Eliminated / spectator-as-player** = a player in `players` whose `alive === false` (evicted or
  left). They keep watching.
- **Unknown viewer** = a `viewer` string not in `players` (true spectator, reconnect-before-resync,
  or hostile probe). MUST get a non-leaking projection.

| Phase | Field | Active | Other living | Eliminated | Unknown |
|---|---|---|---|---|---|
| **all** | `roles` (full) | ❌ never | ❌ never | ❌ never | ❌ never |
| **all** | `civilianWord` / `impostorWord` | ❌ (only own via `myWord`) | ❌ | ❌ | ❌ |
| **all** | `myWord` / `myRole` | ✅ own | ✅ own | ✅ own (their word, for context) | `null` |
| **all** | `seats` (alive/connected) | ✅ | ✅ | ✅ | ✅ |
| **all** | `scores` | ✅ | ✅ | ✅ | ✅ |
| roleReveal | `acked` (booleans) | ✅ | ✅ | ✅ | ✅ |
| clue | `cluesSoFar` | ✅ | ✅ | ✅ | ✅ |
| clue | `isMyTurn` | `true` for speaker | `false` | `false` | `false` |
| clue | `currentSpeaker` | ✅ (public) | ✅ | ✅ | ✅ |
| discuss | `cluesSoFar`, `ready` | ✅ | ✅ | ✅ | ✅ |
| vote | `hasVoted` (booleans) | ✅ | ✅ | ✅ | ✅ |
| vote | `myVote` (target) | ✅ own only | ✅ own only | `null` (dead can't vote) | `null` |
| vote | `votableTargets` | ✅ (living≠self) | ✅ | `[]` (can't vote) | `[]` |
| vote | raw `votes` map | ❌ HIDDEN | ❌ | ❌ | ❌ |
| reveal | `reveal` (evicted, wasImpostor, tally, abstained) | ✅ | ✅ | ✅ | ✅ |
| impostorGuess | `guessingImpostor` | ✅ (public) | ✅ | ✅ | ✅ |
| impostorGuess | `iAmGuessing` | `true` for the caught impostor | `false` | `false` | `false` |
| impostorGuess | `pendingGuess` text | ❌ until over | ❌ | ❌ | ❌ |
| over | `finalRoles`, both words, `lastGuess`, `winners` | ✅ public | ✅ | ✅ | ✅ |

**Key redaction invariants (each → at least one test, tracer-style, plus the engine
`leakedSecrets` audit):**

1. For any state with `phase !== 'over'`, no viewer's serialized view contains another player's
   role or either secret word, except the viewer's own word/role via `myWord`/`myRole`.
2. The string `"votes"` and any non-owner vote target never appear in any vote-phase view
   (mirrors tracer's `not.toContain('"votes"')` and `not.toContain('"myVote":"<target>"')`).
3. `myWord`/`myRole` are `null` for any `viewer` not in `players` (unknown viewer = spectator-safe).
4. An eliminated player still sees `myWord` (their original word) but `myVote` is `null` and
   `votableTargets` is `[]` — they cannot influence the game, only watch.
5. Two impostors must NOT be able to identify each other from the view. The view never marks who is
   an impostor; impostors coordinate purely from hearing clues IRL (this is the whole game). Verified
   by: invariant 1 already forbids `roles`; add an explicit test that impostor A's view equals what a
   civilian would see for player B's role data (nothing).

Use the engine's `leakedSecrets(module, state, viewers, secrets)` helper in tests with
`secrets = [{value: civilianWord}, {value: impostorWord}, ...roleStrings]` and `owner` set for each
player's own word. (Per its doc, exempt the owner for their own secret.)

---

## 4. Reducer behavior — every (phase, event) combination

### 4.0 Role ratio by player count

Computed deterministically in `init` from `players.length`, then capped by `config.maxImpostors`.

| Players | Impostors | Civilians | Rationale |
|---|---|---|---|
| 3 | 1 | 2 | absolute minimum: 1 impostor vs 2 |
| 4 | 1 | 3 | |
| 5 | 1 | 4 | |
| 6 | 1 | 5 | |
| 7 | 2 | 5 | second impostor unlocks at 7 |
| 8 | 2 | 6 | |
| 9 | 2 | 7 | |
| 10 | 2 | 8 | |
| 11 | 3 | 8 | third unlocks at 11 |
| 12–16 | 3 | 9–13 | capped at `maxImpostors = 3` |

Formula (pure): `impostors = min(maxImpostors, 1 + floor((n - 5) / 4))` clamped to `>= 1`.
Check: n=3..6→1, n=7..10→2, n=11..14→3, n=15..16→3 (cap). This keeps impostors a strict minority
(impostors < civilians) at every count, which the parity win condition depends on.

**Why min is 3, not 2:** with 2 players the single vote is a coin-flip with no discussion dynamic and
the impostor-guess mechanic degenerates. `minPlayers = 3`. (The platform allows 2–16 generally; this
game opts into 3–16. The lobby gates "start" on `>= minPlayers`.)

### 4.1 `init(seed, players, content)`

```
- Pick a word pair: shuffle content.data.pairs with createRng(seed); take pairs[0].
  theme = pair.theme; civilianWord = pair.civilian; impostorWord =
    (config.impostorWordMode === 'decoy') ? pair.impostor : ''.
- impostorCount = role table above (min(maxImpostors, 1 + floor((n-5)/4)), >=1).
- shuffle players with the SAME rng stream (deterministic); first impostorCount become impostors.
  roles = emptyPlayerMap; assign 'impostor'/'civilian'.
- turnOrder = shuffle(rng, players)  (seated order; stable for the whole match).
- alive[p] = true; connected[p] = true; scores[p] = 0 for all p.
- ackRole/readyToVote = empty bool maps; clues/votes = empty maps; turnIndex = 0.
- round = 0; phase = 'roleReveal'; lastReveal = null; pendingAfterReveal = 'loop';
  guessingImpostor = null; pendingGuess = null; endReason = null.
- Effects: [{ type:'analytics', name:'impostor_match_started',
              props:{ players: n, impostors: impostorCount } }].
```

> All randomness flows from `createRng(seed)`; never `Math.random`. State is JSON-serializable.

### 4.2 Transition table (phase × event)

Notation: "living" = `alive[p] === true`. Unknown/dead/duplicate actions are **inert** (return
`{ state, effects: [] }`), exactly like the tracer ignores non-roster votes. `phase === 'over'` is
globally inert (first guard in `reduce`, like tracer).

| Phase | `action` | `deadline` | `playerLeft` | `playerRejoined` |
|---|---|---|---|---|
| **roleReveal** | `ackRole` from a living player → set `ackRole[p]=true`. If all living acked → enter `clue` (turnIndex=0, advance to first living seat). Other kinds / dead / dup → inert. | enter `clue` regardless of unacked. | mark `connected[p]=false`; **also** apply liveness rule (§4.3). If that empties a side → win-check. | `connected[p]=true`. If still in `roleReveal`, no state change beyond presence. |
| **clue** | `clueDone{clue}` from the **current living speaker** only → `clues[speaker]=clue`, advance `turnIndex` to next living seat. If no living seat remains after current → `discuss`. Wrong player / not-their-turn / other kinds → inert. | record `clues[currentSpeaker]=null` (skipped), advance turn (or → `discuss` if last). | `connected=false` + liveness (§4.3). If the leaver was the current speaker → advance turn. | `connected=true`. |
| **discuss** | `readyToVote` from a living player → `readyToVote[p]=true`. If all living ready → enter `vote` (reset `votes`). Other/dead/dup → inert. | enter `vote` (reset `votes`). | `connected=false` + liveness. | `connected=true`. |
| **vote** | `vote{target}` from a living player where `target` is living and `!= self` → `votes[p]=target` (overwrites allowed until resolved? **No** — first vote locks; re-vote is inert, see §4.4). If all living voted → resolve → `reveal`. Invalid target / dead voter / self-vote → inert. | resolve with whoever voted (abstainers omitted) → `reveal`. | `connected=false` + liveness; **drop their buffered vote** if present (a left player's vote doesn't count). If this makes "all remaining living voted" → resolve. | `connected=true`. |
| **reveal** | any action → inert (reveal is a display window). | dispatch on `pendingAfterReveal`: `'over'`→enter `over`; `'impostorGuess'`→enter `impostorGuess` (set `guessingImpostor`); `'loop'`→win-check then next `clue` round or `over`. | `connected=false` + liveness (does not change the already-computed reveal). | `connected=true`. |
| **impostorGuess** | `guessWord{word}` from `guessingImpostor` only → `pendingGuess=word`; if normalized-equals `civilianWord` → impostors win → `over` (`endReason='impostorGuessedWord'`). Else → win-check → next `clue` or `over`. Wrong player/other kinds → inert. | treat as wrong/absent guess → win-check → next `clue` or `over`. | `connected=false` + liveness. If the **guessing impostor** leaves → treat as absent guess (resolve as deadline would). | `connected=true`. |
| **over** | inert | inert | inert (may still record `connected=false` for display? No — `over` is fully inert per tracer rule) | inert |

### 4.3 Liveness rule for `playerLeft` (mid-game leaves)

`playerLeft` first sets `connected[p] = false` (greyed seat). Whether the player is **removed from
the game** (`alive[p] = false`) is a product decision; default:

- **A left player remains `alive` but disconnected during the 60–120s shell grace window** (the shell
  may send `playerRejoined`). The reducer does NOT evict on `playerLeft` alone — it only flips
  `connected`. This matches the spec's grace-timer model and keeps roles/words intact for resync.
- The shell, on grace expiry, sends a **`playerLeft` for the same player again is not how it works**;
  instead the reducer's own timers don't track grace. **Decision:** to keep the module pure and
  contract-faithful, a left player who never rejoins simply stops acting; phases resolve on their
  **deadline** because "all living acted" excludes nobody — so we must define "living" for
  *resolution* as `alive && connected`. **Final rule:** phase auto-advances when **all
  alive-and-connected players have acted**, OR on deadline. A disconnected-but-alive player can't
  stall a phase past its deadline, and rejoining restores their ability to act if the phase is still
  open.

**Room-collapse guard:** if at any resolution the count of `alive && connected` players drops below
**3** (e.g. mass disconnect), the reducer ends the match: `phase='over'`,
`endReason='roomCollapsed'`, `winners` = side with more survivors (tie → civilians), and emits
`gameOver` with current scores. This prevents an unplayable 1-player "match" from limping on.

> Net effect: `alive` only ever flips to `false` via **eviction** (vote) — never via disconnect.
> `connected` tracks presence. Resolution gates on `alive && connected`. This is the single subtle
> rule another engineer must implement exactly; it is the difference between a stall-proof game and a
> game a rage-quitter can freeze.

### 4.4 Edge cases (must each have a test)

- **Duplicate / re-vote:** once `votes[p]` is set in the current `vote` phase, a second `vote` from
  `p` is **inert** (vote locks on first cast). Same for `ackRole`, `readyToVote`, `clueDone`
  (acting twice is a no-op).
- **Self-vote / dead-target vote:** inert (mirrors tracer's `target === playerId` and roster checks).
- **Action from a non-roster `playerId`:** inert.
- **Action in the wrong phase** (e.g. `vote` during `discuss`): inert.
- **`clueDone` from someone who isn't the current speaker:** inert (turn-gated).
- **All abstain in vote:** deadline resolves with empty tally → `evicted = null` (no eviction);
  `RevealRecord.evicted = null`, `evictedWasImpostor = false`; `pendingAfterReveal = 'loop'` →
  win-check → next round. (A round can pass with nobody out.)
- **Exact minimum (3 players, 1 impostor):** vote resolves; if the impostor is evicted →
  `impostorGuess`; correct guess → impostors win, else civilians win immediately
  (`civiliansEjectedAllImpostors`). If a civilian is evicted → 2 alive (1 civ, 1 imp) →
  **impostor parity** → impostors win (`impostorsReachedParity`).
- **16 players, 3 impostors:** role table caps at 3; turnOrder has 16 seats; clue phase runs 16
  per-turn timers (phaseKey advances `t0..t15`); vote needs all 16 living to lock early or hits the
  30s deadline. Performance is trivial (pure maps).
- **Tie in the vote (see §4.5):** resolved deterministically with no random tiebreak.
- **Impostor evicted but more impostors remain (≥7 players):** that evicted impostor still gets a
  guess (could end the game early for the impostor side); a wrong guess → continue, remaining
  impostors play on with one fewer.

### 4.5 Tie rules (vote resolution)

Compute `tally` over buffered `votes` (abstainers excluded). Let `max = highest vote count`.

- **Single leader (`max > 0`, exactly one player at `max`):** that player is evicted.
- **Tie at the top (`max > 0`, ≥2 players tied):** **no eviction this round.** `evicted = null`,
  `evictedWasImpostor = false`. Deterministic, no random, no revote. Rationale: party pacing — a
  hung jury is dramatic and avoids a fragile revote sub-phase. (Alternative "sudden-death revote" is
  noted in §9.)
- **Everyone abstained (`max === 0`):** no eviction (`evicted = null`).

This makes reveal-resolution pure and tie-handling identical to "nobody evicted", so
`pendingAfterReveal = 'loop'` in all no-eviction cases.

### 4.6 Win-check (pure helper, runs at each loop point)

Order matters; first match wins:

1. **`impostorGuessedWord`** — handled inline in `impostorGuess` (correct guess) → impostors win.
2. **`civiliansEjectedAllImpostors`** — count of living impostors == 0 → civilians win.
3. **`impostorsReachedParity`** — living impostors ≥ living civilians → impostors win.
4. **`roomCollapsed`** — `alive && connected` count < 3 → end (§4.3).
5. Otherwise → continue: `round += 1`, `phase='clue'`, reset `clues`/`ackRole` not needed (clue
   doesn't gate on ack), `readyToVote`/`votes` reset, `turnIndex` advanced to first living seat.

On any win: `phase='over'`, set `endReason`, `winners`, apply end-of-match scoring (§5), emit
`{type:'gameOver', scores}` with a **cloned** scores object (tracer rule: gameOver scores must not
alias live state — see `phases.test.ts` "gameOver effect scores do not alias live state").

---

## 5. Scoring, multi-round structure, ad slot

### 5.1 Within a match (rounds)

A match = repeated rounds until a win condition. Scoring is awarded **at match end** based on
outcome (simplest, least gameable, easy to test):

| Outcome | Award |
|---|---|
| Civilians win (all impostors ejected) | **+2** to every player who was a civilian **and** survived to the end; **+1** to civilians evicted along the way (participation). |
| Impostors win (parity) | **+3** to each surviving impostor; **+1** to each civilian (consolation). |
| Impostor wins by correct guess | **+4** to the guessing impostor; **+2** to any other surviving impostor; **0** to civilians. |
| Room collapsed | scores unchanged from accumulated; `gameOver` carries current `scores`. |

Per-round micro-scoring (e.g. "+1 for voting the impostor") is intentionally omitted to keep the
hidden-state model clean and the reducer small; revisit in §9. Scores accumulate across **matches in
a session** when the shell reuses the running totals (see §5.2).

### 5.2 Multi-match session & the ad slot

```
Lobby ──► [Match 1] ──► over/standings ──► ★ INTERSTITIAL AD ★ ──► [Match 2] ──► over ──► ★ AD ★ ──► …
```

- One `GameModule` instance == one match. The shell, on receiving the `gameOver` effect, shows the
  **standings screen**, then triggers the **AdMob interstitial** (spec §5/§8: "interstitials between
  rounds" — here, between *matches*, the natural break), respecting remote-config frequency caps.
- A new match re-`init`s the module with a fresh seed and the **same roster**, carrying forward
  `scores` as the new match's starting totals (the shell passes accumulated scores into a thin
  wrapper, OR a future `init` overload — but to stay within the current contract, **the shell keeps
  the running total and the module's per-match scores start at 0 each match**; the standings UI sums
  them). **Decision:** keep the module match-local (scores start at 0 each `init`); the shell owns the
  session leaderboard. This keeps the module pure and re-init trivial — no contract change.
- The interstitial **never** falls mid-round or during reveal (would break the simultaneous-reveal
  illusion and tank UX). It falls only at the `over` → next-match boundary. Round-internal phase
  transitions never trigger ads.

---

## 6. Content pack: schema, examples, moderation

### 6.1 Schema (`ContentPack<ImpostorContent>` in R2, versioned JSON)

```ts
export interface WordPair {
  /** Theme label shown publicly to all players, e.g. "Fruits" / "Fruits". */
  theme: string;
  /** Civilians' secret word. */
  civilian: string;
  /** Impostors' decoy word (same theme, close but distinct). Used only in 'decoy' mode. */
  impostor: string;
  /** BCP-47-ish language tag for filtering the pack by room locale. */
  lang: 'en' | 'fr';
  /** Optional difficulty hint for future pack curation. */
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface ImpostorContent {
  pairs: WordPair[];
}
```

Matches the engine's `ContentPack<D>` envelope (`{ id, version, data }`), so the R2 object is:

```json
{
  "id": "impostor-words-core",
  "version": 3,
  "data": {
    "pairs": [
      { "theme": "Fruits",    "civilian": "Strawberry", "impostor": "Raspberry", "lang": "en", "difficulty": "easy" },
      { "theme": "Fruits",    "civilian": "Fraise",     "impostor": "Framboise", "lang": "fr", "difficulty": "easy" },
      { "theme": "Drinks",    "civilian": "Coffee",     "impostor": "Tea",       "lang": "en", "difficulty": "easy" },
      { "theme": "Boissons",  "civilian": "Café",       "impostor": "Thé",       "lang": "fr", "difficulty": "easy" },
      { "theme": "Animals",   "civilian": "Dolphin",    "impostor": "Shark",     "lang": "en", "difficulty": "medium" },
      { "theme": "Animaux",   "civilian": "Loup",       "impostor": "Renard",    "lang": "fr", "difficulty": "medium" },
      { "theme": "Travel",    "civilian": "Airport",    "impostor": "Train station", "lang": "en", "difficulty": "medium" },
      { "theme": "Lieux",     "civilian": "Plage",      "impostor": "Piscine",   "lang": "fr", "difficulty": "easy" },
      { "theme": "Sports",    "civilian": "Tennis",     "impostor": "Badminton", "lang": "en", "difficulty": "hard" },
      { "theme": "Nourriture","civilian": "Pizza",      "impostor": "Quiche",    "lang": "fr", "difficulty": "medium" },
      { "theme": "Jobs",      "civilian": "Surgeon",    "impostor": "Dentist",   "lang": "en", "difficulty": "hard" },
      { "theme": "Météo",     "civilian": "Brouillard", "impostor": "Nuage",     "lang": "fr", "difficulty": "hard" }
    ]
  }
}
```

`init` filters `pairs` to the room's locale (passed via content selection at the shell, or by reading
all and shuffling — **decision:** the shell selects the locale-appropriate pack id; `init` shuffles
and takes `pairs[0]`, like tracer takes `prompts[0]`). Packs are immutable per version; bumping a
pack is a `version` increment in KV.

### 6.2 Pair authoring rules (curation guidance)

- `civilian` and `impostor` must be **same theme, clearly distinct, similar abstractness** so a
  one-word clue is plausibly ambiguous (good: Strawberry/Raspberry; bad: Strawberry/Toaster).
- No proper nouns that depend on regional knowledge unless the pack is region-tagged.
- Keep both words ≤ 2 tokens to fit the reveal card; clue input is capped at 40 chars (§3.3).
- Maintain parallel FR/EN coverage so a mixed-locale room can fall back gracefully.

### 6.3 Moderation — player-entered text paths

There are exactly **two** player-text inputs that ever leave a phone, plus the lobby nickname
(owned by the platform, spec §6):

1. **`clueDone.clue`** (the spoken-aloud word, also displayed publicly on the clue card).
2. **`guessWord.word`** (the impostor's word guess).

Both pass the **server-side `obscenity` profanity filter at the DO input boundary** (spec §10/§7)
**before** the action reaches `reduce`. The reducer therefore assumes clean text and never filters.
Handling on rejection (shell-side, not reducer): the DO drops/asks-retry for a flagged clue and does
**not** advance the turn (the player taps again with a clean word); a flagged guess is treated as not
yet submitted until clean or until the `guessMs` deadline (then absent-guess resolution).

Additional notes:
- Content-pack words are **author-vetted**, not user-supplied — no runtime filter needed on them.
- `guessWord` comparison to `civilianWord` is **normalized** (trim, lowercase, strip diacritics &
  punctuation) so "café" matches "Café" — a pure helper in the module, deterministic.
- Report/block/kick are platform features (spec §8 moderation), out of this module's scope.

---

## 7. UI screens → Bloop moodboard components

Brief; the mobile design doc owns visual detail. Components referenced from the Bloop moodboard.

| Phase / screen | Key components |
|---|---|
| Lobby (pre-init) | Join chips (player roster), 4-char room code, QR, host Start button, player-count gate (≥3) |
| Role reveal | Full-bleed **reveal card** (your word + role tone), "tap to memorize / hold-to-peek" affordance, countdown ring (`roleRevealMs`), ack button |
| Clue (your turn) | Turn-order strip (avatars, current speaker highlighted), big per-turn **timer ring**, one-word text input + "Done" |
| Clue (waiting) | Turn-order strip with live "spoken" chips filling in (`cluesSoFar`), passive timer |
| Discuss | Clue board (all clues as chips), discussion **timer bar**, "Ready to vote" toggle + ready-count |
| Vote | Voting grid of living-player avatars (tap to select), "voted" checkmarks (booleans), private "your vote locked" state, deadline ring |
| Reveal | **Reveal card**: evicted avatar with a flip animation (impostor badge or civilian crest), tally bars, simultaneous broadcast |
| Impostor guess | Spotlight on caught impostor; word input for them, "they're guessing…" suspense state for everyone else |
| Standings (over) | Scoreboard rows, winning-side banner, full role/word reveal, "Rematch" CTA → **interstitial ad** → next match |

Eliminated/spectator players see the same screens in a **read-only spectator skin** (no inputs,
greyed turn controls), retaining their own word for context.

---

## 8. engineNeeds (beyond the current contract)

Conservative — almost everything fits the existing `GameModule<S,A,V,C>`:

1. **`phaseKey(state): string`** — the one planned addition (already flagged as a contract gap). The
   shell needs it to (a) detect per-turn transitions in `clue` to re-arm the per-turn timer, and
   (b) detect the `over` boundary to fire the interstitial. Designed and used throughout this doc
   (§2.3). **This is the only contract change this game wants.** It is additive and shell-facing; the
   module can ship its `phaseKey` immediately.
2. **No new event types needed.** `playerLeft`/`playerRejoined` cover disconnect/reconnect; the
   "alive && connected" resolution rule (§4.3) is implemented *inside* the reducer with existing
   events. Eviction is driven by `vote`/`deadline`, never by an engine event.
3. **No new effect types needed.** `analytics` + `gameOver` suffice. The interstitial ad is a
   shell/client concern triggered off `gameOver` + the standings screen, not a game effect. (If
   product later wants the *module* to request an ad mid-session, that would be a new
   `Effect` variant like `{type:'adSlot'}` — **not needed now**; noted only for completeness.)
4. **Profanity filter** already exists at the DO boundary (spec §10); the module relies on it and
   does no filtering. No engine change.
5. **Per-turn timers within one phase** are handled by `phaseDurationMs` returning the per-turn
   duration plus `phaseKey` changing each turn — no "multi-timer" contract is required. Confirmed
   sufficient.

Net: **one additive helper (`phaseKey`)**, which is already planned. Everything else lives within the
current 50-tests-green contract.

---

## 9. Open product questions

1. **Tie-break policy.** Default (§4.5) is *no eviction on a tie*. Alternative: a sudden-death
   revote sub-phase among the tied players, or a host tiebreak. Confirm the no-eviction default is
   acceptable for pacing.
2. **`impostorWordMode` default.** Default `'decoy'` (impostor gets a related word). `'blank'`
   (impostor knows nothing) is harder and more paranoid — which ships as the default catalog config?
3. **Per-round micro-scoring.** Current model scores only at match end (§5.1). Do we want
   "+1 for correctly voting an impostor" / "survival bonus per round" for a livelier leaderboard,
   accepting a bigger reducer + more redaction surface?
4. **Eliminated players: full spectator vs. word-hidden.** Default keeps an evicted player's *own*
   word visible for context. Alternative: blank everything once evicted (more "you're out" sting).
5. **Impostor count cap.** Capped at 3 (`maxImpostors`). Do 15–16-player rooms want a 4th impostor
   for chaos? (Would need a parity re-check on the table.)
6. **Guess scope.** Impostor guesses only the **civilian** word. Should a *blank-mode* impostor also
   be allowed to guess the *theme* for partial credit? (Currently no.)
7. **Locale mixing.** A room with mixed FR/EN speakers: pick pack by host locale (default) or by
   majority? Mixed-language clues are funny but can leak the word.
8. **Session length.** How many matches before a "session over / leave" nudge, and how does the ad
   frequency cap interact with very short matches (3-player games can end in ~90s)?
9. **Speaking order fairness.** Turn order is random per match (§4.1). Should the impostor be
   biased to never speak first (less pressure) or is random fairer? Currently fully random.

---

## Appendix A — Module skeleton (for the implementer, tracer-style)

```ts
import type { Effect, GameModule, PlayerId, ReduceResult } from '@bloop/engine';
import { createRng, shuffle } from '@bloop/engine';
import { DEFAULT_CONFIG, type ImpostorState, type ImpostorAction, type ImpostorView } from './state.js';

export interface ImpostorContent { pairs: WordPair[]; }

function emptyPlayerMap<V>(): Record<PlayerId, V> {
  return Object.create(null) as Record<PlayerId, V>;
}

export const impostor: GameModule<ImpostorState, ImpostorAction, ImpostorView, ImpostorContent> = {
  id: 'impostor',
  version: 1,
  minPlayers: 3,
  maxPlayers: 16,
  init(seed, players, content) { /* §4.1 */ },
  reduce(state, event) {
    if (state.phase === 'over') return { state, effects: [] };   // global inert (tracer rule)
    // dispatch on (state.phase, event) per §4.2
  },
  view(state, viewer) { /* §3.4 / §3.5 — spectator-safe, no secrets */ },
  phaseDurationMs(state) { /* §2.1 */ },
  // phaseKey(state) { /* §2.3 — once the contract addition lands */ },
};
```

## Appendix B — Test plan (mirrors `packages/games/tracer/test/*`)

- `init.test.ts` — role ratios for n=3..16; determinism (same seed → same roles/words/turnOrder);
  scores zeroed; `impostorWordMode` blank vs decoy.
- `phases.test.ts` — roleReveal→clue (all ack vs deadline); clue per-turn advance + skip-on-deadline;
  discuss→vote; vote→reveal; reveal dispatch (loop/over/impostorGuess); `phaseKey` strings.
- `vote.test.ts` — first-vote locks; re-vote/self-vote/dead-target/non-roster inert; tie → no
  eviction; all-abstain → no eviction; all-living-voted resolves early.
- `redaction.test.ts` — §3.5 invariants 1–5 + `leakedSecrets` audit across all phases and all four
  viewer kinds; `"votes"` never serialized; impostor can't see co-impostor.
- `liveness.test.ts` — `playerLeft` greys but doesn't evict; resolution gates on `alive && connected`;
  disconnected player can't stall past deadline; rejoin restores acting; room-collapse < 3 → over.
- `winconditions.test.ts` — civilians eject all impostors; impostor parity; correct-guess win;
  guess normalization (café/Café); evicted-impostor-with-others-remaining keeps a guess.
- `replay.test.ts` — fold the event log via engine `replay`; rehydrated state equals live state;
  effects dropped on replay (engine contract).
- `scoring.test.ts` — each outcome's awards; `gameOver` scores cloned (don't alias live state).
```
