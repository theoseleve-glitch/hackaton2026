# Action ou Vérité — Fun & Lover / Truth or Dare — Fun & Lover — Final Game Design (SHIPPED)

| Field | Value |
|---|---|
| **Game id** | `truth-or-dare-2` |
| **Names** | FR **Action ou Vérité — Fun & Lover** · EN **Truth or Dare — Fun & Lover** |
| **Tagline** | FR « Deux ambiances : la soirée entre potes, ou le tête-à-tête qui chauffe. » · EN "Two vibes: party night with the crew, or date night that heats up." |
| **Template + mode** | `TRUTH_DARE@2` — rotating hot-seat (choose → prompt → verdict → score), pure config; the two ambiances are sibling configs + pack families on the **same module** (`packages/games/truth-dare/`), **zero game code per variant** |
| **Module instances** | FUN: `createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG)` · LOVER: `createTruthDare('truth-or-dare-lover', TRUTH_OR_DARE_LOVER_CONFIG)` (config-only sibling, `state.ts`) |
| **Players** | **min 2 · max 16** (module `minPlayers:2`, `maxPlayers:16`). Catalog floors the **lover** sibling at **2–8** (1–4 couples, marketed at 2) — same module, narrower catalog range |
| **Spicy tier** | **FUN = tier 1** (`tone:'classic'`, minAge 13, draws soft+party, **no spicy-tier entries at all**) · **LOVER = tier 2** (`tone:'spicy'`, minAge 18, draws party+spicy). The umbrella `spicyLevel:1` in the by-game JSON describes the FUN mainline only |
| **Physical** | **mixed** — truths are seated call-outs; dares are stand-up durational bits (T-rex arms, runway walks); lover dares are seated/intimate |
| **AI at runtime** | **None.** `needsOfflineAiPipeline: false` — items are static text, nothing AI runs at gameplay time. AI is optional **offline drafting** only, behind the §6 content gate |
| **Status** | **SHIPPED** — implemented, tested, playable on the `truth-dare` module (FUN config + 240-item pack live; lover sibling config shipped, gated `enabled:false` pending legal sign-off) |

---

## 1. Pitch & room fantasy

**One-liner.** A rotating hot-seat: the active player picks **Action ou Vérité**, the room sees the drawn prompt, they perform/answer it **out loud, IRL**, then tap **C'est fait !** / **Je passe** — and on a "done" claim the *rest of the room votes* whether they actually pulled it off. Highest score after the laps wins.

**Room fantasy.** Two registers, one machine. **Fun** is chaotic public-embarrassment energy — dares are durational absurd bits that *infect the session* (you keep the robot voice / T-rex arms until your next turn), truths are call-outs of universal shame aimed at someone *in this room*. **Lover** (18+, couples) is direct adult frankness written like Truth-or-Drink's Extra-Dirty tier — body count, raunchiest text, the real intimacy questions, partner-directed and suggestive but never explicit-in-front-of-the-room. The manufactured argument is the **verdict vote**: "tu l'as VRAIMENT fait ?" — the active player claims *Fait ✅*, the room either ratifies it or calls **Dégonflé 🐔**, and the votes stay hidden until the score reveal so the "TOI t'as voté chicken ?!" gasp lands at once. Brand spine: **funny never cruel**; the instant death of this deck is « quelque chose de coquin » coyness — at every tier, ask the actual question (voice-guide §5.7).

---

## 2. Shipped ruleset (AUTHORITATIVE)

All numbers below are quoted from `TRUTH_OR_DARE_2_CONFIG` / `TRUTH_OR_DARE_LOVER_CONFIG` in `packages/games/truth-dare/src/state.ts` and the reducer in `truth-dare.ts`.

```ts
export const TRUTH_OR_DARE_2_CONFIG: TruthDareConfig = {     // FUN mainline
  totalRounds: 3, chooseMs: 15_000, promptMs: 45_000, verdictMs: 20_000, scoreMs: 6_000,
  passesPerPlayer: 2, allowedIntensities: ['soft', 'party'],
  donePoints: 10, passPoints: 3, chickenedPoints: 0, dareBonus: 5,
  verdictThreshold: 0.5, allowedChoices: ['truth', 'dare'],
  escapeMode: 'pass', deck: 'fun', labels: { escape: 'Je passe' … },
};
export const TRUTH_OR_DARE_LOVER_CONFIG = {                   // config-only sibling
  ...TRUTH_OR_DARE_2_CONFIG,
  totalRounds: 4, passesPerPlayer: 3, allowedIntensities: ['party', 'spicy'], deck: 'lover',
};
```

**Session shape (FUN).** 3 laps × N players × (choose 15 s + prompt 45 s + verdict ≤20 s + score 6 s) ≈ **70–80 s per turn**; a 4-player FUN game ≈ 14–16 min, a 6-player ≈ 21 min. **LOVER** is 4 laps and capped at 8 players. The verdict phase is frequently auto-skipped (chicken/pass), so real turns run shorter than the worst-case 86 s.

### Phases (real `phaseKey` + `phaseDurationMs`)

`phaseKey(state)` = `over` when terminal, else `` `${state.phase}:${state.turnSeq}` `` — keyed on the **global monotonic `turnSeq`** (++ on every turn entry), NOT the round number, so 2-player laps never collide on the ad/transition key.

| Phase | `phaseKey` | `phaseDurationMs` | Beat |
|---|---|---|---|
| **choose** | `choose:{turnSeq}` | `chooseMs` = **15 000 ms** | Active player (seeded rotation, **disconnected seats skipped**) picks Truth or Dare via big chips; everyone else sees the waiting card + rotation rail. **Timeout** → deterministic seeded auto-pick `createRng(seed+'\|coin\|'+turnSeq)` over `allowedChoices`. When `allowedChoices.length === 1` (truth-only sibling) the choose beat is **auto-skipped** (0 ms straight to prompt). |
| **prompt** | `prompt:{turnSeq}` | `promptMs` = **45 000 ms** | Drawn prompt (seeded **no-repeat** deck per `${choice}:${intensity}`, **tier fall-down** on exhaustion) shown to the **whole room**; performed IRL; the active player taps **Done**, **Chickened**, or burns a **Pass** (if `passesLeft > 0`). Pass and self-declared Chicken skip the verdict, straight to score. **Timeout = chickened**, no pass spent — a passive player never blocks the room. |
| **verdict** | `verdict:{turnSeq}` | `verdictMs` = **20 000 ms** | Reached **only** after a `done` claim. Every **present** player except the active one votes done/chickened (enum vote, no free text). **Early-resolve** when all eligible voters have voted; timeout tallies whatever's in. **Empty eligible set** (2-player room, partner disconnected) resolves **immediately as done** at entry. |
| **score** | `score:{turnSeq}` | `scoreMs` = **6 000 ms** | Reveal: **FAIT ✅ / DÉGONFLÉ 🐔 / PASSÉ** stamp, public tally bar, +points burst, mini-leaderboard, next-up banner. No actions accepted. Deadline → next present player's `choose`, or `over` after the final lap. **Lap wrap emits `round_completed`** (the ad boundary) — never mid-lap, never after the final lap. |
| **over** | `over` | `null` (untimed terminal) | Final ranked podium; `gameOver(scores)` effect carries final scores. Reducer is inert (`if (state.phase === 'over') return NOOP`). Also reached early on total content-pool exhaustion. |

### Scoring (exact constants — active player ONLY; voters never score)

From `donePoints()` / `resolveVerdict()` / the pass + chicken branches:

- **done + truth** = `donePoints` = **10 pts**
- **done + dare** = `donePoints + dareBonus` = **10 + 5 = 15 pts**
- **passed** = `passPoints` = **3 pts** (one pass consumed under `escapeMode:'pass'`)
- **chickened** (self-declared, prompt timeout, voted down, or active player left mid-turn) = `chickenedPoints` = **0 pts**
- **Voters are never scored** — `toScore` only mutates `scores[activePlayer]`.
- **Verdict resolution:** `cast === 0` → **done** (benefit of the doubt); else **done iff `doneCount/cast >= verdictThreshold (0.5)`** → ties resolve to **done** (the `>=` is load-bearing).

### Win / draw / tie

- **Win:** highest cumulative `scores` after `totalRounds` full laps (FUN 3, LOVER 4). `over` fires when `round >= totalRounds` at a lap wrap.
- **No in-engine tiebreak** — `gameOver` emits the raw `scores` map; the `over` view exposes `scores` + `rotation`; **final ties share the podium**, resolved presentationally by the client.
- **No first-to-N** in v1 — fixed laps (see §4).

### Presence / disconnect

- `init` snapshots the roster into `state.players`; the reducer never adds/removes players mid-game (anonymous-forever, room-scoped TTL-wiped SQLite).
- **Rotation skips disconnected seats** (`nextActiveSeat` consults `connected`) — a dropped player is never handed the hot-seat.
- **Active player leaves mid-turn:** in `choose` → skip the reveal, hand the turn straight on (`active_left` analytics, `enterTurn`); in `prompt` → **chickened**, no pass spent (`active_left`). Never strands the room.
- **Voter leaves during verdict:** the `done` claim still stands; a leave can complete or empty the expected voter set → `resolveVerdict` runs on whatever votes are in (or immediate done if the set empties).
- **Rejoin** simply re-marks the player connected and re-expected; no state rewind.
- **Action/event from a non-roster `playerId`** → same-state NOOP (rejected event returns the **same state reference**, per the engine contract).

### Redaction (per-viewer)

The `view()` is server-authoritative and redacts the secret pools:

- **`itemsById`, `decks`, `cursors`, `usedPromptIds` are HIDDEN** — only the *current* prompt's text and `lastResult.promptText` ever surface. The room never sees the upcoming deck order.
- **`verdicts: Record<PlayerId, Verdict>` is HIDDEN** during the vote — the in-flight per-voter map is never serialised. The verdict view exposes only `votesIn` (a count), `votersExpected`, and `youVoted` (the viewer's **own** vote echoed back, never anyone else's). The full per-voter→verdict breakdown is promoted to a **public `tally` only at `score`** (counts only — still never names).
- **`seed`** (the auto-pick coin RNG) is never surfaced.
- **`canPass` is viewer-specific** — true only for the active player when an escape is available to them; everyone else sees it false.
- Prompt text flows through `view()` as the `LText` `{fr,en}` — the client picks the locale at render; the reducer never inspects prompt text.

### Ad interstitial

Fires **client-side** off the `phaseKey` transition into the lap-wrap boundary (server-shell design) — never a reducer effect. The reducer emits the **`round_completed` analytics** event at each lap wrap (and only there — never mid-lap, never after the final lap, where `gameOver` fires instead); the client uses that boundary as the interstitial cue. Cross-game session XP is **placement-based** (shell awards XP off this game's per-match placement, not its raw 10/15/3 point scale).

---

## 3. Content model

### Pack item shape (authoring master)

The runtime `TdItem` is a cleaned mapping of the authored entry; `spicy` and `minAge` are **authoring/catalog metadata dropped at build**, and `deck` is derived from the id prefix (`fun-*`→`fun`, `lov-*`→`lover`).

```jsonc
{
  "id": "lov-d-spicy-009",               // '<pack>-<t|d>-<tier>-<nnn>'; stable no-repeat key
  "choice": "dare",                       // 'truth' | 'dare'
  "intensity": "spicy",                   // 'soft' | 'party' | 'spicy' — the draw tier
  "spicy": 2,                             // 0|1|2 catalog rating (fun 0–1, lover 1–2; ≤ pack ceiling) — DROPPED at build
  "minAge": 18,                           // 13|16|18; every intensity:'spicy' entry MUST be 18 — DROPPED at build
  "text": { "fr": "…", "en": "…" },       // ≤280 chars, 2nd person, pre-moderated, room-judgeable
  "props": false,                         // needs a phone/object?
  "tags": ["couple","spicy","physical"]   // curation; every lover entry carries 'couple'
}
```

Runtime `init` filters the pack by `allowedIntensities` **and** `deck` (so the FUN config sees only `fun-*` soft/party, LOVER only `lov-*` party/spicy), builds a **seeded no-repeat shuffle per `${choice}:${intensity}`** key, and seeds the rotation — all deterministic from `seed`.

### What ships today (`content/packs/truth-or-dare-2.json`, version 1)

- **240 items total**, mixed-deck authoring master — **140 fun + 100 lover**.
- **By (deck, choice, tier):** FUN truth-soft 35 · truth-party 35 · dare-soft 35 · dare-party 35 (= 140). LOVER truth-party 25 · truth-spicy 25 · dare-party 25 · dare-spicy 25 (= 100).
- **By catalog rating:** spicy-0 = 70 · spicy-1 = 120 · spicy-2 = 50. **By minAge:** 13 → 70 · 16 → 120 · 18 → 50. (Every spicy-2/`intensity:'spicy'` entry is minAge 18 — §6 hard rule holds.) **`props:true` = 34.**
- **AI-precomputed offline: none** — items are static bilingual text; nothing AI runs at gameplay time. AI-assisted *drafting* (offline, behind the human §6 gate) is the recommended path to the bilingual volume.

### Voice / tone note (voice-guide §5.7)

> **`truth-or-dare-2` (Fun & Lover) — two registers, zero coyness.** *Fun* = chaotic public-embarrassment energy: dares are durational absurd bits that infect the session (T-rex tier), truths are call-outs of universal shame. *Lover* (tier 2, 18+) = direct adult frankness — body count, raunchiest text, real intimacy questions, written like Truth-or-Drink's Extra Dirty tier. The instant death of this deck is « quelque chose de coquin » coyness: **at tier 2, ask the actual question.**

Every line must transcreate (never translate) per locale (§6), name a concrete detail, and target the room/the speaker/a votable verdict. Lover content is **partner-directed, consent-forward, suggestive but never explicit-in-front-of-the-room** — the canonical pattern is `lov-d-spicy-009`: the *room judges the face*, not the act (the verdict mechanic structurally caps explicitness).

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / host-tunable bullet (from §2.7 + by-game `recommendations[]` + `risks[]`) resolved to a FINAL ruling.

| # | Was (open question / defer / risk) | FINAL decision | One-line spec / why |
|---|---|---|---|
| 1 | **New game, new template, or pack variants?** | **Ship v1: pack variants — zero new code.** | Two sibling configs (`TRUTH_OR_DARE_2_CONFIG` FUN + `TRUTH_OR_DARE_LOVER_CONFIG`) on the one shipped `truth-dare` module; shipped via Cadence B (R2 packs + KV catalog), no deploy. |
| 2 | **One tile with an ambiance picker, or two?** | **Ship v1: TWO sibling tiles** — `truth-or-dare-2` (FUN, classic, 13+) + `truth-or-dare-lover` (spicy, 18+). | Age-gating is per-config (schema forces `tone:'spicy' ⇒ minAge≥18`); a single tile cannot be simultaneously family-safe and 18+, and an in-lobby toggle would put 18+ content one tap behind a family tile. See §5. |
| 3 | **Lover player range — couples-only at 2, or more?** | **Ship v1: lover catalog range 2–8** (1–4 couples), marketed at 2; lobby copy "en couple(s) uniquement". | Module floor is already 2; the 2-player verdict edge is fully specced (immediate-done on empty voter set). Capping at 8 keeps verdicts intimate and avoids 16-player lover rooms misfiring socially. The engine never needs the pairing — the room knows it. |
| 4 | **Spicy 0–1 / 1–2 mapping onto soft/party/spicy tiers** | **Ship v1: FUN = soft(0)+party(1), NO spicy entries; LOVER = party(1)+spicy(2, 18+).** | Reuses the 3-tier system with zero reducer change; keeping 18+ entries **physically out of the fun pack** removes the dormant-spicy-tier store-compliance ambiguity (the fun pack simply doesn't contain spicy). Enforced by the `deck` filter + per-entry tier lint. |
| 5 | **Lover pass economy & scoring — same as fun?** | **Ship v1: lover `passesPerPlayer:3` (vs 2); scoring identical (10/15/3/0), NOT config-exposed.** | Consent-forward: declining an intimate dare must always feel cheap, so the lover skip economy gets a higher floor. Scoring knobs are deliberately absent from the params schema — both variants ride the module defaults, no schema change. |
| 6 | **How far does the lover 18+ (spicy-2) ceiling go?** | **Ship v1: suggestive, partner-directed, consent-forward; NEVER explicit/degrading/coercive, no contact with non-partners, everything skippable.** | Authoring rubric: every dare must have a **room-visible, judgeable** outcome (the verdict phase) without the explicit part happening in front of the room — `lov-d-spicy-009` (whisper + straight face, room judges the face) is the canonical pattern. Brand "funny never cruel" + Apple 1.1 / Google sexual-content tiers. |
| 7 | **Tier pacing — lover opens at spicy-2 (highest tier first), no warm-up. Acceptable?** | **Ship v1 as-is (spicy-first with fall-down to party on exhaustion). Roadmap v2: `tierProgression:'fixed-highest'\|'escalate'`.** | Respecting the v1 room-fixed tier ruling keeps this release pure Cadence B. The `escalate` param (lap 1 party, laps 2+ spicy) is a tiny reducer branch, **pre-scoped, explicitly not a launch blocker**. Do NOT fake escalation with two stacked configs. |
| 8 | **Pack sizing & authoring volume (~770 bilingual entries target)** | **Shipped: 240-item mixed-deck master (140 fun + 100 lover, 35/tier fun, 25/tier lover). Roadmap v2: grow toward the full ≥192 fun + ≥128 lover/locale lint target.** Offline AI drafting OK behind the §6 gate. | The synthesis §3.5 lint wants ≥48 per (choice,tier) fun / ≥32 lover at max rooms; the shipped 35/25 is **below the max-room lint** and triggers tier fall-down / early-end only at large rooms — sized for the typical 4–6 player room today, with a content drop scheduled (see §8). `needsOfflineAiPipeline:false`. |
| 9 | **Self-attested age gate (minors lie into 18+ lover)** | **Ship v1: lover ships `enabled:false`** behind the server/region spicy feature flag (default-OFF); flips to `enabled:true` **only after product+legal sign-off**. | Anonymous platform → age is self-attested. Mitigations: non-explicit ceiling (#6), per-prompt report path keyed by `prompt.id`, KV pack/config kill switch. Residual risk is a **legal sign-off gate**, not a code gate (ToD §9 Q2). |
| 10 | **Store compliance — lover tile may force an app rating change** | **Ship v1: verify storefront rating strategy BEFORE the lover packs publish; FUN tile ships unaffected (13+, no spicy entries).** | The lover tile existing in a 4+/Everyone-rated app may force a rating change — a content-ops/legal gate run before building packs, not after. FUN has zero spicy entries so it carries no dormant-tier ambiguity. |
| 11 | **Lover in a non-couple room — 'ton/ta partenaire' misfires for a third wheel** | **Ship v1: accept & monitor (soft mitigations only).** | The engine has no pairing concept and adding one is new code. Mitigations: lobby copy "en couple(s) uniquement", 2–8 cap, pass economy. Monitor abandon analytics; no engine change. |
| 12 | **2-player verdict feel — partner alone judges (could grief)** | **Ship v1: partner-alone judging accepted for flirty stakes; empty-voter-set auto-resolves done. Roadmap v3 (evaluate): advisory-only verdicts at 2 players.** | The 2-player edge is fully specced (immediate done when eligible set empties). Advisory-only verdicts would be a template param change — playtest first, only ship if griefing shows in metrics. |
| 13 | **Content drift — fun-pack 'party' entries creeping into spicy-2** | **Ship v1: hard per-entry lint in the §6 gate.** | `entry.spicy ∈ {0,1}` for fun, `{1,2}` for lover; `intensity:'spicy' ⇒ minAge 18`; spicy ≤ pack ceiling. Blocks at the AI/authoring gate, never at runtime. |
| 14 | **Single umbrella `spicyLevel` can't represent both variants** | **Ship v1: catalog tooling reads PER-CONFIG spicy values, not the umbrella `spicyLevel:1`.** | FUN = spicyLevel 1 / classic / minAge 13; LOVER = spicyLevel 2 / spicy / minAge 18. Any downstream catalog tooling must take the per-config values from §5, not the by-game JSON's umbrella number. |
| 15 | **Volume is AI-drafted → machine-mush risk (worst in lover register)** | **Ship v1: human FR/EN naturalness sign-off mandatory in the §6 gate before any AI batch flips `enabled:true`, rolloutPct 5→100.** | Machine-translated flirting reads as creepy. Transcreate-never-translate (voice-guide §6) is binding; the shipped 240 are hand-authored to the voice guide. |

No item left as "TBD".

---

## 5. The 18+ spicy sibling config (concrete)

This game **warrants a spicy tier** — the brief's "Lover" ambiance is the whole reason the second deck exists, and its appeal (body count, raunchiest text, real intimacy) is inherently 18+. The platform pattern is **two sibling configs on the same `truth-dare` machinery**, differentiated purely by KV catalog config + which **deck** and **tiers** are drawn. **No game code changes between siblings** — `TRUTH_OR_DARE_LOVER_CONFIG` is literally `{...TRUTH_OR_DARE_2_CONFIG, totalRounds:4, passesPerPlayer:3, allowedIntensities:['party','spicy'], deck:'lover'}`.

| Knob | `truth-or-dare-2` (FUN, default tile) | `truth-or-dare-lover` (18+ sibling) |
|---|---|---|
| `tone` | `'classic'` | `'spicy'` |
| `minAge` | **13** (all-ages tile) | **18** (forced by `tone:'spicy' ⇒ minAge≥18`; self-attested) |
| `deck` | `'fun'` (only `fun-*` items) | `'lover'` (only `lov-*` items) |
| `allowedIntensities` | `['soft','party']` (no spicy tier) | `['party','spicy']` (no soft tier) |
| `totalRounds` | **3** | **4** |
| `passesPerPlayer` | **2** | **3** (declining an intimate dare must feel cheap) |
| Catalog player range | 2–16 | **2–8** (1–4 couples, marketed at 2) |
| `escapeMode` / scoring / timers / `verdictThreshold` | **identical** — pass economy, 10/15/3/0, 15/45/20/6 s, 0.5 | **identical** |
| Source pack family | `tod2-fun-fr@N` / `tod2-fun-en@N` (the published split) | `tod2-lover-fr@N` / `tod2-lover-en@N` |
| Catalog surfacing | **default tile**, shown on unverified-age devices | shown only on 18+-attested devices; **ships `enabled:false`** until product+legal sign-off |
| Kill switch + report path | per-pack KV kill switch + per-prompt report keyed by `prompt.id` | same, plus the region/server spicy feature flag **default-OFF** |

**Concrete config diff** (KV catalog entries; no `.ts` change beyond the already-shipped sibling const):

```jsonc
// truth-or-dare-2   (FUN, default tile)
{ "module": "truth-dare", "config": "TRUTH_OR_DARE_2_CONFIG", "tone": "classic", "minAge": 13,
  "players": [2,16], "packFr": "tod2-fun-fr@1", "packEn": "tod2-fun-en@1", "enabled": true }

// truth-or-dare-lover  (18+ sibling)
{ "module": "truth-dare", "config": "TRUTH_OR_DARE_LOVER_CONFIG", "tone": "spicy", "minAge": 18,
  "players": [2,8], "packFr": "tod2-lover-fr@1", "packEn": "tod2-lover-en@1",
  "enabled": false, "spicyFeatureFlag": "spicy.tod_lover" }   // flips ON only after legal sign-off
```

**Content ceiling (binding):** suggestive, partner-directed, consent-forward; never explicit/graphic, never degrading/coercive, no contact with non-partners, everything skippable via pass. Every dare must be **room-judgeable** without the explicit part happening in front of the room (`lov-d-spicy-009` is the pattern). No tier above spicy-2 exists or is planned.

**Current ship-state note / content-ops action:** the runtime pack `content/packs/truth-or-dare-2.json` is a **single mixed-deck authoring master** (140 fun + 100 lover, where the `deck` filter at `init` already separates them at runtime). The publish-time split into single-locale, single-deck packs (`tod2-fun-{fr,en}` / `tod2-lover-{fr,en}`) per the one-pack-one-locale convention is a **content-ops step**. **Action before the lover sibling flips `enabled:true`:** run the publish split, the per-entry tier lint, the §6 human-naturalness pass, the storefront-rating verification, and the product+legal age-gate sign-off.

---

## 6. Host-tunable params (lobby allowlist)

The scoring constants are deliberately **not** host-tunable (they ride the module defaults across both siblings, by design). The lobby allowlist for THIS game:

| Param | Range / values | Default (FUN / LOVER) | Status |
|---|---|---|---|
| `totalRounds` (laps) | 2–6 | **3 / 4** | Ship v1 (already a config field; capped at content availability, falls to `over` on pool exhaustion). |
| `tone` / spicy toggle | `classic` ↔ `spicy` (= fun tile ↔ lover sibling, age-gated) | `classic` on unverified devices | Ship v1 (catalog/sibling switch; 18+ requires age attestation + the server flag). |
| `passesPerPlayer` | 0–4 | **2 / 3** | Ship v1 (config field; `escapeMode:'pass'`). 0 = no escape; flagged as the playtest knob (ToD §9 Q4). |
| `allowedChoices` | `['truth','dare']` \| `['truth']` \| `['dare']` | `['truth','dare']` | Ship v1 (config field; single-choice auto-skips the choose beat). Truth-only sibling is `truth-or-drink`. |
| `chooseMs` / `promptMs` / `verdictMs` / `scoreMs` | 5 000–30 000 / 20 000–90 000 / 10 000–40 000 / 4 000–12 000 ms | **15 000 / 45 000 / 20 000 / 6 000** | Roadmap v2 (module reads them; needs `templateParamsSchema(TRUTH_DARE)` to expose to host). |
| `tierProgression` | `fixed-highest` \| `escalate` | `fixed-highest` | Roadmap v2 (TRUTH_DARE@2 param; lover-pacing fix, decision #7). |
| `verdictThreshold` | n/a | **0.5** | Cut from host surface — a tunable verdict bar invites griefing arguments; 0.5/ties→done is the fair fixed rule. |

**Safe-range rationale:** `totalRounds` floored at 2 keeps a session ad-worthy; capped at 6 keeps even an 8-player lover room under ~30 min. `promptMs` floor 20 s guarantees enough time to perform a dare IRL; `verdictMs` is bounded so a slow room can't stall the loop (timeout tallies whatever's in). Timer ranges mirror the proposed `templateParamsSchema(TRUTH_DARE)` bounds so the shipped 15/45/20/6 sits comfortably inside.

---

## 7. Future modes roadmap (v2 / v3)

| Mode | Decision | One-line spec |
|---|---|---|
| **`escalate` tier pacing** | **Roadmap v2** | TRUTH_DARE@2 `tierProgression:'escalate'` — round index maps to ascending tiers (lover lap 1 party, laps 2+ spicy) to warm the room up; a tiny reducer branch (decision #7). |
| **Host-tunable timers** | **Roadmap v2** | Expose `chooseMs/promptMs/verdictMs/scoreMs` via `templateParamsSchema(TRUTH_DARE)` (module already consumes them) — pure protocol-schema addition, no reducer change. |
| **Full pack volume** | **Roadmap v2 (content-only)** | Grow to ≥192 fun + ≥128 lover/locale (≥48/≥32 per choice×tier) to clear the max-room lint; AI-drafted behind the §6 gate. Zero code. |
| **Themed packs** (anniversaire, longue distance, ex-edition…) | **Roadmap v2 (content-only)** | New `deck`-tagged pack families on the same module (tag-curated subsets) — one KV catalog entry each, zero code. |
| **Lover sibling live** | **Roadmap v2 (gated)** | Flip `truth-or-dare-lover` `enabled:true` after product+legal age-gate sign-off + storefront-rating verification + the §6 naturalness pass (decisions #9, #10, #15). |
| **Advisory-only 2-player verdicts** | **Roadmap v3 (evaluate)** | Template param making the lone partner's verdict advisory (auto-done) at 2 players, to defuse griefing — only if 2-player griefing shows in metrics (decision #12). |
| **Remote / online rooms** | **Roadmap v2 (platform-level)** | Same reducer, zero realtime-layer change (server-authoritative DO + per-viewer redaction already supports it) — no game work. |
| **Forfeit-draw escape** (drink/dare-card on skip) | **Cut for this game** | That is the **`truth-or-drink`** sibling's mode (`escapeMode:'forfeit-draw'`, truth-only) — out of scope for the fun/lover decks, which use the limited `pass` economy. |
| **Spicy-3 / explicit tier** | **Cut** | The room-judgeable verdict mechanic caps explicitness at suggestive (spicy-2); explicit-in-front-of-the-room content is out of brand and out of store compliance. |

---

## 8. Risks & content-ops notes

**Content-ops / pack lint**
- **Pack sizing lint — ⚠ below max-room target.** Shipped pack is **240 items** (140 fun + 100 lover): **35 per (choice, tier)** fun and **25 per (choice, tier)** lover. The synthesis §3.5 lint wants **≥48 fun / ≥32 lover per (choice, tier)** for max rooms (16×3 / 8×4). The shipped sizing is **right for typical 4–6 player rooms** but at large rooms triggers **tier fall-down** then **early game-end on pool exhaustion** (`pool_exhausted` → `over`, graceful but short). **Action: schedule a v2 content drop to clear the max-room lint** (decision #8 / §7). All entries ≤280 chars, second-person, room-judgeable; no duplicate ids.
- **Tier/deck split not yet emitted:** the runtime file is a single mixed-deck master; the `deck` filter at `init` already separates fun/lover at runtime, but the publish split into single-locale single-deck packs (`tod2-{fun,lover}-{fr,en}`) is a content-ops step. **Run before the lover sibling goes live.**
- **Per-entry tier lint (hard, §6 gate):** `entry.spicy ∈ {0,1}` for fun / `{1,2}` for lover; `intensity:'spicy' ⇒ minAge 18`; spicy ≤ pack ceiling. Verified on the shipped master (spicy-2 ⇔ minAge 18, 50 each).
- **Freshness / decay:** with no-repeat draw + rematch fresh seed, a 6-player FUN game burns ~18 prompts/lap; the 70 fun-truth + 70 fun-dare pool gives a handful of rematches before visible repeats. Rotate by `tags` and ship content drops to keep the deck fresh.
- **Localization integrity:** humour is **transcreated, not translated** (voice-guide §6) — machine-translated flirting reads as creepy. Any future pack drop needs a native FR/EN naturalness pass before the single-locale split.

**Moderation surface (highest of any wave-2 game — the 18+ lover deck)**
- **Self-attested age gate** is the headline risk: minors can lie into the lover config. Mitigations shipped: lover ships **`enabled:false`** behind a region/server spicy flag (default-OFF), a **non-explicit content ceiling** (#6), a **per-prompt report path keyed by `prompt.id`**, and a **KV pack/config kill switch**. Residual risk needs **product+legal sign-off before lover flips `enabled:true`** (ToD §9 Q2).
- **Store compliance:** the lover tile in a 4+/Everyone-rated app may force a rating change — **verify the storefront rating strategy before building the lover packs, not after** (decision #10). The FUN tile (13+, zero spicy entries) ships unaffected.
- **Non-couple lover room:** 'ton/ta partenaire' prompts misfire for a third wheel. Soft mitigations only (lobby copy, 2–8 cap, pass economy); the engine has no pairing concept. **Accept and monitor abandon analytics** (decision #11).
- **2-player verdict griefing:** the lone partner judges; empty-set auto-resolves done. Acceptable for flirty stakes; **playtest** — fallback is advisory-only verdicts (v3 evaluate, decision #12).
- **Adversarial "funny never cruel" check** runs on every card in the §6 gate (worst-possible-hands test); the hard floor (no protected-trait punching, nothing sexual near minors, no real-device dares that post/send, no excessive-drinking framing) applies at every tier.
