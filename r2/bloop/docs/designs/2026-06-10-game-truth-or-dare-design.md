# Game Design — Truth or Dare

**Date:** 2026-06-10
**Status:** Design (ready to implement)
**Game id:** `truth-or-dare`
**Author:** Game design + TS architecture pass
**Targets contract:** `GameModule<S,A,V,C>` in `packages/engine/src/types.ts` (50 tests green), tracer conventions in `packages/games/tracer/src/`.

> This doc is written so another engineer can implement `packages/games/truth-or-dare/src/{state.ts,truthOrDare.ts}` and its Vitest suite from the doc alone, in the tracer's style. Decisions are made; alternatives live only in §9 (Open questions). Nothing here modifies an existing file.

---

## 1. Overview

Truth or Dare is the party classic: the active player picks **Truth** or **Dare**, the room draws a content-pack prompt at the chosen intensity, the player completes it (or burns a pass), and **the group verdicts** whether they actually did it — done or chickened — which drives points. Turn rotation goes around the circle so everyone is the spotlight, and the verdict step turns watching into participation so nobody is idle. Short rounds, big reveal, low-friction, content-driven; new packs drop without a code change.

- **Players:** min **2**, max **16** (matches platform constraint and tracer).
- **Why it's fun:** every player is forced into the spotlight in turn (no hiding), the group verdict makes the room the referee (peer pressure is the game), and intensity tiers + skip economy let a chill afternoon and a late-night party use the exact same module with different config.

---

## 2. Phase / state machine

Five gameplay phases plus terminal `over`. One **turn** = one active player's full cycle (`choose → prompt → verdict → score`). A **round** = one full lap of the rotation (every currently-present player has been active once). The game ends after `config.totalRounds` laps **or** when the content pool is exhausted for a tier (see §4).

```
            ┌──────────────────────────────── next turn ─────────────────────────────┐
            │                                                                          │
  init ─▶ choose ──(active picks T/D)──▶ prompt ──(active acts/pass)──▶ verdict ──▶ score ──┤
            ▲           │ deadline: auto-pick (see §4)        │ all non-active voted     │
            │           └──────────────── deadline: skip-as-chicken ◀───────────────────┘
            │                                                                          │
            └────────────────────── end of lap & rounds remain ◀──────── (else) ──▶ over
```

### Phase table

| Phase | Who acts | Ends when (all-acted) | Ends when (deadline) | `phaseDurationMs` | Untimed? |
|---|---|---|---|---|---|
| `choose` | active player only | active submits `chooseType` | auto-pick (seeded) Truth/Dare | `config.chooseMs` = **15_000** | no |
| `prompt` | active player only | active submits `completed` or `pass` | treated as `chickened` (auto-fail), no pass spent | `config.promptMs` = **45_000** | no |
| `verdict` | every present player **except** active | all non-active present players have voted | tally whatever votes are in (abstainers excluded) | `config.verdictMs` = **20_000** | no |
| `score` | nobody (reveal) | — | advance to next turn (or `over`) | `config.scoreMs` = **6_000** | no |
| `over` | nobody | — | — | `null` | yes (terminal) |

Notes:
- **All-acted vs deadline** mirrors tracer: `choose`/`prompt` end on the single active player's action; `verdict` ends when every eligible (present, non-active) player has voted, exactly like tracer's `state.players.every(...)` but over the eligible subset. Deadline is the safety net so a silent/absent player never stalls the room.
- `score` is a pure reveal phase (no actions accepted) whose only exit is its deadline — same shape as tracer's `reveal`.

### `phaseKey` scheme (planned contract addition)

`phaseKey(state): string` returns a value that changes **on every phase transition the shell must react to** (so the shell can detect "new phase → re-arm alarm, fire interstitial check, broadcast"). Scheme:

```
`${phase}:${turnSeq}`
```

- `turnSeq` is a monotonic counter incremented **once per turn entry** (i.e., each time we (re)enter `choose` for a new active player). It is NOT the round number — it is global across the whole game so it never repeats.
- Examples: `choose:0`, `prompt:0`, `verdict:0`, `score:0`, then `choose:1`, …, terminal `over:42`.
- Why `turnSeq` and not `round`: with 2 players, `round` advances every 2 turns; `verdict:round` would collide between the two players in the same round. `turnSeq` is unique per (phase, turn) pair and strictly increasing, which is exactly the idempotency key the shell's `phaseSeq` guard (spec §6) wants.
- The shell treats `phaseKey` as opaque; this game guarantees it changes iff the phase or the active turn changed. If the contract gap isn't closed before build, the shell can derive the same string from the view (`view.phase` + `view.turnSeq`, both exposed — see §3), so this game does **not hard-block** on the addition. See §8.

---

## 3. TypeScript shapes

File split mirrors tracer: types/config in `state.ts`, module in `truthOrDare.ts`.

### Config + Content type

```ts
// state.ts
import type { PlayerId } from '@bloop/engine';

export type Intensity = 'soft' | 'party' | 'spicy';
export type Choice = 'truth' | 'dare';

export interface TodConfig {
  totalRounds: number;       // laps of the rotation before `over`
  chooseMs: number;          // 15_000
  promptMs: number;          // 45_000
  verdictMs: number;         // 20_000
  scoreMs: number;           // 6_000
  passesPerPlayer: number;   // skip economy: lifetime passes per player (default 2)
  allowedIntensities: Intensity[]; // gates 'spicy' for store compliance (see §6)
  donePoints: number;        // 10
  passPoints: number;        // 3  (you owned up instead of faking)
  chickenedPoints: number;   // 0
  dareBonus: number;         // 5  extra for a verdicted-done DARE over a TRUTH
  verdictThreshold: number;  // fraction of non-active voters needed for 'done' (0.5 = simple majority)
}

export const DEFAULT_CONFIG: TodConfig = {
  totalRounds: 3,
  chooseMs: 15_000,
  promptMs: 45_000,
  verdictMs: 20_000,
  scoreMs: 6_000,
  passesPerPlayer: 2,
  allowedIntensities: ['soft', 'party'], // 'spicy' OFF by default — store-safe default
  donePoints: 10,
  passPoints: 3,
  chickenedPoints: 0,
  dareBonus: 5,
  verdictThreshold: 0.5,
};
```

### State (HIDDEN fields marked)

```ts
export type TodPhase = 'choose' | 'prompt' | 'verdict' | 'score' | 'over';

/** One drawn prompt instance for the current turn. */
export interface ActivePrompt {
  choice: Choice;        // truth | dare
  intensity: Intensity;  // which tier was drawn
  id: string;            // content-pack entry id (for analytics + no-repeat)
  text: string;          // the resolved prompt text (already profanity-clean: packs are pre-moderated)
}

export interface TodState {
  config: TodConfig;
  players: PlayerId[];          // seating order, fixed at init (rotation order)
  phase: TodPhase;

  // --- rotation / progress ---
  rotation: PlayerId[];         // seeded permutation of players = the lap order
  turnIndex: number;            // index into `rotation` of the current active player
  turnSeq: number;              // monotonic, ++ on each turn entry; powers phaseKey
  round: number;                // 0-based lap counter (round 0 = first lap)

  // --- current turn ---
  activePlayer: PlayerId;       // rotation[turnIndex] resolved to a present player (see §4)
  choice: Choice | null;        // null until `choose` resolves
  prompt: ActivePrompt | null;  // null until `prompt` phase entered
  outcome: 'done' | 'chickened' | 'passed' | null; // active's self-claimed action result, pre-verdict
                                                    // 'done'/'chickened' set in `prompt`; verdict may overturn 'done'→'chickened'

  // --- content pools (seeded, no-repeat) ---
  /** HIDDEN: full ordered draw decks per (choice,intensity); exposing them would leak upcoming prompts. */
  decks: Record<string, string[]>;   // key = `${choice}:${intensity}` -> ordered entry ids (shuffled at init)
  /** HIDDEN: per-deck cursor; next undrawn index. Leaking it leaks deck position. */
  cursors: Record<string, number>;   // key = `${choice}:${intensity}` -> next index into decks[key]

  // --- verdict ---
  /** HIDDEN: per-voter verdict for the current turn; promoted to a public tally only at `score`. */
  verdicts: Record<PlayerId, 'done' | 'chickened'>;

  // --- persistent across turns ---
  scores: Record<PlayerId, number>;
  passesLeft: Record<PlayerId, number>;   // skip economy remaining per player
  /** HIDDEN: ids already served this game, so re-draws never repeat. */
  usedPromptIds: string[];

  // --- result of the just-resolved turn, shown during `score` ---
  lastResult: {
    activePlayer: PlayerId;
    choice: Choice;
    intensity: Intensity;
    promptText: string;
    verdict: 'done' | 'chickened' | 'passed';
    tally: { done: number; chickened: number };
    pointsAwarded: number;
  } | null;
}
```

> **Redaction rule (tracer hard rule):** `decks`, `cursors`, `verdicts`, `usedPromptIds` are HIDDEN — they never appear in any `view()` output. `prompt`/`choice`/`outcome` for the **current** turn are public (the prompt text is shown to everyone; that's the whole point), but the *upcoming* deck contents are not. The redaction audit (`leakedSecrets`) targets in-flight `verdicts` values and undrawn prompt texts.

### Action union

```ts
export type TodAction =
  | { kind: 'chooseType'; choice: Choice }                       // choose phase, active only
  | { kind: 'declare'; result: 'done' | 'chickened' }            // prompt phase, active only
  | { kind: 'pass' }                                             // prompt phase, active only, if passesLeft > 0
  | { kind: 'verdict'; vote: 'done' | 'chickened' };             // verdict phase, non-active present only
```

Payload validation is the game's responsibility server-side (protocol §wire passes `action.payload` as `unknown`). Implement a zod schema `todActionSchema` for the DO boundary; the reducer additionally guards everything (defense in depth, like tracer's `includes` checks).

### View union (per phase)

The view carries common scaffolding (`round`, `totalRounds`, `turnSeq`, `scores`, `rotation`, `activePlayer`, `passesLeft`, `connected`) so the client can render the rotation rail and HUD in every phase. Per-phase additions below.

```ts
/** Public per-player presence so greyed-out seats render (spec §6 reconnect). */
export type ConnMap = Record<PlayerId, boolean>;

export interface TodCommonView {
  round: number;
  totalRounds: number;
  turnSeq: number;             // lets the shell derive phaseKey if the contract gap isn't closed
  rotation: PlayerId[];
  activePlayer: PlayerId;
  scores: Record<PlayerId, number>;
  passesLeft: Record<PlayerId, number>;
  intensities: Intensity[];    // allowedIntensities, so client renders the right chips
}

export type TodView =
  | (TodCommonView & {
      phase: 'choose';
      youAreActive: boolean;       // viewer === activePlayer
      // active sees the T/D chips; others see "waiting for <active> to choose"
    })
  | (TodCommonView & {
      phase: 'prompt';
      youAreActive: boolean;
      choice: Choice;              // public: which they picked
      intensity: Intensity;        // public
      promptText: string;          // public: everyone reads the dare/truth
      canPass: boolean;            // viewer-specific: active && passesLeft[active] > 0
    })
  | (TodCommonView & {
      phase: 'verdict';
      youAreActive: boolean;
      choice: Choice;
      intensity: Intensity;
      promptText: string;
      outcome: 'done' | 'chickened' | 'passed'; // what the active CLAIMED (public)
      youCanVote: boolean;         // viewer is present, non-active, hasn't voted
      youVoted: 'done' | 'chickened' | null; // viewer-specific echo of own vote, never others'
      votesIn: number;             // count only — never who voted what (hidden until score)
      votersExpected: number;      // present non-active count, so client shows "3/5 voted"
    })
  | (TodCommonView & {
      phase: 'score';
      lastResult: {
        activePlayer: PlayerId;
        choice: Choice;
        intensity: Intensity;
        promptText: string;
        verdict: 'done' | 'chickened' | 'passed';
        tally: { done: number; chickened: number }; // now public — the reveal
        pointsAwarded: number;
      };
      nextActive: PlayerId | null; // who's up next, or null if game ends after this
    })
  | { phase: 'over'; scores: Record<PlayerId, number>; rotation: PlayerId[] };
```

### Redaction matrix — what each viewer kind sees, per phase

Viewer kinds: **A** = active player, **O** = other present player, **S** = spectator / disconnected-but-seated player, **U** = unknown id (non-player; spectator-safe default).

| Phase | A (active) | O (other present) | S (spectator/disconnected) | U (unknown) |
|---|---|---|---|---|
| `choose` | T/D chips, `youAreActive=true` | "waiting for active to choose", `youAreActive=false` | same as O | same as O (no per-player secret exists in this phase) |
| `prompt` | prompt text + `canPass=(passesLeft>0)`, `youAreActive=true` | prompt text, `canPass=false` | prompt text, `canPass=false` | prompt text, `canPass=false` |
| `verdict` | prompt + claimed `outcome`, `youCanVote=false` (active can't vote), `youVoted=null` | prompt + `outcome`, `youCanVote=true` if not yet voted, `youVoted=<own vote or null>`, `votesIn` count only | `youCanVote=false`, `youVoted=null`, `votesIn` count only | `youCanVote=false`, `youVoted=null`, `votesIn` count only |
| `score` | full `lastResult` incl. tally | identical `lastResult` | identical | identical |
| `over` | final `scores` + `rotation` | identical | identical | identical |

**The invariant:** at no point does any viewer see another player's *individual* verdict vote, nor any undrawn deck content, nor the hidden cursors. `votesIn`/`votersExpected` are counts only (tracer's `hasVoted` analogue). `youVoted` is the viewer's own vote echoed back, never anyone else's — exactly like tracer's `myVote`.

---

## 4. Reducer behavior — every (phase, event) combination

General guards (all from tracer's playbook):
- `if (state.phase === 'over') return { state, effects: [] };` first line.
- All player-keyed maps built with `emptyPlayerMap<V>()` (null-proto). Copy-on-write via `Object.assign(emptyPlayerMap(), old, patch)`.
- Unknown/duplicate/out-of-phase actions are **silently ignored** (`return { state, effects: [] }`) — never throw. Same as tracer.
- Reducer is pure; no `Date.now`/`Math.random`. Seeded draws use a per-turn derived RNG (see §below).

### Active-player resolution (rotation fairness)

`activePlayer` for a turn = the next **present** player in `rotation` starting at `turnIndex`. On turn entry, the reducer skips seats whose owner is currently disconnected (tracked via `connected` map maintained by `playerLeft`/`playerRejoined`). If **everyone but at most one** is disconnected, the game cannot meaningfully continue — see the leave-handling edge cases below. Concretely, turn entry:

```
function enterTurn(state): advance turnIndex forward (mod rotation.length) until rotation[turnIndex] is present;
  set activePlayer; turnSeq++; phase='choose'; choice=null; prompt=null; outcome=null;
  verdicts = emptyPlayerMap(); if we wrapped past the end of rotation → round++.
  if round >= totalRounds → go to 'over' instead. Emit analytics 'turn_started'.
```

Fairness guarantees: rotation is a fixed seeded permutation at init, so order is stable and not host-biased; a player who disconnects is *skipped, not skipped-forever* — when they rejoin they take their seat in the same rotation on the next lap. Nobody gets two turns before everyone else gets one (we advance strictly forward through `rotation`, wrapping only at the end).

### Seeded, no-repeat prompt selection

At `init`: for each `key` in `{truth,dare} × allowedIntensities`, build `decks[key] = shuffle(createRng(seed + '|' + key), packEntryIdsForKey)` and `cursors[key] = 0`. Drawing a prompt at `enter prompt`:

```
key = `${choice}:${intensity}`
while cursors[key] < decks[key].length and decks[key][cursors[key]] is in usedPromptIds: cursors[key]++  // belt-and-suspenders
if cursors[key] >= decks[key].length:  // tier exhausted
    if no allowed tier of this choice has any prompt left → end game early (go 'over') with analytics 'pool_exhausted'
    else fall back to another allowed intensity of the same choice (nearest tier; see §below) 
id = decks[key][cursors[key]]; cursors[key]++; usedPromptIds.push(id)
prompt = { choice, intensity, id, text: resolve(id) }
```

Because draws come from a seed-derived shuffle and a monotonic cursor, **replay is deterministic** and **no prompt repeats within a game**. Intensity for a draw: the active player's chosen `choice` (Truth/Dare) plus the **room intensity** — by default the room plays the **highest allowed** tier (config-driven); if that tier's deck is exhausted it falls back down (`spicy→party→soft`) to the nearest allowed non-empty tier. (Per-turn intensity selection by the active player is an open question — §9.)

### Phase-by-phase event handling

#### Phase `choose`
| Event | Behavior |
|---|---|
| `action chooseType` by `activePlayer` | set `choice`; draw prompt (above); `phase='prompt'`. Effects: `analytics 'choice_made' {choice}`. |
| `action chooseType` by non-active | ignored (not your turn). |
| `action` any other kind | ignored (wrong phase). |
| `deadline` | auto-pick: `choice = seededCoin(seed,turnSeq) ? 'dare' : 'truth'` (deterministic), draw prompt, `phase='prompt'`. Effect `analytics 'choice_auto'`. |
| duplicate `chooseType` (choice already set — can't happen: phase moved) | n/a; phase already `prompt`, so ignored. |

#### Phase `prompt`
| Event | Behavior |
|---|---|
| `action declare {result:'done'}` by active | `outcome='done'`; `phase='verdict'`; reset `verdicts`. Effect `analytics 'declared' {result:'done'}`. |
| `action declare {result:'chickened'}` by active | `outcome='chickened'`; **skip verdict**, go straight to scoring as chickened (group can't overturn a self-admitted chicken — no point voting). `phase='score'`, compute `lastResult` with `verdict:'chickened'`, award `chickenedPoints`. Effect `analytics 'declared' {result:'chickened'}`. |
| `action pass` by active **and** `passesLeft[active] > 0` | `outcome='passed'`; `passesLeft[active]--`; **skip verdict**; `phase='score'`, `verdict:'passed'`, award `passPoints`. Effect `analytics 'pass_used' {left}`. |
| `action pass` by active **and** `passesLeft[active] === 0` | ignored (no passes left — client should hide the button via `canPass`, but reducer guards too). |
| `action` by non-active | ignored. |
| `deadline` | auto-fail: `outcome='chickened'`, **no pass spent**, → `score` as chickened (timed out = chickened). Effect `analytics 'prompt_timeout'`. |

> Why `declare 'done'` is the only path into `verdict`: the group only adjudicates a *claim of completion*. A self-declared chicken or a pass is unambiguous and skips straight to reveal — keeps pacing tight (no pointless vote) and matches real-life play.

#### Phase `verdict`  (only reached after `declare 'done'`)
Eligible voters = present players where `p !== activePlayer`. Let `E = eligibleVoters(state)`.
| Event | Behavior |
|---|---|
| `action verdict {vote}` by eligible voter not yet voted | record `verdicts[voter]=vote`. If **all** eligible voters have now voted → resolve verdict (below). Else stay. Effect: none broadcast (private ack, like tracer). |
| `action verdict` by `activePlayer` | ignored (can't vote on yourself). |
| `action verdict` by already-voted voter (duplicate) | ignored (first vote locked; no changing votes — keeps tally honest). |
| `action verdict` by a non-player / unknown id | ignored (tracer `includes` guard). |
| `action` other kind | ignored. |
| `deadline` | resolve verdict with whatever votes are in (abstainers simply not counted). |
| **`E` is empty** (e.g., 2-player game, the only other player disconnected at the moment of entry) | resolve immediately as **done** by default (no one to dispute the claim) → `score`. Guard this at verdict *entry*, not only on deadline, so we never sit in a verdict phase with zero possible voters. |

**Verdict resolution:**
```
votes = values(verdicts); doneCount = count 'done'; chickCount = count 'chickened'; cast = doneCount + chickCount
if cast === 0: verdict = 'done'            // nobody disputed → benefit of the doubt
else verdict = (doneCount / cast) >= config.verdictThreshold ? 'done' : 'chickened'  // ties → done (>=)
points = verdict === 'done'
   ? config.donePoints + (choice === 'dare' ? config.dareBonus : 0)
   : config.chickenedPoints
scores[active] += points
lastResult = { activePlayer:active, choice, intensity, promptText, verdict, tally:{done:doneCount,chickened:chickCount}, pointsAwarded:points }
phase = 'score'
Effect: analytics 'verdict_resolved' {verdict, done:doneCount, chickened:chickCount}
```

#### Phase `score`
| Event | Behavior |
|---|---|
| any `action` | ignored (reveal phase, no actions). |
| `deadline` | `enterTurn(...)`: advance to next present player's `choose`, or `over` if the lap finished the last round. If `over`, emit `gameOver` effect with final `scores` (tracer pattern). Otherwise emit `analytics 'turn_completed'`. **This is the interstitial-ad boundary — see §5.** |

### `playerLeft` / `playerRejoined` (any phase)

A `connected: Record<PlayerId, boolean>` map lives in state (init: all true). These events only update presence + may unblock a phase; they never reorder rotation or wipe scores.

| Event | Phase | Behavior |
|---|---|---|
| `playerLeft p` | any | `connected[p]=false`. Then: |
| ↳ | `choose`/`prompt` and `p === activePlayer` | the active player bailed mid-turn → treat as **chickened, no pass spent**: jump to `score` with `verdict:'chickened'`, `pointsAwarded:chickenedPoints`. (Don't strand the room on an absent star.) Effect `analytics 'active_left'`. |
| ↳ | `verdict` and `p === activePlayer` | resolve verdict immediately with votes-in (the claim still stands; group decides). |
| ↳ | `verdict` and `p` was an eligible voter | drop `p` from the expected set; if the *remaining* eligible voters have all voted → resolve now. If that empties `E` → resolve as 'done' default. |
| ↳ | any | `p`'s seat stays in `rotation` (greyed); a future turn for `p` is **skipped** while disconnected (see active-player resolution). Scores/passes preserved. |
| `playerRejoined p` | any | `connected[p]=true`. No phase change. `p` resumes its seat; will be active again on its next lap slot. View resync handled by shell (full `view` rebroadcast). Effect `analytics 'player_rejoined'`. |

**Important:** `players`/`rotation`/`scores`/`passesLeft` keys are *never* deleted on leave — disconnection is presence, not removal (spec §6: "seat greyed, not freed"). This keeps the roster fixed (contract: roster fixed at init), keeps replay deterministic, and lets a rejoiner reclaim score/passes.

### Edge counts

- **Exact min (2 players):** active = P1, the only eligible voter = P2. `choose→prompt→verdict` (E={P2})→`score`. If P2 is also disconnected at verdict entry, E empty → auto-'done'. With 2 players, a lap = 2 turns; `round` increments after the 2nd turn's `score`. `dareBonus` and skip economy work unchanged. Watch: verdict can't be "active votes" — active is excluded, so a 2-player verdict is a single yes/no from P2 (threshold 0.5: P2 'done' → done, P2 'chickened' → chickened, P2 abstains/leaves → done default).
- **16 players:** `rotation.length === 16`. Each lap is 16 turns; `totalRounds=3` ⇒ up to 48 turns. Verdict has up to 15 eligible voters; `votersExpected=15`, resolution by majority. Deck sizing: ensure packs supply enough entries so 48 dare-draws + 48 truth-draws don't exhaust a tier mid-game (pack authoring guidance §6: ≥ `totalRounds × maxPlayers` entries per (choice,tier) to never hit fallback at 16p/3 rounds = 48 each). If a tier *does* exhaust, fallback (§4) keeps play going; total exhaustion of a choice ends the game gracefully.

### Determinism / RNG discipline

- All randomness derives from `seed`: deck shuffles `createRng(seed + '|' + key)`; auto-pick coin `createRng(seed + '|coin|' + turnSeq)()`. No `Math.random`. Replays via `replay()` reproduce identical games (CI chaos test, spec §7/§9).
- State is JSON-serializable: only plain objects/arrays/strings/numbers/booleans/null. No `Map`/`Set`/class instances (tracer hard rule). `decks`/`cursors`/`verdicts`/`scores`/`passesLeft`/`connected` are null-proto records.

---

## 5. Scoring, rounds, and the ad slot

### Scoring

| Outcome (final `verdict`) | Base | Dare bonus | Total |
|---|---|---|---|
| `done`, choice = truth | `donePoints` (10) | — | **10** |
| `done`, choice = dare | `donePoints` (10) | `dareBonus` (5) | **15** |
| `passed` (used a pass) | `passPoints` (3) | — | **3** |
| `chickened` (declared, timed out, or verdicted-down) | `chickenedPoints` (0) | — | **0** |

Rationale: completing a **dare** is worth more than a **truth** (risk/embarrassment premium) — the only score asymmetry between the two choices, which keeps "always pick truth" from dominating. A **pass** beats chickening (you owned it instead of faking), but costs a limited resource (skip economy: `passesPerPlayer=2`). Voting is unscored (no incentive to vote strategically against the active player for points — keeps the verdict honest).

### Round / multi-round structure

- A **round** = one full lap of the rotation (everyone present is active once). `totalRounds` default **3** ⇒ short party arc (~3 turns each at 2–6 players).
- Game ends at `round >= totalRounds` (checked on lap wrap in `enterTurn`) **or** content-pool exhaustion (§4). On end: `phase='over'`, emit `gameOver` with final `scores` (tracer pattern, drives the shell's results + leaderboard screen).

### Interstitial ad slot

Platform rule: interstitial **between rounds** (spec §8.5). This game's natural ad boundary is **lap completion**, not every turn (too frequent — would hammer pacing and CPMs). Concretely:

- The **shell** owns ad display; the game signals lap boundaries via an effect so the shell can decide (frequency-capped via remote config, spec §8.5). On the `score → enterTurn` transition that **wraps the rotation** (start of a new lap) and the game is **not** ending, emit:
  ```ts
  { type: 'analytics', name: 'round_completed', props: { round: state.round } }
  ```
  This is the same event name the backbone already listens for (spec §8.6 `round_completed`) and is the shell's cue for the between-rounds interstitial. No new effect type needed.
- No ad after the **final** round — that transition emits `gameOver` instead, and the shell shows results (an end-of-game interstitial, if any, is a shell/remote-config decision, not the game's).
- Per-turn `score` reveals are **not** ad boundaries (only lap wraps are).

---

## 6. Content pack JSON schema

Versioned JSON in R2 (spec §3, ContentPack envelope `{id, version, data}`). The game's `Content` type is `data`:

```ts
// truthOrDare.ts
export interface TodPromptEntry {
  id: string;                 // stable unique id within the pack, e.g. "tod-fr-dare-party-014"
  choice: Choice;             // 'truth' | 'dare'
  intensity: Intensity;       // 'soft' | 'party' | 'spicy'
  text: string;               // the prompt shown verbatim (pre-moderated, profanity-clean)
  lang: 'fr' | 'en';          // pack is single-lang; mixed-lang packs are not supported
  minAge?: number;            // age-appropriateness hint (e.g. 13, 16, 18). spicy entries SHOULD set 18
  props?: boolean;            // true if it needs an object/prop in the room (filterable by shell later)
  tags?: string[];            // freeform: 'physical','funny','deep','couples' — for future themed packs
}

export interface TodContent {
  lang: 'fr' | 'en';
  entries: TodPromptEntry[];
}
```

`ContentPack<TodContent>` example envelope: `{ id: "tod-classic-fr", version: 3, data: { lang:"fr", entries:[...] } }`.

### Schema rules / validation (server-side, at pack load)
- Every `entries[i].lang === data.lang` (single-language pack).
- `id` unique within pack; ids are the no-repeat key.
- For each `intensity` in a pack's coverage, recommended **≥ `maxPlayers × totalRounds`** entries per `(choice, intensity)` so a 16-player/3-round game never hits fallback (§4). Enforced as a soft authoring lint, not a hard runtime error.
- `spicy` entries **must** carry `minAge: 18`. The module only ever loads tiers in `config.allowedIntensities`; **`spicy` is excluded from `DEFAULT_CONFIG` and gated behind a server feature flag + room config** (store-compliance: Apple 1.1/Google sexual-content tiers). A pack may *contain* spicy entries; whether they're ever drawn is a runtime gate, not a pack property.

### ~10 example entries (FR)

```json
{
  "id": "tod-classic-fr",
  "version": 1,
  "data": {
    "lang": "fr",
    "entries": [
      { "id": "fr-t-soft-001", "choice": "truth", "intensity": "soft", "lang": "fr", "minAge": 13, "text": "Quel est le plat que tu ne supportes vraiment pas ?" },
      { "id": "fr-t-soft-002", "choice": "truth", "intensity": "soft", "lang": "fr", "minAge": 13, "text": "Quelle est la derniere serie que tu as regardee en entier ?" },
      { "id": "fr-d-soft-001", "choice": "dare",  "intensity": "soft", "lang": "fr", "minAge": 13, "text": "Imite un animal de ton choix pendant 10 secondes.", "tags": ["funny","physical"] },
      { "id": "fr-d-soft-002", "choice": "dare",  "intensity": "soft", "lang": "fr", "minAge": 13, "text": "Parle avec un accent jusqu'a ton prochain tour.", "tags": ["funny"] },
      { "id": "fr-t-party-001","choice": "truth", "intensity": "party","lang": "fr", "minAge": 16, "text": "Quel est le truc le plus embarrassant que tu aies fait en public ?", "tags": ["deep"] },
      { "id": "fr-t-party-002","choice": "truth", "intensity": "party","lang": "fr", "minAge": 16, "text": "Qui dans cette piece enverrais-tu un message a 3h du matin ?" },
      { "id": "fr-d-party-001","choice": "dare",  "intensity": "party","lang": "fr", "minAge": 16, "text": "Envoie le dernier emoji de ton clavier a la 3e personne de ta liste de contacts.", "tags": ["physical"], "props": true },
      { "id": "fr-d-party-002","choice": "dare",  "intensity": "party","lang": "fr", "minAge": 16, "text": "Laisse la personne a ta gauche poster une story sur ton telephone.", "props": true },
      { "id": "fr-t-party-003","choice": "truth", "intensity": "party","lang": "fr", "minAge": 16, "text": "Quel mensonge as-tu deja dit a tes parents et qui a marche ?" },
      { "id": "fr-d-party-003","choice": "dare",  "intensity": "party","lang": "fr", "minAge": 16, "text": "Fais ton meilleur compliment a la personne en face de toi, sans rire.", "tags": ["funny"] }
    ]
  }
}
```

### Moderation notes — player-entered text paths

The platform's permanent rule: **all player-entered text passes the server-side profanity filter (`obscenity`) at the DO boundary before persistence or broadcast** (spec §6, §7).

- **Pack text:** *not* player-entered — content packs are pre-moderated by us at authoring time and shipped versioned in R2. The reducer treats `entry.text` as already clean. (Still, a kill-switch / pack-version pin (spec §8.4) lets us yank a bad pack remotely.)
- **Nicknames:** filtered at join by the lobby (spec §6) before any view shows them — the game never re-filters; it only ever echoes `PlayerId`s, and the client maps id→nickname from lobby state.
- **No free-text gameplay input in v1:** this game has **zero player-authored gameplay text** — every prompt comes from the pack, and verdicts are enum votes. This is a deliberate moderation-surface minimization. (A future "write your own dare" mode would route that text through the same DO filter before it enters state; flagged in §9.) Because there's no UGC gameplay text, the game inherits Apple 1.2 / Google UGC compliance from the lobby's existing filter+report+kick+block (spec §8.7) with no new surface.
- **Reporting:** a bad *pack prompt* is reported via the platform report endpoint (spec §8.7) keyed by `prompt.id` (carried in analytics + `lastResult`), so we can pull a specific entry by id in the next pack version.

---

## 7. UI screens → Bloop moodboard components

Brief — the mobile design doc owns visuals. Mapping per phase (component names are moodboard primitives: chips, timer rings, reveal cards, rosters, etc.).

| Screen / phase | Moodboard components |
|---|---|
| Lobby (pre-game) | Join chips (nickname+avatar), room-code header, QR, host "Start" CTA, intensity toggle (soft/party/[spicy if flag]) on host config |
| `choose` (active) | Big **Truth / Dare** choice chips, turn-spotlight avatar, timer ring (`chooseMs`), passes-left pip |
| `choose` (others) | "It's **<active>**'s turn — choosing…" waiting card, rotation rail (avatars, current highlighted, greyed = disconnected), timer ring |
| `prompt` (active) | Reveal card with prompt text + choice/intensity badge, **Done** / **Chickened** buttons, **Pass (n left)** secondary button, timer ring (`promptMs`) |
| `prompt` (others) | Same reveal card (read-only), "watch <active>" framing, timer ring |
| `verdict` (voters) | Claimed-outcome banner, **Did they do it?** Yes/No verdict chips, live `votesIn/votersExpected` counter, timer ring (`verdictMs`) |
| `verdict` (active) | "The room is deciding…" suspense card, can't-vote state |
| `score` | Reveal card: verdict stamp (DONE/CHICKENED/PASSED), tally bar (done vs chickened), **+points** burst, updated mini-leaderboard, "next: <nextActive>" |
| Between-rounds | Interstitial ad slot (shell-owned), then resume — triggered on lap wrap (§5) |
| `over` | Final leaderboard (ranked avatars + scores), podium reveal, "play again" CTA |

HUD present every phase: rotation rail, score pips, round `n/total`, timer ring, connection (greyed seats).

---

## 8. Engine needs beyond the current contract (conservative)

Almost everything fits the existing `GameModule<S,A,V,C>` contract. Two items:

1. **`phaseKey(state): string` — the one planned addition (already on the roadmap; this game is designed around it).** Needed so the shell can generically detect phase transitions (re-arm alarm, run the between-rounds ad check, broadcast). This game implements it as `` `${phase}:${turnSeq}` `` (§2). **Soft dependency, not a hard block:** the game already exposes `turnSeq` and `phase` in every non-terminal view, so if `phaseKey` isn't added before build, the shell can derive the identical key from the view. Recommend adding `phaseKey` to the contract as planned; this game will return it directly.

2. **Nothing else.** Specifically NOT needed:
   - No new `Effect` type for ads — the ad boundary reuses the existing `analytics`/`round_completed` effect the backbone already consumes (§5).
   - No mid-game join event — disconnection/reconnection is fully expressed via the existing `playerLeft`/`playerRejoined` events + roster-fixed-at-init (§4). Skip-disconnected rotation is reducer logic, not a contract change.
   - No timer primitives in game code — `phaseDurationMs` per phase is sufficient (§2); the shell's single-alarm multiplexer handles deadlines.
   - No content-streaming/lazy-load hook — packs are loaded whole at `init` via the existing `ContentPack<C>` arg.

**`engineNeeds` summary:** add the already-planned `phaseKey(state): string` to `GameModule` (this game returns `` `${phase}:${turnSeq}` ``); the game degrades gracefully (shell derives the key from the exposed `turnSeq`+`phase`) if the addition slips. No other contract changes.

---

## 9. Open product questions

1. **Per-turn intensity choice vs room-fixed.** Default chosen: room plays the highest **allowed** tier, fall back down on exhaustion. Alternative: let the active player pick the tier each turn (extra chip in `choose`, more agency but slower + harder to gate spicy per-action). Recommend room-fixed for v1; revisit.
2. **Spicy gating UX.** Spicy is OFF by default and behind a server flag + host config. Open: is spicy enabled per-room by the host with an age-gate confirm, or fully server-side/region-gated? Store-compliance call (Apple 1.1, Google sexual-content tiers) — needs product+legal sign-off before any spicy pack ships.
3. **Verdict honesty / griefing.** Group can vote a genuine completion as `chickened` (or vice-versa). Default: simple majority, ties→done, votes unscored. Open: should the active player get a "challenge"/re-vote, or should verdict be advisory-only (active self-reports, group reaction is cosmetic)? Affects how much the verdict "bites."
4. **Pass economy tuning.** Default 2 lifetime passes, pass = 3 pts. Open: per-round passes instead of lifetime? Should a pass be worth 0 (pure escape) to make dares scarier? Needs playtest.
5. **Player-authored prompts ("write your own dare").** Out of scope v1 (keeps moderation surface zero — §6). If added, the text routes through the DO profanity filter before entering state, and likely needs a flag + report path per-entry. Product decision on whether anonymous same-room UGC is worth the moderation cost.
6. **Min-player verdict feel at 2 players.** With 2 players the verdict is a single yes/no from the one other player. Acceptable, but is "the other person alone decides" the right feel, or should 2-player mode make verdicts advisory-only? Tie to Q3.
7. **Ad cadence.** Default: interstitial only on lap wrap (between rounds), shell-frequency-capped. Open: at 16 players a lap is long (16 turns) — is once-per-lap too infrequent for revenue, or correct for pacing? Remote-config tunable, but the default needs a product call.
8. **Game-length default.** `totalRounds: 3`. At 16 players that's 48 turns (long). Open: scale `totalRounds` down by player count (e.g. 1 lap at 12+ players) via config, so session length stays ~party-paced regardless of room size?
