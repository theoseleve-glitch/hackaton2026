# Meta-01 — Session & Progression (the "Night" meta-loop) — FINAL design

| | |
|---|---|
| **Domain** | session-progression (cross-game shell meta-loop) |
| **Status** | **DECIDED** — finished spec, ready for implementation planning |
| **Owner** | Lead game designer (meta/shell) |
| **Scope** | The whole between-and-around-games loop: lobby → pick game → play → reveal → between-games interstitial → rematch / pick next / end-of-night summary; placement-based session XP; the "Night" arc + end-of-night Oracle/superlatives/group-stats screen; streak/combo juice; room-scoped anonymous group identity (TTL-wiped); mid-session game switching; host-vs-player split. |
| **Grounds in** | `2026-06-10-cross-game-synthesis.md` §1.7 (placement-XP rule); `2026-06-10-server-shell-design.md` (phaseKey `→over`/`→scoreboard:*` ad trigger, roster/TTL/anonymity, single-alarm); `2026-06-10-mobile-design-system.md` (Home/lobby/results/interstitial screens); `2026-06-12-content-voice-guide.md` (deadpan/ironic superlative register); the 18 shipped games across 10 archetype modules (`packages/games/*`) + 16 final game configs (`docs/designs/final/games/*`). |

This document owns the **shell-side meta-loop only**. It changes **no** `GameModule`, **no** engine contract, **no** reducer. Everything here is realized in the RoomDO meta-layer (server) and the app-shell game-container (client). It uses exactly the seams the server-shell and mobile-design docs already drew: `phaseKey`, `gameOver.scores`, `RoomMeta`, the single-alarm mux, and the client game registry.

---

## Decisions (the short list)

1. **Session XP is placement-based, never raw points.** Each game keeps its internal scale; the shell maps `gameOver.scores` → a per-match **placement vector** (1st, 2nd, …, with dense-rank ties) and awards XP off placement using one fixed table (§3). A perform-judge "puppet" win (100s of internal points) and a tracer win (~7 internal points) both yield the **same** 1st-place XP.
2. **The session unit is the "Night."** A Night = one room's life: a connected sequence of matches by the same room-scoped anonymous group, capped at **45 min idle TTL** (server-shell §5.4) and a soft **8-match** arc with explicit "wrap up the night?" nudges (§5). The Night, not the match, is the thing players remember.
3. **The loop is a fixed state machine** owned by `RoomMeta.status`: `lobby → playing → roundOver → (rematch | nextGame | summary) → ended` (§2). The shell drives every transition; the only game-authored signal it consumes is `gameOver` + the `phaseKey` crossing into a terminal/scoreboard key.
4. **The between-games interstitial fires client-side off the `phaseKey` transition to `over` (and only there), frequency-capped.** Never a reducer effect. `scoreboard:*` mid-match keys are **not** ad triggers — only the terminal `over` is (§2.4, server-shell §4.3, brand book "no ads during gameplay").
5. **Group identity is room-scoped, anonymous-forever, and TTL-wiped.** The "group" is just the room roster (`playerId`s minted server-side, nicknames/avatars device-local). Session XP, streaks, badges, and the Night log live **only** in DO SQLite and die with the room. Nothing is written to any cross-room/cross-session profile, ever (§7).
6. **Streaks are session-scoped, additive juice, and placement-derived — never points that re-enter a reducer.** A "podium streak" (consecutive top-half placements) and a "winning streak" (consecutive 1st) are shell-computed from the placement vector each match. They drive XP multipliers and celebration juice only (§6).
7. **End-of-night is a built-in screen: "Oracle of the Night."** It crowns the night's overall placement leader, hands out **superlatives** computed from cross-game shell stats (most wins, biggest comeback, most last-places, fastest finger, most-predicted, etc.), and shows group stats (matches played, total laughs/votes, longest streak). Superlative copy follows the voice guide's deadpan-ironic register (§8).
8. **Host owns flow control; players own their own taps.** Host picks the next game, starts matches, triggers rematch/next/end-night, and can kick (capability-gated). Players see XP, streaks, placements, and the shared Night log. The host's device is **not** authoritative — the RoomDO is; host is a roster flag (server-shell §3.5) (§9).
9. **Mid-session game switching is first-class and free.** Returning to lobby between matches is the default; the roster, group identity, session XP, streaks and Night log all **persist across the game switch** because they live in `RoomMeta`/session tables, not in any game's `State` (§2, §10).
10. **The shell never needs to understand any game's rules to run the meta-loop.** It needs exactly four things from a match: the final `scores` map (placement), the roster at `init` (who placed), the terminal `phaseKey`, and a small per-game **meta-manifest** (display name, "higher-is-better" flag — always true here, and which superlative signals it can emit). Everything else is generic (§3, §11).

---

## 1. The Night — what a session *is*

A **Night** is a single room's whole life. It is the only session concept; there is no account, no "career," no persistence beyond the room (§7). Within one Night the same anonymous group plays a **sequence of matches** (a "match" = one full game instance from `init` to `over`), interleaved with lobby pauses, ad interstitials, and a closing summary.

```
NIGHT (one room, ≤45 min idle TTL, soft 8-match arc)
 ├─ Match 1   (game A)  → placement → XP + streak update → interstitial
 ├─ Match 2   (game A, rematch  OR  game B, switched)
 ├─ …
 ├─ Match N
 └─ Oracle of the Night  (summary: leader, superlatives, group stats)
```

**Why "Night" and not "match" or "career":**
- *Match* is too small — the memorable unit at a party is "that whole evening," the arc of comebacks and running jokes across games. A per-match-only design throws away the cross-game story that the placement-XP system exists to tell.
- *Career* is impossible and unwanted — anonymous-forever + room-SQLite-TTL-wiped (platform invariant). There is nothing to carry between rooms, and that is a feature (zero accounts, zero data, instant play).

So the Night is the largest persistence horizon that exists, and the shell invests all its meta juice there: session XP, streaks, the running leaderboard, and the end-of-night Oracle.

**Night arc shape (concrete):**

| Beat | Matches | Shell behavior |
|---|---|---|
| Warmup | 1–2 | Full celebration on every reveal; XP bar prominent; "first blood" badge on match 1's winner. |
| Peak | 3–6 | Streaks live; running Night leaderboard shown on every interstitial; "comeback" / "on fire" callouts. |
| Wind-down nudge | after match 6 | Between-games screen adds a soft **"Last one? / Encore une ?"** prompt (host-dismissable; never forces an end). |
| Wrap | after match 8 (soft cap) or host taps "End night" or 45-min TTL approaches | Route to **Oracle of the Night** summary (§8), then `ended`. |

The 8-match soft cap is a *nudge*, not a wall — a hot group can keep going (the cap re-arms the nudge every 2 further matches). The hard end is the 45-min idle TTL (server-shell §5.4), which, if it fires mid-Night, still routes through the summary screen if the room is non-empty before wiping.

---

## 2. The meta-loop state machine (shell-owned)

The loop is driven entirely by `RoomMeta.status` (server-shell §4.5) plus a small set of session tables this doc adds (§11). The game module is a black box that the shell starts, observes via `phaseKey`/`gameOver`, and ends.

### 2.1 States and transitions

```
                 startGame(gameId)            phaseKey→'over' + gameOver
   ┌────────┐  ───────────────────▶ ┌──────────┐ ──────────────────────▶ ┌────────────┐
   │ lobby  │                       │ playing  │                          │ roundOver  │
   └────────┘ ◀───────────────────  └──────────┘                          └────────────┘
        ▲   nextGame / rematch  │                                            │   │   │
        │                       │                                            │   │   │
        │   (back to lobby)  ◀──┴── rematch(sameGame) ───────────────────────┘   │   │
        │                                                                        │   │
        │   nextGame(pickNew) ──────────────────────────────────────────────────┘   │
        │                                                                            │
        └──────────────────── endNight  ────────────────────────────────────────────┘
                                                          │
                                                          ▼
                                                   ┌────────────┐   (TTL or host close)   ┌────────┐
                                                   │  summary   │ ───────────────────────▶│ ended  │
                                                   └────────────┘                         └────────┘
```

| From | Trigger (who) | To | Shell actions |
|---|---|---|---|
| `lobby` | `startGame{gameId}` (host) | `playing` | Validate roster size ∈ `[module.minPlayers, module.maxPlayers]`; freeze roster; mint match seed; resolve content pack by locale; `init`; record `matchIndex`. |
| `playing` | `phaseKey(after) === 'over'` **and** a `gameOver` effect fired | `roundOver` | Persist `gameOver.scores`; compute **placement vector** (§3.1); award **session XP** (§3.2); update **streaks** (§6); append a **Night-log entry** (§11.3); set `lastActivityAt`. The `view` broadcast carries the terminal view + `deadlineAt:null`; **client fires the interstitial** off the `phaseKey→over` edge (§2.4). |
| `roundOver` | `rematch` (host) | `playing` | Same `gameId`, **new seed**, roster re-frozen from currently-connected players (§10), `matchIndex+1`. |
| `roundOver` | `nextGame{gameId}` (host) | `lobby` then `playing` | Return to lobby for the picker (or skip straight to `playing` if host picks inline). Group identity / XP / streaks / Night log **persist**. |
| `roundOver` | `endNight` (host) **or** post-cap nudge accepted **or** TTL near | `summary` | Compute Oracle + superlatives + group stats from session tables (§8). |
| `summary` | host "leave" / everyone gone / TTL | `ended` | Final broadcast; then DO TTL janitor wipes storage (server-shell §5.4) — sockets closed, alarm deleted, `deleteAll()`. |

### 2.2 The only signals the shell consumes from a match

1. **`gameOver.scores`** (cloned map; cross-synthesis §1.7 mandates the clone) → placement.
2. **roster frozen at `init`** (server-shell `RoomMeta.roster`) → who is eligible to place.
3. **terminal `phaseKey === 'over'`** → "match ended, run the meta-loop." (`scoreboard:*` keys are **mid-match** and are NOT meta-loop triggers — §2.4.)
4. **the per-game meta-manifest** (§11.1) → display name + which superlative signals this game can emit.

No reducer, no view internals, no game-specific scoring math ever enters the meta-layer. This is what makes the loop generic across all 18 games and every future one.

### 2.3 Placement is computed once, server-side, at `roundOver`

The placement vector and XP award are computed in the **same DO turn** as the `gameOver`, persisted before broadcast (server-shell "persist before broadcast"), and are therefore deterministic and replay-safe. They are **not** game effects and never re-enter any `reduce`. (This sidesteps the adversarial-review C1/C2 concerns entirely — the meta-layer writes session tables, not game `State`, and uses no null-proto-bearing game maps as keys beyond reading `scores`.)

### 2.4 Ad-trigger discipline (locked, restated for this domain)

- The **between-games interstitial** is the **only** ad, and it fires **client-side** when the client observes the `phaseKey` transition into the terminal `over` key (server-shell §4.3/§4.5; brand book "interstitial BETWEEN games, skippable after 5s; NO ads during gameplay").
- Mid-match `scoreboard:*` phase keys (perform-judge, spotlight-guess emit these) are **gameplay**, not game boundaries → **no ad**. The shell's ad gate keys strictly on `=== 'over'`.
- Frequency cap (remote-config from `/config`): **at most one interstitial per match boundary, and never two interstitials within 90s**, and **never on the match-1 → match-2 boundary** of a fresh Night (let the group warm up first). Rewarded-video (spicy-pack unlock) and the £1.99 night-pass are separate, opt-in, and out of the forced-flow (brand book monetisation rules) — the night-pass simply sets a client flag that suppresses interstitials for the room's life.
- The interstitial screen is the "intermission" (mobile-design §4.6): branded, mascot float, "Round N of the night," round-progress — it must read as a deliberate beat, not a failure. On no-fill / consent-declined / night-pass it **auto-advances instantly** to the results/leaderboard view.

---

## 3. Placement-based session XP (the heart of the domain)

This is the cross-game-synthesis §1.7 rule, made fully concrete. **Each game's `scores` scale stays internal; the shell never compares raw points across games.** It compares *placements*.

### 3.1 From `gameOver.scores` to a placement vector

Input: `scores: Record<PlayerId, number>` (cloned, higher-is-better for all 18 games — confirmed: every shipped module accumulates positive points and the winner is the max; the meta-manifest carries `higherIsBetter: true` so a future lower-is-better game is expressible without changing this code).

Algorithm (pure, deterministic, ties = **dense rank**):

```
placementOf(scores, roster):
  # roster = the players frozen at init (everyone who could place, incl. eliminated/disconnected)
  # absent-from-scores ⇒ treated as 0 (e.g. a player who left mid-match still placed)
  entries = roster.map(p => [p, scores[p] ?? 0])
  sort entries by score DESC
  assign dense rank: equal scores share a rank, next distinct score gets rank+1
  return Map<playerId, { rank, score, tiedWith }>
```

Worked examples (same XP outcome despite wildly different internal scales):

| Game | Internal winner score (typical) | 1st place XP | Why placement-based matters |
|---|---|---|---|
| tracer / pires-potes (VOTE@1) | ~5–7 | **100** | top scale ≈ 7 |
| option-vote (tu-preferes) | ~5–8 | **100** | +1 per correct prediction |
| rank-friends (Borda) | ~12–18 | **100** | Borda 1–3/round |
| input-guess (closest-number, exactBonus 50) | ~50–150 | **100** | a single exact guess = +50 |
| perform-judge (puppet: successPoints 100 + crew 50) | **300–600** | **100** | the extreme high scale |
| last-standing / secret-role / night-day | small (survivor/outcome) | **100** | binary-ish outcomes |

Without placement normalization, a single perform-judge puppet match would out-XP an entire night of tracer/rank (the exact failure cross-synthesis §5.3 names). With it, 1st is 1st.

### 3.2 The XP table (fixed, the one source of truth)

XP is a function of **placement rank** and **field size** (so a 1st-of-16 is worth more than a 1st-of-3), scaled by a **streak multiplier** (§6). One table, applied identically to every game:

```
baseXp(rank, fieldSize):
  # fieldSize = number of distinct placement *positions* awarded (roster size, ties collapse positions)
  topShare = (fieldSize - rank + 1) / fieldSize        # 1.0 for 1st, →0 for last
  XP = round( 40 + 60 * topShare )                     # floor 40 (everyone who played), 100 for 1st
  # bonuses (additive, pre-multiplier):
  if rank == 1:           XP += 25     # winner's circle
  if rank == 1 and fieldSize >= 8:  XP += 15   # big-room win
  if isPodium(rank, fieldSize):     XP += 10   # top-third finish
sessionXp(rank, fieldSize, streakMult):
  return round( baseXp(rank, fieldSize) * streakMult )
```

Concrete values (no streak, `streakMult = 1.0`):

| Field size | 1st | 2nd | 3rd | mid | last |
|---|---|---|---|---|---|
| 3 | 100+25=**125** | **80** | **40** | — | 40 |
| 8 | 100+25+15+10=**150** | **~96** | **~89** | ~70 | **40** |
| 16 | 100+25+15+10=**150** | **~98** | **~95** | ~70 | **40** |

Design intent baked in:
- **Everyone who plays gets ≥40 XP** (participation floor — the bar is "you showed up and finished," not "you won"; inclusive north-star).
- **1st place is always exactly 2.5–3.75× the floor** — meaningful but not crushing; a comeback is always alive.
- **Field-size bonus** rewards winning a crowded room without punishing small rooms.
- **No negative XP, ever.** Losing a match never reduces session XP (brand book "funny never cruel"; the punishment is the *superlative roast*, not the number).

### 3.3 Session XP is a running total, shown live

`session_xp[playerId]` accumulates across the Night. It is the spine of:
- the **running Night leaderboard** (shown on every interstitial + results screen),
- the **level-up juice** (`XPBar` + "+120 XP" bounce, mobile-design §3 / `ProgressBar`),
- the **Oracle of the Night** crown at summary (overall session-XP leader).

It is **placement-derived only**; it is mathematically impossible for a single high-scale game to dominate it. It resets to nothing when the room dies (§7).

### 3.4 "Level" is cosmetic, session-scoped

The brand-book "Level Up! +120 XP" moment is honored as a **per-Night cosmetic level**: `level = floor(sqrt(sessionXp / 50))` (a gentle curve so early matches level fast, then slow). It drives a celebratory badge + confetti on threshold-crossing and nothing else — no gating, no unlocks, no persistence. It exists purely for the dopamine of the bar filling. (There is no cross-Night level; there cannot be — anonymity invariant.)

---

## 4. The full loop, screen by screen (client app-shell)

Maps onto the mobile-design screen map (§4.1 there). The shell renders these generically; per-game screens plug into the `play` container via the client game registry (mobile-design §4.5).

| Step | Screen (route) | What the group sees | Meta-data shown |
|---|---|---|---|
| 0. Identity | `index` (Home) | nickname + avatar picker (device-local) | none (pre-room) |
| 1. Create/Join | `create` / `join` | 4-char code + QR | none |
| 2. **Lobby** | `room/[code]/lobby` | squad list, host's game picker | **Night leaderboard** (if ≥1 match played), per-player session level, "Night: match N" badge |
| 3. **Play** | `room/[code]/play` | per-game screen + shared chrome (TimerRing, score row, leave) | live match score (game-internal), **your session XP pill** (top corner, subtle) |
| 4. **Reveal** | (last `view` of the match) | the game's own reveal/podium | match placement, **+XP animation per player** (placement-derived) |
| 5. **Interstitial** | `room/[code]/interstitial` | "intermission," mascot, round-progress | **Night leaderboard** delta (who moved up), streak callouts ("🔥 3 in a row") |
| 6. **Results** | `room/[code]/results` | ranked match scoreboard, winner confetti | match placement → session-XP gain, streak status, "rematch / pick next / end night" CTAs (host) |
| 7. **Summary** | `room/[code]/results` (summary mode) | **Oracle of the Night** | leader crown, superlatives, group stats (§8) |

### 4.1 The between-games moment (the loop's hinge)

This is the highest-leverage UX in the whole meta-loop because it is where the Night's *story* is told. Sequence on `phaseKey → over`:

1. **Reveal** (game-owned) plays to completion — the podium, the confetti, the game's own payoff.
2. Shell overlays the **+XP placement animation**: each avatar's session-XP pill bumps by its placement award, bars animate (`slide`), 1st place gets a `bounce` + badge.
3. Client checks the **ad gate** (§2.4). If due → `interstitial` screen (skippable after 5s); else → straight to results.
4. **Results / mini-leaderboard**: the running Night leaderboard with this match's deltas, streak callouts, and the host's three CTAs.
5. Host taps **Rematch** (same game, new seed) / **Pick next** (back to lobby picker) / **End night** (→ summary). Non-hosts see "Waiting for host…" with the leaderboard still visible (never a blank wait).

---

## 5. Session length & pacing controls

| Control | Value | Rationale |
|---|---|---|
| **Idle TTL (hard end)** | 45 min (server-shell §5.4; remote-config) | Matches the "~45-minute session" framing; the real party rarely sits idle longer. |
| **Soft match cap (nudge)** | 8 matches, nudge re-arms every +2 | Long enough for a full arc, short enough to suggest a clean ending before fatigue. Pure nudge — never blocks. |
| **Per-match length** | game-owned (`phaseDurationMs`); ranges ~2–10 min across the 18 | The shell does not cap match length; it caps the *session*. |
| **Wind-down nudge copy** | deadpan ("on en fait une dernière ? / last one or you scared?") | Voice guide §1.8 — the app never hypes; it gently dares. |
| **Match-1→2 ad suppression** | always | Protect the warmup; first impression is play, not ad. |

The shell tracks `matchIndex` in `RoomMeta` and surfaces "match N of the night" everywhere a count helps the arc read (lobby badge, interstitial "Round N," summary "you played N games").

---

## 6. Streaks & combo juice (session-scoped, placement-derived)

Streaks are the cross-match juice that makes the Night feel like a run. **All streaks are computed by the shell from the placement vector — they never touch a reducer and never become points a game scores.**

### 6.1 The two tracked streaks (per player, per Night)

| Streak | Definition | Effect |
|---|---|---|
| **Win streak** | consecutive matches placed **1st** | XP multiplier ramp (below) + "🔥 ON FIRE" callout + sticker badge; breaks on any non-1st. |
| **Podium streak** | consecutive matches placed in the **top third** (≥podium) | smaller multiplier + "consistent" callout; breaks on a bottom-third finish. |

### 6.2 The multiplier ramp (capped, gentle)

```
streakMult(winStreak):
  winStreak <= 1 : 1.00
  winStreak == 2 : 1.10
  winStreak == 3 : 1.20
  winStreak >= 4 : 1.25   (hard cap)
```

Cap at 1.25× so a runaway leader can't lap the room — the comeback must always be live (inclusive north-star; the leader gets *juice and a target on their back*, not an insurmountable lead). The podium streak adds at most +0.05 and shares the same 1.25 cap.

### 6.3 Combo callouts (juice only, no math)

Shell-emitted celebration events at the interstitial/results beat, drawn from the placement deltas:
- **"Comeback"** — moved up ≥ `ceil(fieldSize/3)` ranks vs last match (Memphis-confetti `celebrate`).
- **"From the bottom"** — last place last match → 1st place this match (biggest single callout of the night).
- **"Free fall"** — 1st last match → bottom third this match (deadpan roast, never cruel: "the throne was warm. anyway.").
- **"Unbreakable"** — win streak ≥ 4 (the capped top).

All callouts honor reduced-motion (mobile-design §6.3 — collapse to a static badge + numeral) and are color-independent (label + icon, not color alone).

### 6.4 Why streaks are safe by construction

Because streaks are derived from placement (which is derived from `gameOver.scores`), and the multiplier only scales the *session-XP award* (a shell table value), they:
- never enter any `reduce` (purity firewall intact),
- never desync across phones (server computes them in the `roundOver` turn, then broadcasts),
- die with the room (no cross-Night streak — anonymity invariant),
- are fully deterministic on replay/rehydration (computed from the persisted Night log + scores).

---

## 7. Anonymous group identity, room-scoped & TTL-wiped

The "group" is **not** an entity. It is the live roster of one room, and it has exactly the persistence horizon of that room.

| Identity layer | Where it lives | Lifetime |
|---|---|---|
| `playerId` | server-minted UUID (server-shell §3.3) | the room (frozen into each match's roster at `init`) |
| nickname + avatar id | **device-local** (`AsyncStorage`); sent in `hello`, stored in DO `roster` (profanity-filtered) | the room (server copy); the device (local copy) |
| reconnect token | device-only; DO stores only a **hash** | the room |
| **session XP / level / streaks** | **DO SQLite `session_*` tables** (this doc, §11) | **the room** — wiped at TTL |
| **Night log** (match history, superlative signals) | **DO SQLite `night_log`** | **the room** — wiped at TTL |

**Hard rules (carried from platform invariants, restated for this domain):**
- **No cross-room profile.** Session XP, streaks, badges, and the Night log are written **only** to the room's DO and read **only** within that room. There is no user record, no leaderboard service, no analytics tying a `playerId` across rooms (PostHog is client-side and anonymous; Analytics Engine gets only aggregate game-name/seq blobs, never the session tables).
- **TTL wipe is total.** When the janitor fires (server-shell §5.4 + adversarial C3 fix), `destroyRoom` closes sockets, deletes the alarm, and `deleteAll()`s — the session tables and Night log vanish with everything else. The Oracle-of-the-Night screen is the **only** artifact, and it lives only on the phones that saw it (a shareable image, §8.4) — never on a server.
- **Rejoin within grace re-binds the same `playerId`** (server-shell §3.5), so a player's session XP/streak survives a disconnect blip **within one Night**. A player who leaves past grace and rejoins as a fresh seat starts session XP at 0 (correct — they are, anonymously, a new participant).
- **Identity continuity across a game switch is automatic** because `playerId` and the session tables are keyed off the room, not the match (§10).

---

## 8. End of Night — "Oracle of the Night" summary

The closing screen. It is the payoff for the whole Night and the single most shareable surface. It is **built into the shell** (route `results` in summary mode, mobile-design §4.8) and computed entirely from the session tables — no game involvement.

### 8.1 Three sections

**A. The Oracle (overall crown).** The session-XP leader of the Night, crowned "Oracle of the Night / L'Oracle de la soirée," big avatar, `ConfettiBurst`, final session-XP + level. Ties broken by: (1) most 1st-place finishes, (2) longest win streak, (3) earliest to reach current XP — then declared a co-crown if still tied (a co-crown is a fine party outcome; never a sudden-death round — matches game-level decision D10 in `tu-preferes.md`).

**B. Superlatives (the roast layer).** 4–6 awards handed out from cross-game shell stats, in the voice-guide deadpan-ironic register (§1.8). The shell picks the superlatives whose signal is strongest/funniest for this specific group. The universal set (computable for **every** game from placement + Night log alone):

| Superlative | Signal | Sample copy (voice guide register) |
|---|---|---|
| **The Oracle** | top session XP | "lis l'avenir, paie nos coups. / reads the room, owes nobody." |
| **The Comeback** | biggest single-match rank jump | "était dernier. a fini par te regarder de haut." |
| **Free Fall** | biggest single-match rank drop | "le trône était chaud. bref." |
| **Consistent (derogatory)** | tightest placement variance, never 1st | "jamais premier, jamais dernier. un fonctionnaire." |
| **The Anchor** | most last-places | "merci de ta participation. sincèrement." |
| **Unbreakable** | longest win streak | "personne a osé. ou personne a pu." |
| **One-Hit Wonder** | exactly one 1st, then nothing | "un pic. un seul. on s'en souviendra pas." |

Per-game superlatives (a game's meta-manifest may declare extra signals it emits, §11.1) — e.g. spotlight-guess "fastest finger," tu-preferes "best at reading the room / worst at reading the room," perform-judge "most-credited performer." These are **opt-in per game** and degrade gracefully (if a game didn't emit the signal, that superlative just isn't offered this Night).

**C. Group stats (the shared receipt).** Anonymous, aggregate, fun: matches played, games tried, total votes/taps cast, longest streak of the night, "loudest round" (highest reveal-engagement match), total laughs (a tap-to-react counter if the games expose it; else omitted). No individual shaming beyond the superlatives, which are affectionate by editorial law (voice guide §0 "funny never cruel").

### 8.2 Superlatives are awarded fairly and never punitively

- Every superlative is either neutral or self-deprecating-funny; **none reduces anyone's standing** (the Oracle is the only "winner"; the rest are flavor). The Anchor/Free Fall awards are roasts the group will laugh *with*, framed in the irony register, never an insult that lands as cruelty.
- No superlative is awarded to a player who left the Night early (they're excluded from the roast — you have to be in the room to get clowned).
- If the group is tiny (2–3) or the Night is short (1–2 matches), the shell awards fewer superlatives (min 1: the Oracle) rather than forcing thin signals into awkward awards.

### 8.3 Computed from the Night log (§11.3)

Each `roundOver` appends one Night-log row: `{matchIndex, gameId, placementVector, deltas, streakState, perGameSignals}`. The summary is a pure fold over these rows — deterministic, replay-safe, and wiped with the room.

### 8.4 Shareable, but anonymous

The summary renders to a **shareable image** (mascot-branded, the night's superlatives) the players can screenshot/share from their own device. It contains **only** the device-local nicknames + the night's awards — no `playerId`, no room code, no server reference. The share is a client-side capture; the server never produces or stores it. This is the one artifact that outlives the room, and it lives only where the players put it.

---

## 9. Host vs players — who sees and controls what

Host is a **roster flag** on the authoritative RoomDO (server-shell §3.5), not a special client. The host's phone is a normal client that happens to render extra controls; all authority is server-side.

| Capability | Host | Players |
|---|---|---|
| Pick next game (lobby picker) | ✅ | see the pick land |
| Start match | ✅ (`startGame`) | "waiting for host…" + live leaderboard |
| Rematch / Pick next / End night (between-games CTAs) | ✅ | see the choice, never a blank wait |
| Kick a player | ✅ (capability-gated, confirm modal; Plan-2 message) | n/a |
| Accept/dismiss wind-down nudge | ✅ | n/a |
| Tune lobby params (round count, etc., per-game allowlist) | ✅ | see the result |
| See own session XP / level / streak | ✅ | ✅ |
| See Night leaderboard | ✅ | ✅ |
| See Oracle / superlatives / group stats | ✅ | ✅ |
| Trigger their own in-game actions (vote, tap, perform) | ✅ (host is also a player) | ✅ |

**Host migration** (server-shell §3.5): if the host leaves past grace, the shell reassigns host to the **longest-connected** present player and re-broadcasts. The meta-loop is unaffected — session XP/streaks/Night log are room-scoped, not host-scoped, so a host change mid-Night loses nothing. The new host inherits flow control; the Night continues seamlessly.

**Decided:** the host does **not** get bonus XP or any scoring advantage for hosting. Hosting is a flow-control role, not a competitive one (inclusive north-star; the person who set up the room shouldn't be advantaged).

---

## 10. Mid-session game switching (first-class, lossless)

Switching games between matches is the **default expectation** of the Night arc, and it is lossless by construction.

**What persists across a switch (lives in `RoomMeta` / session tables, never in any game `State`):**
- the roster + each player's `playerId`, nickname, avatar (server `roster`),
- session XP, level, streaks (`session_*` tables),
- the Night log + `matchIndex` (`night_log`, `RoomMeta`),
- the running Night leaderboard.

**What is fresh each match (lives in game `State`, dies at `over`):**
- the game's internal scores/scale,
- the seed (new per match — including per rematch, so a rematch isn't a deterministic replay),
- the content pack draw,
- all game-specific phase state.

**Switch sequence:**
1. At `roundOver`, host taps "Pick next" → `status = lobby`.
2. Lobby picker shows available games (KV catalog manifest, mobile-design §4.2); host picks `gameId`.
3. Roster re-frozen from **currently-connected** players (someone who left between matches simply isn't in the next match's roster; someone who joined the lobby in the gap **can** join the next match — they enter the roster fresh with session XP 0).
4. `startGame{gameId}` → new seed, new content, `init`, `matchIndex+1`.

**Decided — late joiners between matches are allowed.** Mid-*match* joins are rejected (engine roster-fixed-at-`init` invariant; server-shell §3.3). But **between** matches the room is in `lobby`/`roundOver`, so a new person can join and play the next match. They start session XP at 0 (fair — they missed the earlier matches) and are eligible for placement/streaks from their first match on. This is the natural "someone arrives at the party" flow and the shell supports it for free.

**Decided — rematch re-freezes the roster too.** A rematch is "same game, new match," not "resume." It re-freezes from connected players (so a player who left during match N isn't forced into the rematch, and a lobby returner can join), mints a new seed, and increments `matchIndex`. It is a first-class match for XP/streak/Night-log purposes.

---

## 11. Shell data model additions (server-side, this domain)

These tables join the server-shell's existing `room_meta`/`roster`/`events`/`snapshots` (server-shell §5.1). They are **session-meta**, not game state, and are wiped at TTL with everything else. They are written in the `roundOver` turn (persist-before-broadcast) and read by lobby/interstitial/results/summary broadcasts.

### 11.1 Per-game meta-manifest (static, in the registry; not a DB table)

```ts
interface GameMetaManifest {
  gameId: string;
  displayName: { fr: string; en: string };
  higherIsBetter: true;                 // all 18 games; field exists for future-proofing
  superlativeSignals?: string[];        // e.g. ['fastestFinger','bestReader'] — opt-in extras
}
```

The registry maps `gameId → GameMetaManifest`. The shell reads `higherIsBetter` for placement direction and `superlativeSignals` to know which optional superlatives this game can feed. A game that declares none still participates fully in the universal superlatives (§8.1.B). **No game code changes** — this is a manifest the shell owns, sitting next to the existing client/server game registry.

### 11.2 `session_progress` table (per player, per Night)

```sql
CREATE TABLE IF NOT EXISTS session_progress (
  player_id   TEXT PRIMARY KEY,    -- room-scoped; FK to roster
  session_xp  INTEGER NOT NULL DEFAULT 0,
  level       INTEGER NOT NULL DEFAULT 0,
  win_streak  INTEGER NOT NULL DEFAULT 0,
  podium_streak INTEGER NOT NULL DEFAULT 0,
  best_win_streak INTEGER NOT NULL DEFAULT 0,
  matches_played INTEGER NOT NULL DEFAULT 0,
  first_places INTEGER NOT NULL DEFAULT 0,
  last_places  INTEGER NOT NULL DEFAULT 0
);
```

### 11.3 `night_log` table (per match)

```sql
CREATE TABLE IF NOT EXISTS night_log (
  match_index INTEGER PRIMARY KEY,   -- 0-based; == RoomMeta.matchIndex at the time
  game_id     TEXT NOT NULL,
  seed        TEXT NOT NULL,         -- the match seed (already in RoomMeta; duplicated for the log fold)
  placement_json TEXT NOT NULL,      -- placementVector: [{playerId, rank, score}]
  deltas_json TEXT NOT NULL,         -- rank deltas vs previous match (for comeback/free-fall)
  signals_json TEXT NOT NULL,        -- per-game superlativeSignals payload (or {})
  created_at  INTEGER NOT NULL
);
```

The Oracle/superlatives/group-stats are a **pure fold** over `night_log` + `session_progress` at summary time. Both tables are JSON-safe and contain only `playerId`s + integers/strings — no nicknames (those join from `roster` at render time), no cross-room keys.

### 11.4 `RoomMeta` additions

```ts
// extends server-shell RoomMeta
matchIndex: number;          // increments on each startGame/rematch; -1 in fresh lobby
nightStartedAt: number;      // first startGame of the Night (for "X-minute night" stat)
nightSoftCapNudgedAt: number | null;  // last time the wind-down nudge was shown
```

---

## 12. Worked end-to-end example (one Night)

5 players (A,B,C,D,E). All field-size 5; podium = top ~2 (`ceil(5/3)=2`).

| Match | Game | Internal winner | Placement (1→5) | XP awarded (mult) | Notable |
|---|---|---|---|---|---|
| 1 | tu-preferes | B (7 pts) | B,A,C,D,E | B 125, A 88, C 76, D 64, E 40 | no ad (match-1 suppression); B win-streak 1 |
| 2 | perform-judge (puppet) | B (480 pts) | B,C,A,E,D | B 125×1.10=**138**, C 88, A 76, E 64, D 40 | B win-streak 2 (×1.10); ad gate checks (≥90s? yes) |
| 3 | rank-friends (Borda) | E (16 pts) | E,D,B,A,C | E 125+comeback, D 88, B 76, A 64, C 40 | E "From the bottom" (was last→1st); B streak broken |
| 4 | input-guess (exactBonus 50) | A | A,B,E,C,D | A 125, B 88, … | A win-streak 1 |
| 5 (host ends) | — | — | — | — | → summary |

**Note:** match 2's perform-judge winner (480 internal pts) and match 1's tu-preferes winner (7 internal pts) earn the **same 125 base** — placement, not points. The cross-game leaderboard is meaningful. **Oracle of the Night** = highest cumulative session XP (likely B here from two early wins, unless E/A's comebacks overtook). Superlatives: B "Unbreakable" candidate (longest streak), E "The Comeback," whoever sat at rank 4–5 most "The Anchor."

---

## 13. What this domain explicitly does NOT do (anti-scope)

- **No engine/contract change.** Zero. Everything rides `phaseKey`, `gameOver.scores`, and shell tables. (Confirmed against all 10 modules' `phaseKey`/`gameOver` shapes.)
- **No reducer effects for XP/streaks/ads.** The §1.7 rule and the ad trigger are both shell-side; no game emits an XP or ad effect (cross-synthesis R1/R4 upheld).
- **No cross-Night/cross-room persistence.** No accounts, no profiles, no server-side leaderboard service. Anonymity-forever invariant.
- **No raw-point cross-game comparison anywhere.** Placement is the only currency that crosses game boundaries.
- **No host advantage, no pay-to-win.** Night-pass suppresses ads only; it buys no XP/placement edge (brand-book ads-only, funny-never-cruel).
- **No forced session length.** Soft nudges only; hard end is idle TTL.

---

## Open product calls (with my recommendation)

These genuinely need a human product/founder call. Each has my recommendation and is implementable either way without changing the architecture above.

1. **XP-table tuning (floor 40, win 100–150, cap 1.25×).** The exact constants are a feel choice that only real playtests can confirm. **Recommendation:** ship these as remote-config (`/config`) values so they're tunable without a deploy; start with the table in §3.2; watch "did the leader run away?" and "did losers feel flat?" analytics and adjust. The *shape* (placement-based, participation floor, capped multiplier, no negatives) is decided; the numbers are tunable.

2. **Soft match-cap value (8) and the wind-down nudge cadence.** Whether 8 is the right "natural end" or it should be 6/10. **Recommendation:** ship 8 as remote-config; instrument actual matches-per-Night and median Night length once real sessions exist, then tune. Lean toward *fewer* (suggest ending while it's still fun) over more.

3. **Which superlatives are in the launch set, and their exact copy.** §8.1.B is my proposed universal set; the founder owns final tone/wording per the voice guide. **Recommendation:** launch with the 7 universal superlatives in §8.1.B (copy as written, deadpan-ironic), defer per-game signal superlatives to a fast-follow as each game declares its `superlativeSignals`. Have the founder pass the copy through the voice-guide lint (§1.11).

4. **Shareable summary image — ship at launch or fast-follow?** It's the most viral surface but adds client capture work. **Recommendation:** fast-follow (v1.1), not launch-blocking. Launch the on-screen Oracle/superlatives; add the screenshot/share render once the summary layout is locked. (It's purely client-side, zero server/anonymity risk.)

5. **"Total laughs" / reaction counter in group stats.** Requires a lightweight tap-to-react signal during reveals that games would need to surface. **Recommendation:** defer to v2 as an opt-in per-game signal; until then, group stats use only placement-derived numbers (matches, games tried, longest streak, comebacks) which need nothing from games. Don't add a cross-cutting reaction mechanic just for one stat line at launch.

6. **Night-pass interactions with the Night arc.** Confirm the £1.99 night-pass simply suppresses interstitials for the room's life (my assumption) vs. also unlocking spicy packs for that Night. **Recommendation:** night-pass = ad-suppression for the room only (clean, honest, matches brand-book "no pay-to-win"); spicy-pack unlocks stay on the separate rewarded-video / per-pack path. Keep the two monetisation levers independent so neither feels like the other.

7. **Late-joiner session-XP start (0 vs. seeded to room median).** A latecomer starting at 0 can feel hopeless if they arrive at match 6. **Recommendation:** start at 0 (fair and simple) but make them eligible for the comeback/streak juice immediately, and exclude very-late joiners (joined in the final ~2 matches) from the "Anchor" roast so a latecomer isn't clowned for a short sample. If playtests show latecomers disengage, revisit a "median catch-up" seed — but start simple.
