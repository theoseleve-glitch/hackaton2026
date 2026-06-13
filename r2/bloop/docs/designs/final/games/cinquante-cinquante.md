# Cinquante-Cinquante / Fifty-Fifty — Final Design (SHIPPED)

| Field | Value |
|---|---|
| **Game id** | `cinquante-cinquante` |
| **Names** | FR **Cinquante-Cinquante** · EN **Fifty-Fifty** |
| **Tagline** | FR « Complète la phrase, vise le pourcentage de la foule. » · EN "Finish the line, hit the crowd's number." |
| **Template + mode** | `INPUT_GUESS` · mode `crowd-target` (2nd mode of the template; 1st is `closest-number` / Au Pif!) |
| **Players** | **2–16** (`minPlayers: 2`, `maxPlayers: 16` from the module) |
| **Spicy tier** | **0** (launch pack is `tone: classic`, minAge 0). 18+ sibling `cinquante-cinquante-after-dark` resolved below (§5). |
| **Physical** | **seated** (phones-only; no standup beat) |
| **Status** | **SHIPPED** — module `packages/games/input-guess/`, config `CINQUANTE_CINQUANTE_CONFIG`, pack `content/packs/cinquante-cinquante.json` (132 items) |

Module source of truth: `packages/games/input-guess/src/input-guess.ts` + `state.ts` (config `CINQUANTE_CINQUANTE_CONFIG`).

---

## 1. Pitch + room fantasy

**One-liner.** Each round shows a confessional sentence stem and an announced target ("Aim for 80% YES"); everyone secretly picks which of 6 completions they think 1,000 strangers answered closest to that target — the reveal flips the true percentages and the room finds out who reads humanity best.

**Room fantasy.** The fun is **arguing with a fictional crowd**. The mechanic manufactures two laughs at once: (1) the **incriminating statistic** — "62% have stalked their ex; there are six of you, do the math" — which forces the table to react to a number that implicates *them*; and (2) the **public mis-read** — you bet your friends' instincts and the reveal proves you wrong about what's normal. Nobody is judged for *their* answer (you never reveal what *you've* done — you guess what the *crowd* did), so it stays "funny never cruel": the crowd is the only one on trial. The signature party beat is the contested reveal ("84%?! no way!"), which the design **wants** — the argument is the product.

---

## 2. Shipped ruleset (AUTHORITATIVE)

All numbers are `CINQUANTE_CINQUANTE_CONFIG` (`state.ts`), `mode: 'crowd-target'`.

### Phases (real `phaseKey` + `phaseDurationMs`)

| Internal phase | `phaseKey` | Duration | Beat |
|---|---|---|---|
| `guess` | `pick:r{round}` | **25 000 ms** (`pickMs`) | Stem + announced `targetYesPct` in huge type + **6** completion cards (`cardsPerRound`). Each player secretly taps ONE card → hidden `submissions` buffer (card index in display order). Early-resolves when `allActed(connectedPlayers(players, connected), submissions)`. |
| `reveal` | `reveal:r{round}` | **12 000 ms** (`revealMs`) | Atomic promote: cards flip to their `crowdYesPct`, avatars land on picks, each card shows `distance = \|crowdYesPct − targetYesPct\|`. Scoring applied, running scores shown. Emits `analytics round_revealed`. |
| `over` | `over` | **null** (untimed) | Terminal scoreboard. Highest total wins. Emits `gameOver(scores)` with a defensively cloned scores map. |

- `totalRounds: 7` (clamped to `min(7, items.length)` at init; never an issue — pack is 132).
- Round-loop boundary: on the reveal deadline, `endRound` emits `analytics round_completed`, then advances to the next `pick` (clearing `submissions`) or to `over` after round 7.
- Note `phaseKey` for the collect phase is `pick:r{n}` (mode branch in `phaseKey()`), distinct from `closest-number`'s `guess:r{n}`. The ad interstitial fires client-side off the `phaseKey → 'over'` transition (server-shell, never a reducer effect).

### Card display order (determinism)
At `init`, items are seed-shuffled, and for each item the 6 completions are **seed-shuffled once and sliced to `cardsPerRound`** (`shuffle(rng, it.completions).slice(0, 6)`). Order is fixed at init and **identical for every viewer** — picks are by display index, so all clients agree.

### Scoring (exact constants)
Per card, `d = |crowdYesPct − targetYesPct|`. All 6 cards rank by `d`, but **only players who picked score**.

- **Closest:** every picker of a card at the **minimum** `d` gets **+3** (`closestPoints`).
- **Second:** every picker of a card at the **second-smallest DISTINCT** `d` gets **+1** (`secondPoints`).
- **Bullseye:** if the winning (min-`d`) card's `d ≤ 2` (`bullseyeWindowPct`), its pickers each get **+2 more** (`bullseyeBonus`) — so a bullseye round pays **5** to a closest-picker.
- **Distance ties:** all cards tied at the minimum `d` are "closest"; **all** their pickers get the full **+3** (no splitting). The `≥3-distinct` pack lint bounds this to at most one designed tie per item.
- **Non-pickers / timeout:** **0** this round. Never auto-assigned a card.

Worked example (`cc-could-totally-003`, target 30): `d`s are {a:3, b:3, c:15, d:8, e:8, f:21}. Min `d = 3` is a **designed tie** (cards a & b) → both pickers of a OR b get +3; second-distinct `d = 8` (d & e) → +1; no bullseye (min `d = 3 > 2`).

### Win / draw / tie
Highest cumulative `scores` total wins (shell crowns the leader; module emits cloned `gameOver(scores)`). The module does **no tiebreak** — equal totals are a genuine shared placement; the shell maps placement (not raw points) to session XP, so an internal tie maps to a shared placement upstream.

### Presence / disconnect
- `connected` is a `Presence` map (`@bloop/kit`), seeded by `initPresence(players)` at init.
- `playerLeft` flips connected→false **without deleting the roster seat or touching scores**; `playerRejoined` flips it back. Unknown players and no-op transitions return the **same state reference**.
- Disconnected players are excluded from `allActed`'s expected set (`connectedPlayers`), so the pick phase **early-resolves without them**. A leave that completes the expected set triggers resolve immediately (the reducer checks `allActed` on the `playerLeft` branch) — an absent player never blocks the room.
- Rejoin mid-pick: a returning player can still pick before the deadline (their seat and score are intact).

### Redaction (what is secret from whom)
- **`submissions` (the pick buffer) is the secret.** `view()` never exposes another player's pick during `guess`. Each viewer sees only `hasSubmitted: Record<PlayerId, boolean>` (who has acted) and `mySubmission` (owner echo, `submissions[viewer] ?? null`).
- **`crowdYesPct` is a value-secret until reveal.** During `guess`, cards are projected as `CrowdCardPublic { id, text }` only — percentages and distances are stripped. At `reveal`, cards become `CrowdCardRevealed { id, text, crowdYesPct, distance }` and `lastResult` (`CrowdRoundResult`: all picks, winning/second cards, bullseye flag, points) becomes public.
- `phaseKey` carries only `pick:r{n}` / `reveal:r{n}` / `over` — never a pick or a percentage. `leakedSecrets` redaction audit on the picks buffer is mandatory (per synthesis §1.5).

---

## 3. Content model

### Authoring item shape (bilingual source)
```jsonc
{
  "id": "cc-honestly-001",          // kebab, stable
  "targetYesPct": 80,                // int 1..99 — ANNOUNCED target (public from pick on)
  "askKind": "didYou",               // didYou | agree | wouldYou — how the fictional 1,000 was asked; drives reveal copy
  "stem": { "fr": "Honnêtement, j'ai déjà…", "en": "Honestly, I have…" },
  "completions": [ /* exactly 6 */ {
    "id": "a",                       // "a".."f"
    "text": { "fr": "…", "en": "…" },// completes the stem grammatically in BOTH languages
    "crowdYesPct": 84,               // int 0..100 — PRE-COMPUTED offline, per locale; SECRET until reveal
    "spicy": 0                       // 0|1|2 optional, default 0; >0 only allowed in spicy packs
  } ],
  "tone": "classic",                 // classic | spicy
  "tags": ["confessions"]            // curation only; reducer ignores
}
```
The runtime `CrowdTargetItem` (`state.ts`) is the cleaned projection: `{ id, targetYesPct, askKind, stem, completions: { id, text, crowdYesPct } }`. Authoring-only fields (`tone`, `tags`, `spicy`) are stripped by the pack adapter; the pack feeds `content.data.items`, filtered by `isCrowdItem` (needs `completions.length ≥ 2`).

### Shipped counts (`content/packs/cinquante-cinquante.json`, version 1, generated 2026-06-11)
- **132 items** (one item = one round). Lint floor is `totalRounds × 9 = 63` → **PASS** (≈19 no-repeat sessions before any reuse).
- Tone mix: **130 classic / 2 spicy** (`cc-romance-021` carries 3 `spicy:1` completions; 6 spicy-flagged completions total). The 2 spicy-toned items are kept in the classic pack only because every individual completion still clears the classic obscenity bar; the *flagged* completions are the migration seed for the after-dark sibling.
- Target distribution (extreme `≥90`/`≤10` · mid · coin-flip `40–60`): **14 / 71 / 47**. (The ⅓/⅓/⅓ design intent is partially met — see §8 risk: extreme-target underweight vs the lint.)
- Max completion length: **88 fr / 85 en** chars — over the recommended ≤60 (see §8 readability risk).

### What is AI-precomputed offline
**Only `crowdYesPct`** — never computed at runtime (the engine forbids I/O, wall-clock, ambient RNG). Offline pipeline: LLM persona-ensemble (≥20 demographic personas per locale, majority-vote, temperature-varied), calibrated against real published polls (YouGov/Ifop-style anchors), provenance stored per item. **Per-locale re-estimation** is mandatory at the bilingual→single-locale split (`cinquante-cinquante-fr` / `-en`) — FR and EN crowds answer differently (pineapple pizza polls differently in Paris and Portland). Hard AI-gate lints: 6 `crowdYesPct` pairwise distinct by ≥3 (≤1 designed tie vs target), ≥1 card within 12 of target (winnable), ≤1 card inside the bullseye window, obscenity filter, both locales natural (human gate before `rolloutPct > 5`).

### Voice / tone note (content-voice-guide §5.5)
> **Incriminating statistics.** Stems must be confessional (« Honnêtement, j'ai déjà… ») and completions must **escalate from universal to indefensible** — the comedy is 1,000 strangers admitting what your table denies. Reveal copy weaponizes the numbers against the room (« 62 % stalkent leur ex. Vous êtes six. Faites le calcul. »). Argument with the fictional crowd is the design goal — **numbers must stay plausible or trust dies.**

`askKind` drives reveal copy: `didYou` → "84% de la foule a dit OUI" (is this true for you?); `agree` → "do you agree?"; `wouldYou` → "would/could you?".

---

## 4. RESOLVED DECISIONS (every former defer / v2 / open / spicy / hostTunable → FINAL)

| # | Was (deferred / open / spicy) | FINAL decision | One-line spec / why |
|---|---|---|---|
| D1 | *Live AI scoring of free-text completions (the brief)* | **Cut (redesigned) — Ship v1 as pack-authored hand** | Runtime AI is impossible under deterministic replay; ship pre-written stem + announced target + 6 pre-scored completions. All three brief beats survive (complete the line, crowd %, closest-to-target wins). **SHIPPED.** |
| D2 | *Where do percentages come from / will players trust them?* | **Ship v1 — offline persona-ensemble + calibration + human gate** | ≥20 personas/locale, majority-vote, calibrated on real polls, provenance stored, framed as a consistent fictional 1,000-person crowd. Human spot-check gates `rolloutPct > 5`. The contested number IS the party moment. **SHIPPED.** |
| D3 | *Target not necessarily 50/50 (80/20, 95/5) — how chosen?* | **Ship v1 — authored per item, distribution lint ⅓ extreme / ⅓ mid / ⅓ coin-flip** | `targetYesPct` authored per item; seeded round shuffle mixes flavors each session. Current pack skews mid (14/71/47) — **lint to be enforced on next pack gen (content-op, not code).** |
| D4 | *New template or reuse?* | **Ship v1 — 2nd mode of INPUT_GUESS** (`mode: 'crowd-target'`) | Zero free text → no moderation surface → built as the template's easiest slice after `closest-number`. Modes-within-one-template per architecture ruling. **SHIPPED.** |
| D5 | *Recover free-completion creativity (freestyle)* | **Roadmap v2** — `freestyle` sibling mode | Players type completions; the ROOM votes OUI/NON live; room's % scores against target (deterministic — the crowd is the room). Blocked on the hardened text-moderation path (ships after `collab-one-word`). Same template, no contract change. |
| D6 | *Ties / passive players / disconnects* | **Ship v1 — full points to tied pickers; non-pickers 0; disconnected excluded from allActed** | No point-splitting on distance ties (keeps reveal celebratory, "funny never cruel"); deadline non-pickers score 0, never auto-assigned; `playerLeft` never deletes seat or touches scores. **SHIPPED** (matches reducer). |
| D7 | *Same % for FR and EN?* | **Ship v1 — No; re-estimate per locale at split** | Separate runtime packs `cinquante-cinquante-fr` / `-en`, percentages re-estimated per locale. Rooms are single-locale so in-room fairness is unaffected. **Pipeline requirement (load-bearing).** |
| D8 | *Spicy version* | **Roadmap v1.x — sibling config `cinquante-cinquante-after-dark`** | tone spicy, minAge 18, spicy-only completions, same template + same params. Pure Cadence-B content op, zero code. Concrete config in §5. |
| D9 | *`cardsPerRound` 4–6 (readability ceiling)* | **Ship v1 = 6; host-tunable down to 4** (not up) | 6 cards + target + stem in 25s is the readability ceiling; never raise above 6. Host may lower to 4/5 for big/young/tipsy rooms (§6). |
| D10 | *Bullseye window / point curve* | **Ship v1 as configured** (3 / 1 / +2 / window 2) | Bullseye pays 5, keeps the "nailed it" pop without runaway leads over 7 rounds. Frozen for v1; revisit only if telemetry shows score blowouts. |

No item left as "TBD".

---

## 5. The 18+ spicy sibling config (concrete)

**Ship a sibling config, not a new game.** Age-gating is a catalog/config concern (`gameConfigSchema`: `spicy ⇒ minAge ≥ 18`). The mechanic, module, and params are **identical** — only the content pack and catalog metadata change.

```jsonc
// game_config: cinquante-cinquante-after-dark
{
  "id": "cinquante-cinquante-after-dark",
  "module": "input-guess",
  "config": "CINQUANTE_CINQUANTE_CONFIG",   // IDENTICAL params — no mechanic change
  "minAge": 18,
  "tone": "spicy",
  "packIds": ["cinquante-cinquante-after-dark-fr",
              "cinquante-cinquante-after-dark-en"],  // SEPARATE pack ids, never mixed with classic
  "publicPicks": false,                     // unchanged: picks stay secret until reveal (same redaction)
  "anonymity": "same-as-classic"            // identity stays anonymous-forever; reveal still shows avatars on picked cards
}
```

What changes vs classic, and what does NOT:
- **Content only:** spicy stems/completions (sex, money, exes, body, substances) with `spicy: 1|2` allowed; obscenity filter relaxed to the 18+ band; per-locale `crowdYesPct` re-estimated for the spicy crowd. Seed the pack from the 6 already-flagged `spicy:1` completions (e.g. `cc-romance-021`).
- **No mechanic change:** durations, rounds, scoring, redaction, presence are byte-identical (same `CrowdTargetConfig`). Picks remain secret (you still guess the *crowd*, not confess your own act) — so even at 18+ the game keeps its "crowd on trial, not you" safety. No `publicPicks` exposure is introduced.
- **Catalog:** age-gate at the lobby; never auto-mixed into classic rooms; rolloutPct gated by the same human-review stage 5.

This is a **pure Cadence-B follow-up** (no deploy, content-pipeline only). Warranted because the core fantasy (incriminating confessions) escalates naturally to adult material and the safe launch pack maximizes reach.

---

## 6. Host-tunable params (lobby allowlist for THIS game)

| Param | Default | Safe range | Notes |
|---|---|---|---|
| `totalRounds` | **7** | **5–10** | Clamped to `min(value, items.length)` at init (pack 132 → no clamp). 5 ≈ 4 min, 10 ≈ 8 min. |
| `cardsPerRound` | **6** | **4–6** (never >6) | Readability ceiling; lower for big/young/tipsy rooms. Validator caps picks to `min(cardsPerRound, completions.length)`. |
| `spicyToggle` | **off** | off / on | When on, swaps to the `after-dark` pack ids and enforces room `minAge ≥ 18`. Catalog-level switch, not a reducer param. |
| `pickMs` | **25 000** | **15 000–35 000** | Debate/decision length. Below 15s degrades 6-card readability; above 35s drags. |
| `revealMs` | **12 000** | **8 000–18 000** | Reveal/argument beat — the contested-number moment; longer = more table argument. |
| `locale` | room locale | fr / en | Selects the single-locale pack; never mixes locales in a room. |

Frozen (NOT host-tunable): the point curve (`closestPoints` 3 / `secondPoints` 1 / `bullseyeBonus` 2 / `bullseyeWindowPct` 2) — balance is load-bearing and not worth exposing.

---

## 7. Future modes roadmap (v2 / v3)

| Mode | Decision | One-line spec |
|---|---|---|
| **`freestyle` (v2)** | **Roadmap** | Players TYPE their own completion; the ROOM votes OUI/NON live; room's % is scored against the target (deterministic — the crowd is the room). Same INPUT_GUESS template, no contract change. **Blocked on the hardened text-moderation path** (ships after `collab-one-word`). Recovers the brief's original creative beat. |
| **`after-dark` (v1.x)** | **Ship later** | 18+ spicy sibling config (§5). Content-only, zero code. First post-launch follow-up. |
| **`guess-your-table` (v3)** | **Cut for now** | Variant where the target is the *room's own* live YES/NO tally instead of the fictional crowd. Cut: it collapses into `freestyle`'s room-as-crowd mechanic and adds a second realtime tally surface for marginal novelty. Reconsider only if `freestyle` underperforms. |
| **`closest-number` ("Au Pif!")** | **Already shipped (sibling game)** | Same module, different mode/config (`QUIZZ_CULTURE_GE_CONFIG`). Listed for completeness — not a future mode of *this* game. |

---

## 8. Risks & content-ops notes

- **Content burn (highest).** Once a group has seen an item's percentages, the round is dead for them. Mitigations in place: 132-item pack (lint floor 63), seeded no-repeat draw within a session. **Required:** a steady Cadence-B fresh-pack cadence — content-burn is the dominant churn risk for this game.
- **Percentage trust.** Crowd numbers are AI estimates and *will* be contested ("84%?! no way!") — that argument is the product, but a sloppy pack kills trust fast. Calibration + provenance + the **human gate (stage 5)** are load-bearing before `rolloutPct` rises.
- **Pack-sizing lint:** `≥ totalRounds × 9 (63)` → **PASS at 132**. Re-lint on every regeneration.
- **Target-distribution drift:** current pack is **14 extreme / 71 mid / 47 coin** vs the ⅓/⅓/⅓ intent — extreme targets (the 95/5 signature) are **underweight**. Content-op action: enforce the distribution lint and add extreme-target items on next gen. Per-item lints (≥1 card within 12 of target, ≤1 in bullseye window, pairwise ≥3-distinct) must also be re-run.
- **Readability at speed:** max completion is **88 fr / 85 en** chars, over the ≤60 recommendation — 6 long cards in 25s on a phone is the degradation edge. Content-op: lint completion length ≤~60/locale and/or let hosts drop to 4–5 cards (§6, D9).
- **Bilingual → single-locale:** the pipeline MUST split the bilingual source and re-estimate `crowdYesPct` per locale, or FR rooms get EN-calibrated numbers (trust killer). Non-negotiable pipeline step.
- **Tie-sharing inflation:** full points to all tied pickers is generous; bounded by the pairwise-≥3-distinct lint (≤1 designed tie per item).
- **Moderation surface:** **none at gameplay time** — zero free text, all content pre-vetted offline. This is why `crowd-target` was the safest early INPUT_GUESS slice. Moderation surface returns only with the v2 `freestyle` mode.
- **Secret hygiene:** picks are secret until reveal — they must never surface in `phaseKey` or any non-owner view. `leakedSecrets` redaction tests on the `submissions` buffer are mandatory (synthesis §1.5).
