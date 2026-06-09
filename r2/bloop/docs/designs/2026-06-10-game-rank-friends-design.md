# Game Design — RANK YOUR FRIENDS

**Date:** 2026-06-10
**Status:** Design (ready for module + test implementation)
**Game id:** `rank-friends`
**Author:** Game design + engine architecture
**Lineage:** Direct evolution of the `tracer` vote game (the implemented template). This doc is
written to be implementable in the tracer's exact style — null-prototype player maps, hidden state
never leaked through `view()`, effects-not-side-effects, JSON-serializable state only — against the
existing `GameModule<S, A, V, C>` contract with the one planned `phaseKey(state): string` addition.

---

## 1. Overview

**RANK YOUR FRIENDS** asks a spicy prompt ("most likely to survive a zombie apocalypse") and, instead
of a single vote, every player privately **ranks** their top-3 friends (or the full table for tiny
groups). Ballots stay hidden until everyone is in, then the reveal builds a **podium** — 3rd, then 2nd,
then 1st with suspense timing — over a Borda-weighted aggregate, so the table argues over who deserved
the crown.

It is fun at a party because ranking (vs. one vote) forces opinions about *everyone*, the weighted math
makes near-ties feel earned, and the slow 3rd→2nd→1st reveal is built-in banter fuel.

- **Players:** min **3**, max **16**. (Tracer is 2–16; ranking needs at least one rankable target
  besides yourself plus a tie-breaking third body, so we lift the floor to 3. See §9 Q1.)
- **Rounds:** default **5** prompts (capped by content-pack size, same pattern as tracer's
  `Math.min(totalRounds, prompts.length)`).

---

## 2. Phase / state machine

Three live phases plus terminal `over`, mirroring tracer's `vote | reveal | over` but with `vote`
renamed to `rank` and `reveal` split into a multi-step podium walk driven by an internal `revealStep`
counter (NOT separate phases — one `reveal` phase that re-arms its own deadline, like tracer's reveal).

| Phase    | Meaning                                              | `phaseDurationMs`         | Untimed? |
|----------|------------------------------------------------------|---------------------------|----------|
| `rank`   | Everyone privately builds their ranking ballot       | `config.rankMs` (40_000)  | timed    |
| `reveal` | Podium walk: bronze → silver → gold, with held beats | `revealStepMs` (per step) | timed    |
| `over`   | Final standings, game ended                          | `null`                    | untimed  |

### `revealStep` sub-states (inside phase `reveal`)

`reveal` is a single phase whose deadline fires repeatedly, advancing `revealStep`. This keeps the
"one timed phase re-arms itself" pattern from tracer's reveal→nextRound, but with intermediate beats.

| `revealStep` | Shows                                          | duration                          |
|--------------|------------------------------------------------|-----------------------------------|
| `0` "lockin" | "Ballots locked — counting…" suspense card     | `config.revealIntroMs` (1_500)    |
| `1` "bronze" | 3rd place name + points                        | `config.revealStepMs` (2_500)     |
| `2` "silver" | 2nd place name + points                        | `config.revealStepMs` (2_500)     |
| `3` "gold"   | 1st place name + points (crown, confetti)      | `config.revealGoldMs` (4_000)     |
| `4` "full"   | Full ordered board + per-round points scored   | `config.revealBoardMs` (5_000)    |

On the deadline at `revealStep === 4`, the reducer advances the round (or ends the game), exactly like
tracer's `reveal` deadline calling `nextRound`.

### Transitions

```
init ──> rank (round 0)
rank ──(all eligible players ranked)──> reveal (revealStep 0)          // all-acted, like tracer
rank ──(deadline)──────────────────────> reveal (revealStep 0)        // timeout, like tracer
reveal ──(deadline, step < 4)──────────> reveal (revealStep+1)         // self re-arming beats
reveal ──(deadline, step == 4, more rounds)──> rank (round+1, revealStep 0)
reveal ──(deadline, step == 4, last round)───> over  + Effect gameOver
over ──(any event)──────────────────────> over (idempotent, no-op)
```

"All eligible players ranked" = every **connected, non-left** player has a submitted ballot. Players who
left during `rank` are excluded from the all-acted check so a disconnect can't stall the phase
(detailed in §4).

### `phaseKey` scheme (the planned contract addition)

The shell cannot generically detect a phase transition (e.g. to fire an interstitial ad, or to know a
new reveal beat should animate). `phaseKey(state): string` returns a string that changes on **every**
visible step so the shell can diff it across reduces. Scheme:

```
rank   -> `rank:${round}`                       e.g. "rank:0", "rank:1"
reveal -> `reveal:${round}:${revealStepName}`   e.g. "reveal:0:bronze", "reveal:0:gold"
over   -> "over"
```

`revealStepName` ∈ `lockin|bronze|silver|gold|full`. The shell arms the ad interstitial when
`phaseKey` crosses from a `reveal:*:full` to a `rank:*` (see §5). `phaseDurationMs` is computed from
`(phase, revealStep)` so each beat gets its own deadline.

```ts
function revealStepName(step: number): RevealStepName {
  return (['lockin', 'bronze', 'silver', 'gold', 'full'] as const)[step] ?? 'full';
}

function phaseKey(state: RankState): string {
  if (state.phase === 'rank') return `rank:${state.round}`;
  if (state.phase === 'reveal') return `reveal:${state.round}:${revealStepName(state.revealStep)}`;
  return 'over';
}
```

---

## 3. TypeScript shapes

### State (hidden fields marked HIDDEN)

```ts
import type { PlayerId } from '@bloop/engine';

export interface RankConfig {
  totalRounds: number;
  rankMs: number;        // 40_000 — ranking takes longer than a single vote
  revealIntroMs: number; // 1_500  — "counting…" beat
  revealStepMs: number;  // 2_500  — bronze & silver beats
  revealGoldMs: number;  // 4_000  — gold beat (longer, suspense payoff)
  revealBoardMs: number; // 5_000  — full board beat
  rankSize: number;      // 3 — top-N a player must rank; clamped to eligibleCount each round
  fullRankThreshold: number; // 4 — if eligibleCount <= this, players rank EVERYONE
}

export const DEFAULT_CONFIG: RankConfig = {
  totalRounds: 5,
  rankMs: 40_000,
  revealIntroMs: 1_500,
  revealStepMs: 2_500,
  revealGoldMs: 4_000,
  revealBoardMs: 5_000,
  rankSize: 3,
  fullRankThreshold: 4,
};

export type RankPhase = 'rank' | 'reveal' | 'over';
export type RevealStepName = 'lockin' | 'bronze' | 'silver' | 'gold' | 'full';

/** A single player's ordered ballot: ballot[0] is their #1 pick, etc. Length 1..rankN. */
export type Ballot = PlayerId[];

export interface RankState {
  config: RankConfig;
  players: PlayerId[];          // roster fixed at init (engine guarantee)
  prompts: string[];            // shuffled at init, indexed by round
  round: number;
  phase: RankPhase;
  revealStep: number;           // 0..4, only meaningful while phase === 'reveal'

  /**
   * HIDDEN: never exposed through view() while phase === 'rank'.
   * Player-keyed, null-prototype map. ballots[p] is p's submitted ordered ballot.
   * Absence of a key == that player has not submitted. Promoted into reveal views only.
   */
  ballots: Record<PlayerId, Ballot>;

  /**
   * HIDDEN-while-ranking, frozen at reveal: the per-target aggregated points for the
   * CURRENT round, computed once when entering reveal so every beat reads the same numbers.
   * Empty {} during rank.
   */
  roundPoints: Record<PlayerId, number>;

  /**
   * Frozen ordered podium for the current round, computed at reveal entry.
   * Deterministic tie-broken order (see §aggregation). Index 0 = winner.
   */
  podium: PlayerId[];

  /** Players who left and have not rejoined; excluded from all-acted + ineligible as targets. */
  left: Record<PlayerId, true>; // HIDDEN-ish: surfaced only as boolean presence, never as a "vote"

  scores: Record<PlayerId, number>; // cumulative across rounds (public)
}
```

Everything is JSON-serializable (no `Map`, no `Set`, no class instances). `ballots`, `roundPoints`,
`left`, `scores` are built with the tracer `emptyPlayerMap()` null-prototype helper.

### Action union

A player submits one complete ordered ballot at a time (atomic; no per-slot streaming — simpler to
validate, redact, and reason about; matches tracer's single-action `vote`). Re-submitting overwrites.

```ts
export type RankAction = { kind: 'rank'; order: PlayerId[] };
```

Zod (in `actions.ts`, validated at the DO boundary before `reduce`):

```ts
import { z } from 'zod';
export const rankActionSchema = z.object({
  kind: z.literal('rank'),
  order: z.array(z.string().min(1).max(64)).min(1).max(16),
});
// Semantic validity (no dupes, all in-roster, length == required N, self excluded)
// is enforced inside reduce(), NOT here — reduce owns game rules. The schema only
// guards shape/size at the boundary.
```

### View union — per phase, with explicit redaction

`view(state, viewer)` must return a non-leaking projection for **any** string viewer, including
spectators and unknown ids (engine contract requirement). The redaction rules below are stated per
viewer-kind: **active** (a roster player whose `viewer` is in `players` and not in `left`),
**other** (roster player, same data — there is no asymmetric secret here; every player ranks),
**eliminated/spectator** (non-roster, or a `left` player rejoined as observer), **unknown** (any
other string).

> Key redaction invariant: **no other player's `order` is ever present in any view while
> `phase === 'rank'`.** Only the viewer's own ballot (`myOrder`) is echoed back, and only to the
> ballot's owner. Aggregated `roundPoints`/`podium` exist only from `reveal` onward.

```ts
export type RankView =
  | {
      // ── PHASE: rank ──────────────────────────────────────────────
      phase: 'rank';
      round: number;
      totalRounds: number;
      prompt: string;
      rankN: number;                       // how many slots this round (3 or eligibleCount)
      eligibleTargets: PlayerId[];          // roster minus self minus left[] — who you may rank
      submitted: Record<PlayerId, boolean>; // public "is this player done?" — NOT their ballot
      myOrder: PlayerId[] | null;           // OWNER-ONLY echo of viewer's own ballot, else null
      scores: Record<PlayerId, number>;     // cumulative, public
    }
  | {
      // ── PHASE: reveal ────────────────────────────────────────────
      phase: 'reveal';
      round: number;
      totalRounds: number;
      prompt: string;
      step: RevealStepName;                 // lockin|bronze|silver|gold|full — drives animation
      podium: PlayerId[];                   // full frozen order, but UI only renders up to `step`
      revealedCount: number;                // how many podium entries the UI may show this beat
      roundPoints: Record<PlayerId, number>;// per-target points THIS round (public at reveal)
      scores: Record<PlayerId, number>;     // cumulative AFTER this round applied
    }
  | {
      // ── PHASE: over ──────────────────────────────────────────────
      phase: 'over';
      finalOrder: PlayerId[];               // players sorted by score desc, deterministic tie-break
      scores: Record<PlayerId, number>;
    };
```

**Redaction matrix:**

| Viewer kind            | `rank` phase                                                                 | `reveal` phase                               | `over` phase            |
|------------------------|------------------------------------------------------------------------------|----------------------------------------------|-------------------------|
| Active player (owner)  | sees `myOrder` = own ballot; `submitted` booleans; never anyone else's order | full reveal data for current `step`          | full final standings    |
| Other roster player    | `myOrder = null` if not yet submitted (their own only); never others' orders | identical reveal data (no per-player secrets)| identical final         |
| Eliminated / spectator | `myOrder = null` always; sees prompt + `submitted` booleans + scores         | identical reveal data (spectator-safe)       | identical final         |
| Unknown viewer         | same as spectator: `myOrder = null`, no ballots, no hidden order ever        | same as spectator                            | same as spectator       |

Because `myOrder` is computed as `state.ballots[viewer] ?? null`, a non-owner/unknown viewer
structurally cannot receive a foreign ballot — same mechanism as tracer's `myVote: state.votes[viewer]`.

---

## 4. Reducer behavior — every (phase, event) combination

Conventions inherited from tracer: `if (state.phase === 'over') return { state, effects: [] }` first;
unknown/invalid actions are **silent no-ops** (`return { state, effects: [] }`), never throws; all
player maps rebuilt with `Object.assign(emptyPlayerMap(), ...)`.

### Helper: who counts as "eligible to act" this round

```ts
function activePlayers(state: RankState): PlayerId[] {
  return state.players.filter((p) => !state.left[p]);
}
function eligibleTargets(state: RankState, viewer: PlayerId): PlayerId[] {
  return state.players.filter((p) => p !== viewer && !state.left[p]);
}
function rankNFor(state: RankState): number {
  const eligibleCount = activePlayers(state).length - 1; // exclude self (any single self)
  // small group: rank everyone; otherwise top rankSize, clamped to available targets
  if (eligibleCount <= state.config.fullRankThreshold) return Math.max(1, eligibleCount);
  return Math.min(state.config.rankSize, eligibleCount);
}
```

`rankN` is computed per-viewer at view time but, for the all-acted check, we require each player's
ballot length to equal `rankNFor(state)` evaluated against the *current* eligible set.

### (`rank`, `action` kind `rank`)

Validate, in order — any failure is a silent no-op:
1. `playerId ∈ players` and `!left[playerId]`.
2. `action.order` has **no duplicates**.
3. every id in `order` is in `eligibleTargets(state, playerId)` (in-roster, not self, not left).
4. `order.length === rankNFor(state)` (exact top-N; for small groups, exactly everyone).

On success: write `ballots[playerId] = [...order]` (overwrite allowed — re-rank before lock).
Then, if **every** player in `activePlayers(state)` has a valid ballot (`ballots[p] !== undefined`),
transition to reveal via `enterReveal(next)`. Otherwise stay in `rank`.

```ts
// all-acted check (mirrors tracer's state.players.every(p => votes[p] !== undefined),
// but over ACTIVE players so a disconnect cannot deadlock):
if (activePlayers(next).every((p) => next.ballots[p] !== undefined)) return enterReveal(next);
```

**Duplicate / re-submit:** a player re-submitting a valid new ballot overwrites the old one (no double
counting — ballots are keyed by player, exactly like tracer votes). A re-submit that's invalid is a
no-op and leaves the prior ballot intact.

### (`rank`, `deadline`)

Lock immediately: call `enterReveal(state)`. Players with no ballot (or an under-length ballot — none
exist because we only ever store valid full ballots) simply contributed nothing. If **zero** ballots
were cast (everyone idle/left), `enterReveal` produces an empty podium → reveal shows "No ranks cast"
and awards no points (guarded like tracer's `if (max > 0)`).

### `enterReveal` (pure, computes & freezes round results)

```ts
function enterReveal(state: RankState): ReduceResult<RankState> {
  const roundPoints = aggregate(state);          // §aggregation
  const podium = orderPodium(state, roundPoints); // deterministic tie-broken
  const scores = Object.assign(emptyPlayerMap<number>(), state.scores);
  for (const p of state.players) scores[p] = (scores[p] ?? 0) + (roundPoints[p] ?? 0);
  return {
    state: { ...state, phase: 'reveal', revealStep: 0, roundPoints, podium, scores },
    effects: [{ type: 'analytics', name: 'round_revealed', props: { round: state.round } }],
  };
}
```

Scores are applied **once** here (not per beat), so reveal beats are pure animation over frozen data.

### (`reveal`, `deadline`)

```ts
if (state.revealStep < 4) {
  return { state: { ...state, revealStep: state.revealStep + 1 }, effects: [] };
}
return nextRound(state); // step === 4: advance round or end
```

### `nextRound` (identical shape to tracer)

```ts
function nextRound(state: RankState): ReduceResult<RankState> {
  const round = state.round + 1;
  if (round >= state.config.totalRounds) {
    const over = { ...state, phase: 'over' as const };
    return { state: over, effects: [{ type: 'gameOver', scores: { ...over.scores } }] };
  }
  return {
    state: {
      ...state, round, phase: 'rank', revealStep: 0,
      ballots: emptyPlayerMap<PlayerId[]>(),
      roundPoints: emptyPlayerMap<number>(), podium: [],
    },
    effects: [],
  };
}
```

### (`*`, `action`) in wrong phase

Action during `reveal` or `over` → silent no-op (only `rank` accepts `rank` actions).

### (`*`, `playerLeft`)

Set `left[playerId] = true`. Then:
- **In `rank`:** the player is removed from `activePlayers`. **Re-evaluate the all-acted check** —
  if the remaining active players have all submitted, transition to reveal immediately (a leaver must
  not stall the phase). Note: a leaver's already-submitted ballot is **kept** in `ballots` and still
  counts in aggregation if reveal is reached — they voted before leaving; their ranking opinion stands.
  Their *own* eligibility as a **target** is removed for any ballot submitted *after* they left
  (enforced by `eligibleTargets`), but ballots already locked in are not retroactively edited.
- **In `reveal` / `over`:** record `left` only; no recomputation (podium is frozen).
- Host/permissions migration is shell-level (spec §6), not this reducer's concern.

```ts
if (event.type === 'playerLeft') {
  if (state.left[event.playerId]) return { state, effects: [] };
  const left = Object.assign(emptyPlayerMap<true>(), state.left, { [event.playerId]: true });
  const next = { ...state, left };
  if (state.phase === 'rank' && activePlayers(next).length > 0 &&
      activePlayers(next).every((p) => next.ballots[p] !== undefined)) {
    return enterReveal(next);
  }
  return { state: next, effects: [] };
}
```

Edge: if `activePlayers(next).length === 0` (everyone left), stay in `rank` and wait for the deadline
rather than entering reveal with nobody — the deadline path then resolves an empty round. (Shell will
typically TTL-janitor an empty room anyway.)

### (`*`, `playerRejoined`)

Clear `left[playerId]` (delete the key by rebuilding the map without it). Their seat is reclaimed; the
shell resends a fresh `view`. If they rejoin **during `rank`** and had previously submitted, their
ballot is still in `ballots` and remains valid (we do not force a re-rank). If they rejoin during
`rank` without a ballot, they may now submit (their eligibility as a target also returns for future
ballots). Rejoining during `reveal`/`over` is presence-only.

```ts
if (event.type === 'playerRejoined') {
  if (!state.left[event.playerId]) return { state, effects: [] };
  const left = emptyPlayerMap<true>();
  for (const p of Object.keys(state.left)) if (p !== event.playerId) left[p] = true;
  return { state: { ...state, left }, effects: [] };
}
```

### Edge counts

- **Exact minimum (3 players):** `rankNFor` = `eligibleCount (2) <= fullRankThreshold (4)` ⇒ rank
  everyone ⇒ each player submits an ordered ballot of length **2**. Borda weights for N=2 are `[2,1]`.
  Podium of up to 2 named places + the unranked third; gold/silver beats run, bronze beat shows
  "—" gracefully (UI: only render `revealedCount` ≤ podium length).
- **4 players:** `eligibleCount = 3 <= 4` ⇒ full rank, ballot length 3, weights `[3,2,1]`.
- **5 players:** `eligibleCount = 4 == fullRankThreshold` ⇒ full rank, length 4. **6+ players:**
  `eligibleCount ≥ 5 > 4` ⇒ top-3 only, ballot length **3**, weights `[3,2,1]`.
- **16 players:** ballot length 3 (top-3). `eligibleTargets` lists 15. All player maps null-proto;
  no per-player N blow-up because ballots are bounded at 3 for large tables. Aggregation is O(players).

---

## 5. Scoring, multi-round structure, ad slot

### Aggregation math (weighted Borda)

Each ballot awards descending points to the players it ranks. For a ballot of length `L`, position `i`
(0-based) awards `L - i` points. So with top-3 (`L=3`): #1 → 3 pts, #2 → 2 pts, #3 → 1 pt; unranked → 0.
For full-rank small groups the same `L - i` formula applies with `L = eligibleCount`.

> Design choice (decisive): the weight base is the **ballot length L**, not a fixed `rankSize`. This
> keeps small-group full-rank and large-group top-3 on one formula and means a #1 pick is always worth
> exactly "one more than #2", which reads cleanly in the reveal ("+3 for first-place votes").

```ts
function aggregate(state: RankState): Record<PlayerId, number> {
  const pts = emptyPlayerMap<number>();
  for (const p of state.players) pts[p] = 0;
  for (const ballot of Object.values(state.ballots)) {
    const L = ballot.length;
    for (let i = 0; i < L; i++) {
      const target = ballot[i]!;
      // defensive: target may have left after submitting; we still count their points
      pts[target] = (pts[target] ?? 0) + (L - i);
    }
  }
  return pts;
}
```

`roundPoints` becomes each player's per-round earned points; `scores[p] += roundPoints[p]` accumulates
across rounds. **A player earns the points others assign to them** (you win by being ranked highly by
the table), which is the social hook.

### Tie handling

Two layers:

1. **Display/podium order** must be deterministic for the reveal walk. `orderPodium` sorts by
   `(roundPoints desc)`, then breaks ties by a **stable, seed-independent** rule: ascending by the
   player's index in the fixed `state.players` roster (which was itself seeded-shuffled at init, so
   it's already "random but deterministic"). This guarantees identical podium order on every
   rehydration/replay — critical for the event-sourced shell (spec §7).

   ```ts
   function orderPodium(state: RankState, pts: Record<PlayerId, number>): PlayerId[] {
     const idx = new Map(state.players.map((p, i) => [p, i]));
     return state.players
       .filter((p) => (pts[p] ?? 0) > 0)        // only players who scored appear on the podium
       .sort((a, b) => (pts[b]! - pts[a]!) || (idx.get(a)! - idx.get(b)!));
   }
   ```

2. **Score award on ties:** ties are **not** merged — tied players keep their (equal) points; both
   simply have the same `roundPoints`. The podium will show them in roster-tiebreak order; the UI may
   render an "=" badge when adjacent podium entries have equal points (cosmetic; see §7). There is no
   "everyone tied at top gets a bonus" rule (kept simple, unlike tracer which awards +1 to all
   co-leaders — here points already encode magnitude, so the raw Borda total is the score).

`finalOrder` (phase `over`) uses the same comparator on cumulative `scores`.

### Multi-round structure & ad slot

```
round 0: rank ──> reveal(lockin→bronze→silver→gold→full)
            └─[INTERSTITIAL AD SLOT]─┐
round 1: rank ──> reveal ...         │  ad fires on phaseKey transition
   ...                               │  reveal:r:full  ──►  rank:(r+1)
round 4 (last): rank ──> reveal ──> over (gameOver)
```

The interstitial **falls between rounds**, after the full-board beat and before the next `rank` — i.e.
on the shell-observed `phaseKey` transition from `reveal:${r}:full` → `rank:${r+1}`. The reducer emits
no ad effect itself (ads are 100% client-side per spec §3); the shell detects the transition via
`phaseKey` diff and plays the AdMob interstitial subject to remote-config frequency caps. **No ad after
the final round** (transition is to `over`, not `rank`), so the last reveal flows straight into final
standings. This matches spec §8's "interstitial between rounds" and §6's atomic-reveal-then-advance.

---

## 6. Content pack

Reuses the tracer prompt-pack shape so packs are interchangeable in format (a `rank-friends` pack is a
superset; a tracer pack can be consumed directly because only `prompts: string[]` is required).

### JSON schema (R2, versioned — matches `ContentPack<C>`)

```ts
// Content type C for this module:
export interface RankContent {
  prompts: string[];           // required; the only field tracer needs too
  locale?: string;             // 'fr' | 'en' — for UI hinting / pack selection (optional)
  tone?: 'classic' | 'spicy';  // optional content rating tag for catalog filtering
}
```

```jsonc
// R2 object: content/rank-friends/fr-classic.v3.json
{
  "id": "rank-friends-fr-classic",
  "version": 3,                       // ContentPack.version — bumped on edit, never mutated in place
  "data": {
    "locale": "fr",
    "tone": "classic",
    "prompts": [
      "le plus susceptible de survivre à une apocalypse zombie",
      "le plus susceptible de devenir riche avant 30 ans",
      "celui qui répondrait en premier à un message à 3h du matin",
      "le pire en cas d'urgence",
      "le plus susceptible de devenir célèbre",
      "celui qui mangerait le dernier morceau de pizza sans demander",
      "le plus susceptible de partir vivre à l'étranger",
      "celui à qui on confierait le code de sa carte bancaire",
      "le plus susceptible d'oublier l'anniversaire de quelqu'un",
      "celui qui ferait le meilleur président"
    ]
  }
}
```

EN example (`content/rank-friends/en-classic.v1.json`, `data.locale: "en"`): "most likely to survive a
zombie apocalypse", "most likely to be famous", "first to reply to a 3am text", "worst in an
emergency", "most likely to get rich young", "would eat the last slice without asking", "most likely to
move abroad", "most likely to forget your birthday", "best in a crisis", "most likely to become a
politician".

`init` shuffles `prompts` with `shuffle(createRng(seed), prompts)` and caps
`totalRounds = Math.min(DEFAULT_CONFIG.totalRounds, prompts.length)` — verbatim tracer pattern.

### Moderation notes (player-entered text paths)

- **Prompts are pack-authored, not player-entered** → moderated at content-authoring time, not
  runtime. No live filter needed on prompts.
- **The only player-entered text in this game is the nickname** (set at join, spec §6), which is
  already filtered server-side at the DO boundary by `obscenity` before any other phone sees it. This
  game introduces **no free-text input** — ballots are ordered lists of existing `PlayerId`s, so there
  is no new UGC surface and no new moderation path. (This is a deliberate safety win vs. prompt-writing
  party games.)
- Packs ship versioned; a kill switch in KV can disable a `tone: 'spicy'` pack region-wide without a
  deploy (spec §3/§4 catalog flags). The `report` endpoint + host-kick (spec §8) cover the only
  remaining UGC vector (an offensive nickname), unchanged by this game.

---

## 7. UI screens → Bloop moodboard components

Visual detail is owned by the mobile design doc; this is the screen↔component map only.

| Screen / phase            | Bloop components (moodboard pg.7 + pg.1)                                            |
|---------------------------|-------------------------------------------------------------------------------------|
| Lobby (pre-start)         | "Join Game" primary button, **Join chips** (player avatars + "Online" status), Mode Badge ("DARE MODE"-style) showing round count |
| `rank` — prompt header    | Prompt card in **Comic Doodle / speech-bubble** style ("Let's Bloop!" treatment); **Progress Bar** XP-style for round N/total; phase **Timer** ring |
| `rank` — ballot builder   | Drag-to-order list of **Player Chips** (avatar + nickname) into numbered slots 1·2·3; "Lock in" Primary Button; live **submitted** ticks on others' chips (no ballot shown) |
| `rank` — waiting          | "Waiting for friends…" with **Join chips** greying as `submitted[p]` flips true |
| `reveal:lockin`           | Suspense card "Counting the votes…" with **Confetti/Grain** texture, shuffle icon |
| `reveal:bronze/silver/gold` | **Reveal Cards** flipping one at a time; Trophy/Crown/Star icons (icon language pg.2); confetti **Pop-in** motion on gold; points counter ("+3") |
| `reveal:full`             | Full **ranked board** (podium + remainder), per-round points, cumulative scores chips |
| Interstitial (between rounds) | AdMob full-screen (shell-owned, not a Bloop component) |
| `over`                    | Final standings podium, **Trophy** hero, "Play again" Primary Button, share/"Invite Friends" secondary |

Timers use the phase **Timer** ring fed by `deadlineAt` from the `view` server message; the reveal
beat animations are driven purely by `phaseKey` changes + `view.step`/`revealedCount`.

---

## 8. engineNeeds (beyond the current contract)

Conservative — almost everything fits the existing `GameModule<S,A,V,C>` contract. One addition, one
confirmation:

1. **`phaseKey(state): string` (the already-planned addition).** Required so the shell can (a) fire the
   interstitial on the `reveal:*:full → rank:*` transition and (b) know each reveal beat is a distinct
   step to animate. Without it the shell cannot distinguish a within-`reveal` beat advance from a real
   phase change. This is the single contract change this game depends on, and it's already on the
   roadmap. Everything else (the suspenseful multi-beat reveal) is expressed **within** the existing
   contract by re-arming `phaseDurationMs` per `revealStep` — no new event types, no timer API.

2. **No new event types needed.** The 4 existing events (`action`/`deadline`/`playerLeft`/
   `playerRejoined`) cover all transitions. The self-re-arming reveal relies only on `deadline` +
   `phaseDurationMs` being a pure function of `(phase, revealStep)`.

3. **(Confirmation, not a change):** the shell already promotes hidden state into views in one atomic
   broadcast on phase transition (spec §6) — this game's "ballots hidden until reveal" depends on that
   existing behavior, not a new capability.

Everything else (Borda aggregation, tie-break, podium freeze, multi-round, ad slot) lives entirely in
pure reducer/view code, unit-testable with plain Vitest exactly like tracer.

---

## 9. Open product questions

1. **Min players = 3 vs 2.** With 2 players each can only rank the one other person, so every round is a
   trivial mutual 1st-place and the "podium" is degenerate. We set **min 3**. Confirm we don't want a
   special 2-player "head-to-head" variant instead of excluding 2-player rooms from this game's catalog
   eligibility.
2. **Self-ranking.** Default: **you cannot rank yourself** (excluded from `eligibleTargets`), and you
   *can* receive points from others. Alternative considered: allow self-ranking for comedic "I'm the
   main character" energy. Decision needed; default is the cleaner/fairer rule.
3. **`rankSize = 3` vs adaptive deeper ranks.** For 6–16 players we cap at top-3. Alternative: top-5 for
   big tables (more granular, slower input). Default keeps input fast for party pacing; confirm.
4. **Tie cosmetics.** Should adjacent equal-point podium places show a shared rank ("=2nd") or always
   force a strict order via the roster tiebreak (current default, but a visible "=" badge is allowed)?
   This is purely presentational; reducer is unaffected.
5. **Reveal pacing knobs.** Gold beat = 4s, board = 5s — tune against playtest "banter window" feel; do
   we want a host-skippable reveal (a `skipReveal` host action) for impatient tables? Out of scope for
   v1; would be an additive action variant.
6. **Points framing in copy.** Do we surface raw Borda points ("Léa: 8 pts") or a friendlier "X people
   put you top-3"? The state carries raw points; copy can derive either. Product/UX call.
7. **Empty/abandoned round.** If everyone times out with no ballots, we currently show "No ranks cast"
   and award nothing, then advance. Confirm that's preferred over re-prompting the same question.
