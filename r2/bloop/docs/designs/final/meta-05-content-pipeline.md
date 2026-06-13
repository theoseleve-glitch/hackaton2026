# Meta-05 — Offline-AI Content Pipeline & Pack-Ops (FINISHED)

**Date:** 2026-06-13
**Status:** DECIDED — source of truth for the content pipeline, pack-ops, versioning, locale split, KV catalog pin/kill-switch, and the inline→R2 migration seam for all 18 shipped games.
**Domain:** content-pipeline (meta-05)
**Grounds in:** `2026-06-11-wave2-17-games-design.md` §6 (+ per-game `needsOfflineAiPipeline`), `2026-06-10-cross-game-synthesis.md` §3 (pack envelope, versioning, locale, kill-switch, replay determinism), `2026-06-10-template-architecture.md` §6 (the AI-packaging validation gate) + §1.3 (Cadence A/B), `2026-06-12-content-voice-guide.md` (the human-QA voice law), `scripts/build-packs.mjs` (the live build seam), `apps/server/src/room/registry.ts:65` (the documented R2 seam), and the 17 authored packs under `content/packs/`.

> **Authority note.** This doc is the finished content-pipeline spec. It does not amend the engine contract, the `GameModule` shape, any game's mechanic/scoring, or the spicy-tier assignments — those are locked upstream. It decides the *offline* process that turns an authoring brief into an immutable, locale-split, R2-served pack, and the ops that pin, refresh, and kill it. The platform invariant **NO live AI at runtime** is the spine: everything the AI touches is pre-computed and baked into the pack JSON before it is ever event-sourced.

---

## Decisions (the short list)

1. **Seven games need pre-computed AI VALUES baked into the pack; the rest are AI-*assisted authoring* only.** Value-precompute games: `cinquante-cinquante` (crowd %), `quizz-culture-ge` (verified numeric answer + funFact), `double-jeu` (pair semantic closeness), `jeu-du-theme` (per-letter feasibility), `devine-la-question` (decoy/hint cross-plausibility), `trouvez-la-regle` (7 decoy rules), `devine-l-action` (action×channel pre-pairing + difficulty). `gauche-ou-droite` is no-precompute at launch, value-precompute (`crowdPct`) in v2. All other 10 games are authoring-only (no scored field), incl. `jeu-de-la-note` whose scale *targets* are drawn at runtime from the seeded RNG, not authored.
2. **The pipeline is a strict 6-stage funnel: AUTHOR → AI-ASSIST/PRECOMPUTE → LINT → HUMAN-QA (voice guide) → BUILD → PUBLISH.** A pack may only become `enabled:true` after all six pass. The voice-guide (`2026-06-12`) is the binding human-QA rubric — transcreate, never translate; the 7-point ship checklist gates every line.
3. **Authoring master is bilingual `{fr,en}`; PUBLISH splits it into two single-locale sibling packs `<base>-fr` / `<base>-en` with independent re-estimation of every AI value.** FR and EN are separate R2 pack ids forever (synthesis §3.1/§3.3); percentages, decoy plausibility, letter feasibility and closeness are scored per-locale because the joke, the crowd and the wordlist differ per culture.
4. **`ContentPack.version` is a monotonic integer, immutable per R2 object, bumped on every edit — never mutated in place.** A correction is a new version, never an overwrite. Replay determinism pins a room to its `{packId, version}` for life (synthesis §3.2).
5. **The KV catalog `contentPackRef.packId` carries the locale-less base; the shell appends the room locale at `startGame` and pins `{resolvedPackId, version}` into `RoomMeta`.** One Home tile, two packs, shell-side locale resolution (template-arch §2.7).
6. **Two-level kill-switch, both KV-only, zero deploy:** config-level (`enabled:false` yanks the tile + makes `startGame` return `UNKNOWN_GAME`) and pack-level (re-pin `contentPackRef.version` to a known-good version). A bad pack is reverted by changing one integer in KV.
7. **The build seam is `scripts/build-packs.mjs` → inline `apps/server/src/content/*.ts` → (exit) R2 CONTENT bucket via `RoomMeta.contentRef`.** The inline path is the launch reality (registry.ts:65 is the documented seam); the migration to async R2 loading is specced here as a drop-in behind the same registry key, triggered by the size budget in §7.
8. **Trend-decaying packs (`gauche-ou-droite`, e-scooters etc.) refresh MONTHLY by publishing a new immutable pack version and re-pinning the KV `contentPackRef.version` — no deploy, no app update.** Cadence B end-to-end.
9. **The AI pipeline is a content-op automation with ZERO privileged code path** — it produces artifacts that pass the *same* template-architecture §6 gate a human content-op's would, and the flag flip is always the last, human-signed step (template-arch §6).
10. **The edge-QA pass already ran and is encoded as the voice guide + the `safeItems`/locale/leak lints already live in `build-packs.mjs`.** This doc treats those as the implemented QA-gate-1; the remaining gates (value precompute, cross-plausibility scoring, fact-check, R2 migration) are the build-forward work.

---

## 1. Scope & the one inviolable rule

Runtime is deterministic, replay-driven, seeded-RNG-only, with **no wall clock and no AI**. Therefore every value a reducer scores against must already be a literal in the pack JSON at `init`. The content pipeline exists to manufacture those literals *offline*, correctly, in both locales, and to ship/refresh/kill them through KV without a deploy.

Three classes of pack field, and where each comes from:

| Field class | Source | Examples | Runtime treatment |
|---|---|---|---|
| **Authored copy** | human writer (AI-drafted, human-finalized) | every `text/prompt/question/stem/theme/action` | rendered as-is, client picks locale |
| **AI-precomputed value** | offline pipeline, human-verified | `crowdYesPct`, verified `answer`, `closeness`, letter feasibility, decoy sets, hint ladders | a literal the reducer reads; a VALUE SECRET until its reveal tier |
| **Runtime-drawn value** | seeded RNG at `init` | `jeu-de-la-note` scale target, candidate shuffle `realIndex`, deck order | never authored, never in the pack |

The pipeline owns classes 1 and 2. Class 3 is engine territory and out of scope except to note: **scale targets are NOT pre-computed** (the wave-2 doc §2.10 is explicit — targets are drawn for all rounds at init from the seeded RNG), which is why `jeu-de-la-note` is authoring-only despite "feeling" like a calibration game.

---

## 2. The 18 games — exactly what each needs (the decided matrix)

The roster is 17 wave-2 games + tracer/`pires-potes`-lineage; `loup-garou` is the 18th distinct game. Spicy siblings (`-lover`, `-after-dark`, `-soft`, `truth-or-forfeit`) are config+pack variants off the same authoring family, not separate pipeline entries. Columns: **Precompute?** (does a reducer score against an AI value), **What the pipeline pre-computes**, **Pipeline criticality**.

| # | Game | Precompute? | What the offline pipeline pre-computes (per locale) | Criticality |
|---|---|---|---|---|
| 1 | `cinquante-cinquante` | **YES** | `crowdYesPct` per completion: LLM persona-ensemble ≥20 demographic personas, temperature-varied, majority-vote, calibrated against real published polls, provenance stored. + distribution lints. | **P0** — player trust; wrong % kills the game |
| 2 | `quizz-culture-ge` | **YES** | verified numeric `answer` + `source` + `verifiedAt` (AI-drafted, **human fact-check is a hard non-negotiable gate**); `funFact` natively funny; `scale` hint; time-stable-facts lint | **P0** — factual correctness; a viral wrong answer is a reputational hit |
| 3 | `double-jeu` | **YES** | `closeness` (easy/medium/hard) = semantic distance of each majority/impostor pair, scored per-locale (pairs must be equally hard in FR and EN). v2: pre-rendered near-identical image pairs, QA'd, R2-hosted | P1 — pair calibration *is* the game |
| 4 | `jeu-du-theme` | **YES** | per-(theme × letter × locale) feasibility: each letter passes the **≥15 common words** gate (LLM + wordlist cross-check); `exampleWords` QA evidence generated then **STRIPPED at publish** | P1 — unplayable letters = dead turns |
| 5 | `devine-la-question` | **YES** | decoy questions + 2-tier progressive hints, then **cross-plausibility scoring** (every answer option plausibly answers the real question AND all 4 decoys; hints narrow without revealing), auto-reject below threshold, per-locale independently | P1 — decoy quality is load-bearing |
| 6 | `trouvez-la-regle` | **YES** | exactly 7 decoy rules per item: plausibility + mutual distinctness under `normalizeText` + same-category constraint, per locale | P1 — decoy quality is the guessability dial |
| 7 | `devine-l-action` | **YES** | action × help-channel pre-pairing (feasible AND funny combos only) + `difficulty` pre-scoring + physical-safety lint (no climbing/chugging/blindfolds/non-players), human-reviewed | P1 — pre-pairing guarantees every combo works |
| 8 | `gauche-ou-droite` | **launch: NO / v2: YES** | launch: nothing. v2: `crowdPct` per item if the "what the internet thinks" beat is ever shipped (same persona-ensemble path as #1) | P2 — additive beat only |
| 9 | `tu-preferes` | NO | — (majority is the room's own live votes) | authoring-only |
| 10 | `pires-potes` | NO | — + **similarity audit against the "Amis de merde" published deck** (legal) | authoring-only + legal lint |
| 11 | `truth-or-dare-2` (fun+lover) | NO | — (~770 bilingual entries; AI-assisted draft, human naturalness pass mandatory — machine-translated flirting reads as creepy) | authoring-only, high volume |
| 12 | `truth-or-drink` (+forfeit) | NO | — (forfeit pool reuses `choice:'dare'` rows; alcohol-phrasing lint) | authoring-only + alcohol lint |
| 13 | `jeu-de-la-note` (+la-roue) | NO | — (scale targets drawn at init from seeded RNG; pack carries only prompt/anchors) | authoring-only |
| 14 | `double-le-mouvement` | NO | — (movement prompts; difficulty is authoring metadata, not scored) | authoring-only |
| 15 | `mime-inverse` | NO | — (actions + forbidden words; honor-rule taboo, no speech recognition) | authoring-only + safety lint |
| 16 | `devine-l-objet` | NO | — (objects + category; difficulty is a draw-filter, not a score) | authoring-only |
| 17 | `loup-garou` | NO | — (flavor-only pack: role cards + ≥3 narration variants/slot; mechanics never depend on content) | authoring-only |
| 18 | tracer / VOTE-lineage | NO | — (designation prompts collapse to `{prompts:string[]}`) | authoring-only |

**Net: 7 value-precompute games (P0×2, P1×5), 1 v2-precompute, 10 authoring-only.** The two P0 surfaces — `cinquante-cinquante` percentages and `quizz-culture-ge` verified answers — both ship in wave B1, so the **persona-ensemble estimator** and the **fact-check workflow** are the first two pipeline components to build (wave2 §6 closing note, adopted).

---

## 3. The 6-stage pipeline (decided flow)

```
   ┌──────────┐   ┌─────────────────┐   ┌────────┐   ┌──────────────┐   ┌────────┐   ┌──────────┐
   │ 1 AUTHOR │ → │ 2 AI-ASSIST /   │ → │ 3 LINT │ → │ 4 HUMAN-QA   │ → │ 5 BUILD│ → │ 6 PUBLISH│
   │ bilingual│   │   PRECOMPUTE    │   │  (auto)│   │ (voice guide)│   │  split │   │  R2+KV   │
   │  master  │   │   (per locale)  │   │        │   │              │   │  +pin  │   │  flag    │
   └──────────┘   └─────────────────┘   └────────┘   └──────────────┘   └────────┘   └──────────┘
                                                                              │
                       content/packs/<game>.json  ──build-packs.mjs──────────►│ inline TS (launch)
                                                                              └─►R2 object (exit, §7)
```

### Stage 1 — AUTHOR (bilingual master)
One JSON master per game at `content/packs/<gameId>.json` (already the live layout — 17 files, all `version:1`). The master is the *authoring* artifact: bilingual `{fr,en}`, all spicy tiers, all authoring-only metadata (`tags`, `difficulty`, `source`, `verifiedAt`, `exampleWords`). AI may draft at volume; a human owns the final word. Per the voice guide §6, FR and EN are **transcreated, never translated** — the rewrite agent writes blind in its locale from the mechanical spec, then compares only for tier/mechanics parity.

### Stage 2 — AI-ASSIST / PRECOMPUTE (per locale, the only place AI touches values)
For the 7 precompute games, the offline pipeline runs the game-specific estimator **independently per locale** and writes the scored fields back into the master (or into a per-locale overlay merged at build). The five estimator components, decided:

| Component | Games | Method (decided) | Reject rule |
|---|---|---|---|
| **Persona-ensemble %** | cinquante-cinquante (v2: gauche-ou-droite) | ≥20 demographic personas/locale, temperature-varied, majority-vote → `crowdYesPct`; calibrate against real published polls; store provenance | fails distribution lint (§4) |
| **Fact-check** | quizz-culture-ge | AI drafts `answer`+`source`+`verifiedAt`; **human verifies every answer**; time-stable-facts only (no live populations/prices/breakable records) | any competing credible value → cut the question |
| **Closeness scoring** | double-jeu | embedding/semantic distance of the majority/impostor pair → easy/medium/hard, per locale | "hard" pairs additionally human-playtested |
| **Cross-plausibility scoring** | devine-la-question, trouvez-la-regle | score every answer-option × {real + decoys} for plausibility; score decoys for mutual distinctness under `normalizeText` + same-category | below plausibility/distinctness threshold → auto-reject the item |
| **Feasibility / pre-pairing** | jeu-du-theme, devine-l-action | jeu-du-theme: LLM + wordlist cross-check ≥15 common words per (theme,letter,locale); devine-l-action: enumerate feasible AND funny action×channel combos, pre-score difficulty | letter < 15 words → drop letter; unfunny/infeasible combo → drop |

**Hard rule: the AI never runs at, or is invoked by, runtime.** Stage 2 output is a static literal. The `leakedSecrets` replay smoke (stage 4) proves the literal never leaks into a pre-reveal view.

### Stage 3 — LINT (automated, blocking)
Schema + sizing + safety + value-distribution lints. **Several already run in `build-packs.mjs` today** and are the encoded edge-QA pass:
- `safeItems` / spicy filtering — core packs ship spicy 0 only (`build-packs.mjs:17`).
- **theme-leak lint** (double-jeu) — the PUBLIC theme must not contain either HIDDEN word; offending items dropped at build (`build-packs.mjs:149`).
- **letter-merge lint** (jeu-du-theme) — per-locale letters merge to a shared list so the shouted letter is byte-identical on every phone (`build-packs.mjs:278`); `exampleWords` stripped (`build-packs.mjs:293` comment).
- **field-strip** — authoring-only fields (tags/difficulty/verifiedAt/source) stripped from the runtime pack (`build-packs.mjs:93`).
- **cinquante-cinquante whole-item drop** — an item with any spicy completion is dropped whole, never card-by-card, to preserve the exactly-6 hand (`build-packs.mjs:109`).

Plus the per-game value-distribution lints from the wave-2 designs (to add to the lint suite):
- cinquante-cinquante: all 6 `crowdYesPct` pairwise ≥3 distinct (≤1 designed tie); ≥1 card within 12 of target; ≤1 inside the bullseye window; target mix ~⅓ extreme / ⅓ mid / ⅓ coin-flip.
- Sizing lint (synthesis §3.5): every drawable pool ≥ worst-case draw count for `maxPlayers` at default rounds.

### Stage 4 — HUMAN-QA (the voice guide is the law)
The `2026-06-12-content-voice-guide.md` 7-point **ship checklist** (§7) is the per-line gate, applied by a human (or curation-LLM with the rubric) before promotion:
concrete detail not category · targets the room/speaker/verdict · could start a 30s argument · ≤1 slang token from the ALIVE lists · reads as spoken language · no hype/explained-joke/😂 · correct spicy tier + passes the **hard floor** (§3 of the guide: no protected-trait punching, no real private individuals, nothing sexual near minors, no incitement, behavior-not-identity, assault never played straight) + the **worst-possible-hands adversarial check** · transcreated not translated. Plus, for precompute games, a human eyeballs the AI values for plausibility (the persona-ensemble % must be defensible; every quiz answer fact-checked).

### Stage 5 — BUILD (split + pin)
`node scripts/build-packs.mjs` regenerates the inline server packs from the masters (this is the live, working seam). The build is where the **bilingual master splits into single-locale runtime packs** and where the field-strips/leak-lints of stage 3 are physically applied. Output id convention: `<gameId>-core` today (launch packs are all-ages, single inline blob); the **decided publish id is `<gameId>-<locale>`** (e.g. `quizz-culture-ge-fr`) once the R2 split lands (§5, §7).

### Stage 6 — PUBLISH (R2 immutable + KV pin + flag)
Write the immutable pack object to R2 at its version; add/update the KV `client-config.catalog[]` entry pinning `{packId, version}`; flip `enabled`/`rolloutPct` **only after stages 1–5 pass + human sign-off** (template-arch §6: "the flag flip is the LAST step"). Staged: `rolloutPct:5` → watch anonymous `round_completed`/abandon analytics → human promotes to 100% or kills.

---

## 4. The QA gates that already ran (the edge-QA pass)

The edge-QA pass is **not future work — it is shipped**, in two artifacts:

1. **The voice guide (`2026-06-12`)** is the *output* of the 5-lens edge-QA research (FR/EN slang, FR/EN humor mechanics, edge calibration vs CAH/Limite Limite/Picolo/Juduku/Truth-or-Drink + store policy). It encodes the spicy-tier edge ladder, the hard floor, and the per-game tone notes for all 17. This is QA-gate-4's rubric, finalized.
2. **The build-time lints in `build-packs.mjs`** are the *automated* edge-QA: spicy-0-only core packs, theme-leak drop, example-word strip, whole-item spicy drop, authoring-field strip. These ran the moment the 17 masters were authored (every pack is `version:1`, ~1.6 MiB of source JSON, 30–261 items each).

What remains to wire (build-forward, not edge-QA): the **value-distribution lints** (cinquante-cinquante pairwise-distinct etc.), the **cross-plausibility/closeness scorers**, the **fact-check workflow**, and the **per-locale split** (today the build emits a single bilingual `-core` blob; the split to `-fr`/`-en` is the §5 work).

---

## 5. Locale split (FR/EN are separate pack ids, forever)

Decided rules (synthesis §3.1/§3.3 + template-arch §2.7, made concrete):

- **One pack id = one locale.** Mixed-language packs are unsupported. Publish ids are `<gameId>-fr` and `<gameId>-en`.
- **Every AI value is re-estimated per locale.** Pineapple-pizza polls differently in Paris and Portland; FR and EN letter lists *intentionally differ*; closeness and decoy-plausibility hold independently in each. This is non-negotiable for the 7 precompute games — an EN-calibrated % in an FR room is a fairness bug. (Rooms are single-locale, so within a room fairness is preserved; the risk is shipping one locale's numbers under the other's id.)
- **The KV `contentPackRef.packId` carries the locale-less base** (`quizz-culture-ge`); the **shell appends the room locale at `startGame`** (`quizz-culture-ge-fr`) and pins the resolved `{packId, version}` into `RoomMeta.contentRef`. One Home tile spans both locales; `init` stays locale-free (it just shuffles `data`).
- **Today's reality vs the decided target.** The live build emits one bilingual `<gameId>-core` blob carrying both `{fr,en}` keys (client picks at render). This is acceptable for the *inline* launch (the redaction/secrecy is identical; the client already locale-picks). The **R2 publish target is two separate objects** so per-locale versioning, kill-switch and trend-refresh are independent (an FR % correction should not bump the EN pack). Migration: the split is a build-flag in `build-packs.mjs` that emits `<id>-fr.json`/`<id>-en.json` instead of one `-core.ts`; flip it as part of the R2 cutover (§7).

---

## 6. Versioning, KV pin & kill-switch (immutable, monotonic, deploy-free)

- **`ContentPack.version` is a monotonic integer, immutable per R2 object, bumped on every edit** (synthesis §3.2). Corrections are new versions; R2 objects are never mutated in place. All 17 masters are `version:1` today.
- **KV catalog pins the live `{packId, version}` per game per locale.** The reducer receives whatever pack the shell hands `init`; it never selects a version.
- **Replay determinism pins a room for life.** Because `init` consumes the pack, a room stores its resolved `{packId, version}` alongside the seed; rehydration must feed the identical pack version. A kill-switch flipped mid-room does NOT tear down that room (it finishes on its pinned ref) — it only blocks *new* rooms (template-arch §4.3).
- **Two-level kill-switch, both KV-only, zero deploy:**
  1. **Config kill** — `enabled:false` on the `game_config` hides the tile AND makes `startGame {configId}` return `err('UNKNOWN_GAME')` (template-arch §4.3). Yanks a whole game region-wide in one KV edit.
  2. **Pack kill / revert** — re-pin `contentPackRef.version` to a known-good prior version (or bump to a corrected new version). Reverts bad content at pack granularity without touching the tile.
- **Defense in depth:** the server `startGame` handler re-checks `enabled` + rollout bucket, so a client that ignored the catalog filter still cannot start a disabled game or load a killed pack.

---

## 7. The build seam: inline → R2 migration (the documented exit)

**Current state (launch reality):** `build-packs.mjs` reads the 17 masters and writes inline TS at `apps/server/src/content/*.ts`, which `registry.ts` imports statically and hands to `init`. `registry.ts:65` documents the seam verbatim: *"static built-in pack. R2 seam: becomes an async loader keyed by `RoomMeta.contentRef`."* The generated inline TS totals **~1.5 MiB** across 11 files (source masters ~1.6 MiB); the inline-bundle budget cited upstream is **2.1 MiB**. We are *under* budget but with little headroom — the inline path works for the 18-game launch and dies the moment a single spicy/locale sibling family lands.

**The decided trigger to migrate:** when the inline content bundle would exceed **~1.8 MiB** (a deliberate 0.3 MiB margin under the 2.1 MiB ceiling — adding the `-lover`/`-after-dark`/`-soft` spicy families or the FR/EN split roughly doubles content). Migrate before, not after, the ceiling.

**The migration (a drop-in behind the same registry key, zero contract change):**
1. `build-packs.mjs` gains an `--r2` mode that writes immutable objects to the R2 CONTENT bucket at `content/<template>/<packId>@<version>.json` (template-arch §1.3 Cadence A) instead of inline TS, and emits the `-fr`/`-en` split (§5).
2. `registry.ts` swaps the static `content: XXX_PACK` field for an **async loader keyed by `RoomMeta.contentRef`** (the seam the comment already names): `loadPack(contentRef) → R2.get(...).json()`, cached per `{packId,version}` (immutable, so cache-forever).
3. `init` is unchanged — it still receives a resolved `ContentPack`. The only new surface is the async fetch + a per-DO LRU of immutable packs.
4. Cutover is per-game (the registry is a map): migrate the largest packs first (`cinquante-cinquante` 173 KB, `quizz-culture-ge` 144 KB, `truth-or-dare-2` 126 KB) to reclaim the most bundle.

**Why this is safe:** R2 objects are immutable per version, so the loader needs no cache invalidation; the kill-switch (re-pin `version` in KV) is a different version = a different object = a different cache key. Replay determinism is preserved because the room's pinned `{packId,version}` resolves to the same immutable object on rehydration.

---

## 8. Content cadence: trend-decaying refresh (monthly, no deploy)

Some packs decay (the wave-2 doc names `gauche-ou-droite` e-scooters; trend-noun cards generally — the voice guide §1.11/§2 keeps trend nouns *in swappable pack content*, never in UI chrome, precisely so they can be refreshed). Decided cadence:

- **Monthly refresh for trend-decaying packs**, executed as pure Cadence B: re-author the decayed items → re-run stages 2–5 → **publish a new immutable pack version** → re-pin the KV `contentPackRef.version`. No `wrangler deploy`, no `eas update`, no schema change. The new pack appears at the next `/config` fetch (`max-age=60`).
- **Trend nouns live in pack content, evergreen structure lives in code/UI.** The voice guide enforces this split (`aura`, dating-deck nouns, meme references → pack; elisions/register/UI copy → hardcoded). A monthly refresh swaps only the swappable layer.
- **Refresh ≠ correction.** A monthly trend refresh and an emergency fact correction both produce a new version + re-pin; the only difference is urgency and which gate is load-bearing (voice/freshness for refresh, fact-check/leak for correction).
- **Old versions stay live for pinned rooms.** Because rooms pin for life, a refresh never disrupts an in-flight game; it only changes what *new* rooms draw.

---

## 9. The AI-packaging pipeline (future automation, same gate, no privilege)

The vision's "Claude API auto-packages a trending concept into a `game_config` + pack, flips a KV flag" is **a content-op automation, not a new code path** (template-arch §6). Decided constraints:

- It produces a `game_config` + `ContentPack` that pass the **identical** template-arch §6 gate a human's would: schema validation (`gameConfigSchema` + `templateParamsSchema`), content-pack schema + single-locale + sizing lint, profanity/safety scan (same `obscenity` filter players hit + an LLM-judge pass for hate/self-harm/sexual-minor), determinism/replay smoke with `leakedSecrets`, then the human playtest gate.
- **It can only configure a LIVE template** (the `template` must be in the server `REGISTRY` within `templateVersion` range) — the AI cannot invent a mechanic, only a pack + params.
- **The flag flip is the last step and is human-signed.** The automation writes R2 + KV at `enabled:false, rolloutPct:0`; a human promotes to 5% after the gate. No privileged path lets AI ship live content.

---

## Open product calls (with my recommendation)

1. **Persona-ensemble calibration ground truth for `cinquante-cinquante`.** The estimator must calibrate against "real published polls" — but for many confessional stems no published poll exists. *Recommendation:* accept a *consistency* standard over an *accuracy* one — the in-game frame is an explicit fictional crowd ("on a sondé 1 000 personnes"), so the bar is "plausible and internally consistent across the deck", with real polls used only where they exist. Budget one human calibration playtest per locale before B1 ships. **Needs a human sign-off on the trust standard.**

2. **Who owns the `quizz-culture-ge` fact-check, and at what SLA?** A viral wrong answer is the single biggest reputational risk in the pipeline (P0). *Recommendation:* a named human fact-checker signs off every answer pre-publish (no AI-only path), AND a public "report this fact" long-press → KV pack-kill path for the field. **Needs a staffing/ownership decision.**

3. **R2 migration timing.** We are at ~1.5 MiB inline vs a 2.1 MiB ceiling. *Recommendation:* migrate at the ~1.8 MiB trigger, which the first spicy-sibling family or the FR/EN split will cross — i.e. schedule the R2 loader as the immediate fast-follow to the locale split, not a someday item. **Needs a roadmap slot.**

4. **Per-locale value re-estimation cost.** Doubling every precompute (FR + EN independently) doubles the most expensive pipeline stage. *Recommendation:* accept the cost — it is load-bearing for fairness and the voice guide's transcreation law — but front-load only the 2 P0 games per-locale for B1 and let the P1 games (closeness, decoys, feasibility) re-estimate per-locale as their waves land (B2–C2). **Needs a budget acknowledgement.**

5. **Trend-refresh trigger: calendar vs signal.** Monthly is a calendar default. *Recommendation:* keep monthly as the floor, but add an analytics signal (item-level "seen %" / abandon spikes on stale trend cards) that can trigger an off-cycle refresh; both run the same Cadence-B publish. **Needs product to confirm monthly is the right floor.**

6. **`gauche-ou-droite` v2 `crowdPct` go/no-go.** The "what the internet thinks" beat is designed-but-deferred. *Recommendation:* defer to v2 as written; it reuses the cinquante-cinquante persona-ensemble path at zero new pipeline cost, so it is a content decision, not an engineering one. **Needs a v2 product call.**
