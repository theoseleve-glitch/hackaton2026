# Pires Potes / Worst Mates — Final Game Design (SHIPPED)

| Field | Value |
|---|---|
| **Game id** | `pires-potes` |
| **Names** | FR **Pires Potes** · EN **Worst Mates** |
| **Tagline** | FR « Chaque question désigne un coupable. Le pire pote gagne. » · EN "Every question points a finger. The worst friend wins." |
| **Template + mode** | `VOTE@1` — player-ballot designation voting (pure config on the `tracer` machinery, **zero game code**) |
| **Module instance** | `createTracer('pires-potes', PIRES_POTES_CONFIG)` |
| **Players** | **min 3** (catalog floor) · **max 16** — module floor is `minPlayers: 2` but 2-player voting is trivial (you can only pick the other person), so the catalog floors this game at 3 |
| **Spicy tier** | **1** — flagship `pires-potes` is `tone:'spicy'`, `minAge 18`, draws pack tiers 0+1; default-surfaced soft sibling is `tone:'classic'`, all-ages, tier-0 only |
| **Physical** | **seated** |
| **AI at runtime** | **None.** `needsOfflineAiPipeline: false` — items carry no pre-computed values; AI is optional offline drafting only |
| **Status** | **SHIPPED** — implemented, tested, playable on the `tracer` module (`packages/games/tracer/`) |

---

## 1. Pitch & room fantasy

**One-liner.** A "Qui serait capable de… / Who would…" accusation card lands on every phone at once; everyone secretly points one finger at one OTHER person in the room; the most-accused player "wins the shame card." Highest pile of shame after 7 rounds is crowned **Le Pire Pote / The Worst Mate**.

**Room fantasy.** This is the flagship *accusation engine* — maximum friend-exposure. Each card indicts a person *present* for a hyper-specific, plausible betrayal (the "arrives 40 minutes late to YOUR funeral, McFlurry in hand, and still beelines for the front row" register). The fun is the collective, simultaneous finger-point and the gasp/howl when the tally reveals who the table *really* thinks would do it. The manufactured argument is **"it's SO you"** vs **"that is NOT me"** — and because shame is reframed as a trophy (you *win* the card, the scoreboard *crowns* you), the table laughs with the accused instead of at them. Brand spine: **funny never cruel** — behaviour and choices only, never appearance/identity/trauma.

---

## 2. Shipped ruleset (AUTHORITATIVE)

All numbers below are quoted from `PIRES_POTES_CONFIG` in `packages/games/tracer/src/state.ts` and the reducer in `tracer.ts`.

```ts
export const PIRES_POTES_CONFIG: TracerConfig = {
  totalRounds: 7,
  voteMs: 20_000,
  revealMs: 7_000,
};
```

**Session shape.** 7 rounds × (20 s vote + 7 s reveal) ≈ **3 min** (~27 s/round), fitting the ad cadence + rematch loop. At `init`, `totalRounds` is clamped to `Math.min(7, shuffled.length)` so a small pack can never overrun.

### Phases (real `phaseKey` + `phaseDurationMs`)

| Phase | `phaseKey` | `phaseDurationMs` | Beat |
|---|---|---|---|
| **vote** | `vote:{round}` (e.g. `vote:0` … `vote:6`) | `config.voteMs` = **20 000 ms** | The round's designation card appears on every phone simultaneously. Each player taps exactly ONE other player. **Self-votes rejected** (`action.target === playerId` → same-state). **Re-vote allowed until lock** (last tap wins — `Object.assign` overwrites the voter's prior target). **Early-resolve**: phase ends the instant *every rostered player* has a vote recorded (`state.players.every(p => votes[p] !== undefined)` → `resolveReveal`). At the 20 s deadline, missing votes (passive/disconnected) are simply dropped. |
| **reveal** | `reveal:{round}` (e.g. `reveal:0`) | `config.revealMs` = **7 000 ms** | Instant tally on every phone: who got how many fingers. No player input. Auto-advances at the 7 s deadline to the next `vote` phase or to `over`. |
| **over** | `over` | `null` (untimed terminal) | Final podium crowns **Le Pire Pote**. Reducer is inert here (`if (state.phase === 'over') return { state, effects: [] }`). |

`phaseKey(state)` returns `over` when terminal, else `` `${state.phase}:${state.round}` `` — round-indexed so the client/tracer can distinguish each beat. **Round is 0-indexed internally** (`round: 0` at init; `over` fires when `round + 1 >= totalRounds`, i.e. after round index 6 = the 7th round).

### Scoring (exact constants)

From `resolveReveal` / `tallyVotes`:

- `tallyVotes` counts one point per cast vote, keyed to the target. Initialised to 0 for every roster player.
- `max = Math.max(0, ...counts)`.
- **Award rule:** `if (max > 0)` then **every** player whose count equals `max` gets **+1** (`scores[p] += 1`). Ties at max all score — **no revote** (speed over precision).
- **Zero-votes guard:** if no votes were cast (`max === 0`), nobody scores and the round still advances — never-block behaviour preserved.
- Score scale is integer shame-cards; over 7 rounds a player's max is 7 (rare; co-winners inflate totals in small rooms).

### Win / draw / tie

- **Win:** highest cumulative `scores` after 7 rounds is crowned. There is **no in-engine tiebreak** — the `gameOver` effect emits the raw `scores` map and `over` view exposes it; **final ties share the crown** ("co-Pires Potes"), resolved presentationally by the client.
- **No first-to-N** in v1 — fixed 7 rounds (see §4).

### Presence / disconnect

- `init` snapshots the roster into `state.players`; the reducer never adds/removes players mid-game (anonymous-forever, room-scoped).
- A vote from a non-roster `playerId` is rejected (same-state).
- **Vote phase** tolerates any number of missing voters: early-resolve needs all roster votes, otherwise the 20 s `deadline` calls `resolveReveal` on whatever was cast. A fully passive/disconnected room rolls forward to `over` on deadlines alone.
- **Reveal phase** needs zero input — disconnects are irrelevant; it always auto-advances.
- **UX requirement (not engine):** an all-timeout round (zero votes) must render a "personne n'a voté / nobody voted" beat so it doesn't read as a bug.

### Redaction (per-viewer)

The `view()` is server-authoritative and redacts the ballot:

- **`votes: Record<PlayerId, PlayerId>` is HIDDEN** — never serialised through `view()`. Who voted for whom is secret until (and even after) reveal.
- **Vote phase view** exposes only: `prompt`, `round`/`totalRounds`, `hasVoted` (boolean per player — *that* they voted, never *for whom*), `myVote` (the viewer's OWN target only, `state.votes[viewer] ?? null`), and running `scores`.
- **Reveal phase view** exposes the aggregate `tally` (count per player) + `scores` — but never the individual voter→target edges. You learn the room pointed 4 fingers at Sam; you never learn which 4.
- Prompts flow through `view()` **as-is** (`string | LText`) — the client picks the locale at render; the reducer never inspects prompt text.

### Ad interstitial

Fires **client-side** off the `phaseKey` transition to `over` (server-shell design) — never a reducer effect. The reducer's only `over` effect is `gameOver` with cloned scores; the rematch reuses the lobby with a **fresh seed** (pack re-shuffled at `init`, so a rematch draws different cards).

---

## 3. Content model

### Pack item shape (authoring master)

```jsonc
{
  "id": "pp-014",                       // stable id, e.g. "pp-NNN"
  "text": {                              // bilingual; ≤140 chars each; ALWAYS designates a person present ("Qui…"/"Who…")
    "fr": "Qui oublierait l'anniversaire de sa propre daronne, mais jamais un happy hour à -50 % ?",
    "en": "Who forgets their own mum's birthday but has never once missed a two-for-one happy hour?"
  },
  "spicy": 0,                            // 0 | 1 | 2 — item-level rating; an item may only ship in a pack whose tier ≥ its rating
  "tags": ["famille", "soiree"]          // optional; for curation + anti-pile-on variety balancing
}
```

The bilingual file is the **authoring master**. The publish step splits it into single-locale packs (`pires-potes-fr@N` / `pires-potes-en@N`, the one-pack-one-locale convention) and the **runtime data collapses to the VOTE module's existing `{ prompts: string[] }`** — `tracer` consumes it unchanged (`TracerContent.prompts`).

### What ships today (`content/packs/pires-potes.json`, version 1)

- **210 items total** (exceeds the ≥150/locale/tier launch target).
- **By tier:** **166 tier-0** (spicy 0) · **44 tier-1** (spicy 1) · **0 tier-2**.
- All 210 items are **≤140 chars in both FR and EN** (lint-clean). **No duplicate ids.**
- **18 distinct tags**, well-distributed: `absurde` 47, `chaos` 44, `ego` 42, `amour` 35, `drama` 34, `mensonge` 33, `soiree` 33, `bouffe` 24, `argent`/`voyage` 20, `reseaux` 17, `paresse` 15, `famille` 14, `trahison` 13, `tech` 8, `retard`/`sport`/`taf` 7. The `amour`-heavy items (exes, phone secrets, dating) are concentrated in the spicy-1 band (pp-081…pp-120) — exactly the 18+ flagship's edge.
- **AI-precomputed offline:** **none** — items are static text; nothing AI runs at gameplay time. AI-assisted *drafting* (offline, behind the human gate) is the recommended path to bilingual volume but is not in the runtime.

### Voice / tone note (voice-guide §5.3)

> **Maximum friend-exposure; the flagship accusation engine.** Every card indicts a person present for a hyper-specific plausible betrayal (the funeral-McFlurry register). **Shame is the trophy — winning copy crowns, never consoles.** Behaviour and choices only, **never appearance/identity/trauma** (this game is the closest to the bullying line — the adversarial check applies to *every* card). The 18+ flagship goes harder on exes, money treason and phone secrets; the soft sibling keeps the same *violence of specificity* with clean topics.

---

## 4. RESOLVED DECISIONS

Every former defer / v2 / open-question / spicy / host-tunable bullet (from §2.3 italics + by-game `recommendations[]`) resolved to a FINAL ruling.

| # | Was (open question / defer) | FINAL decision | One-line spec / why |
|---|---|---|---|
| 1 | **Name** — pick 2-3 FR candidates distinct from "Amis de merde" | **Ship v1: "Pires Potes" (EN "Worst Mates").** | Matches the id, alliterative, lexically distant from the trademark; alternates "Potes Pourris"/"Sales Potes" archived. |
| 2 | **Win condition** — original is "first to 5 cards" | **Ship v1: fixed 7 rounds, highest score wins.** **Roadmap v2:** optional `targetScore` param (VOTE@2) for a faithful "first to 5" classic mode. | First-to-N is unbounded (16-player room → 20+ rounds); fixed 7 = ~3 min, fits ad cadence. The classic mode is a small additive reducer branch, not a launch blocker. |
| 3 | **Rotating card-drawer turn** (from the physical game) | **Cut.** | Card shows on all phones simultaneously every round; everyone votes at once. A rotating active player could stall the room (violates never-block); simultaneous is strictly faster and faithful. |
| 4 | **Tie at max votes** — revote or split? | **Ship v1: all tied at max get +1, no revote** (exact tracer behaviour). | Deterministic, zero extra phase, keeps rounds ~27 s. The drama is WHO got designated, not tiebreak bookkeeping. |
| 5 | **Reveal style** — instant or flip-one-by-one? | **Ship v1: instant.** **Roadmap v2:** A/B `revealStyle:'flip-one-by-one'` once the VOTE@2 param lands (already specced for Pass the Bloop). | Instant keeps rounds <30 s; flip adds ~5-8 s/round drama — test as a config flip, not a launch dependency. |
| 6 | **Edgy tone vs brand + age gating** | **Ship v1: TWO sibling configs** — `pires-potes` (spicy, 18+, tiers 0+1) + `pires-potes-soft` (classic, all-ages, tier-0 only). See §5. | Schema forces `tone:'spicy' ⇒ minAge≥18`; sibling configs are the platform's standard tiering pattern (one KV edit each, no code). |
| 7 | **Param surface gap** — `voteMs`/`revealMs` in module Config but not in `templateParamsSchema(VOTE)` | **Roadmap v2:** grow `templateParamsSchema(VOTE)` with optional `voteMs` (5000-60000) + `revealMs` (3000-15000). | The module **already reads** `config.voteMs`/`config.revealMs`, so `PIRES_POTES_CONFIG` (20 000 / 7 000) ships correctly today via the factory — the schema growth only unlocks *host*-tuning. No reducer change. |
| 8 | **Pack sizing & authoring path** | **Shipped: 210 cards (166 t0 + 44 t1), >150 target met, shuffled at init, `totalRounds` capped at pack size.** Offline AI drafting allowed behind the §6 gate. | 7 rounds/game with rematch burns cards fast; 210 gives ~30 rematches before visible repeats. Nothing AI runs at gameplay time. |
| 9 | **Copyright / trade-dress** (risk → action) | **Ship v1 with hard rule: zero text reuse from "Amis de merde" + a similarity audit of the published deck pre-launch.** | Mechanic (vote-to-designate) is unprotectable, but card TEXTS and the name are — keep name/logo/card visual design clearly distinct. Audit is a content-ops gate, not a code change. |
| 10 | **Pile-on / bullying** (risk → mitigation) | **Ship v1: comedic-WIN framing + tag-enforced variety + "funny never cruel" lint + per-pack KV kill switch.** | Every designation is a +1 "shame card" with a celebratory sticker; the adversarial check runs on every card; the §5.3 rule (behaviour/choices only, never appearance/identity/trauma) is enforced at authoring. |
| 11 | **Small-room ties** (3-player floor) | **Ship v1: accept score inflation; copy celebrates co-winners.** | With 3 players, frequent max-ties mean multiple players score/round and the final crown ties more often — acceptable; the crown copy must support shared "co-Pires Potes". |
| 12 | **All-timeout round reads as a bug** | **Ship v1: client renders a "personne n'a voté / nobody voted" beat.** | The engine correctly advances (max=0 guard); the UI must explain it so it doesn't look broken. Pure client copy. |
| 13 | **Localization** — translate vs transcreate | **Ship v1: transcreated, not translated** — native-quality pass per locale before the publish-time split. | A literal EN of a French "photo dossier" joke falls flat; the bilingual master gets a per-locale native pass (already done across the 210 shipped items, e.g. £/£300 anglicised amounts in EN). |

No item left as "TBD".

---

## 5. The 18+ spicy sibling config (concrete)

This game **warrants a spicy tier** — it's the closest to the bullying line and the original's bite (exes, money treason, phone secrets) is its whole appeal for adult groups. The platform pattern is **two sibling configs on the same `tracer` machinery**, differentiated purely by KV catalog config + which pack tiers are drawn. **No game code changes** between siblings.

| Knob | `pires-potes` (FLAGSHIP, 18+) | `pires-potes-soft` (default tile) |
|---|---|---|
| `tone` | `'spicy'` | `'classic'` |
| `minAge` | **18** (forced by `tone:'spicy' ⇒ minAge≥18`; self-attested age gate) | none (all ages) |
| Pack tiers drawn | **0 + 1** (all 210 items; the 44 spicy-1 amour/argent/phone-secret cards in play) | **0 only** (the 166 tier-0 items) |
| Source pack family | `pires-potes-fr@N` / `pires-potes-en@N` (the published split) | same family, **tier-filtered at publish** into `pires-potes-soft-fr@N` / `-en@N` (a tier-0 subset of the same authoring master) |
| Catalog surfacing | shown only on age-verified / 18+-attested devices | **default-surfaced tile** for unverified-age devices (store-compliance: keeps spicy content behind the gate) |
| Mechanic (phases/scoring/timers) | **identical** — `PIRES_POTES_CONFIG` (7 × 20 s/7 s), same redaction, same resolver | **identical** |
| Kill switch | per-pack KV kill switch (region-wide disable without deploy) | per-pack KV kill switch |

**Concrete config diff** (KV catalog entries; no `.ts` change):

```jsonc
// pires-potes  (flagship)
{ "module": "pires-potes", "tone": "spicy", "minAge": 18,
  "packFr": "pires-potes-fr@1", "packEn": "pires-potes-en@1" }     // tiers 0+1

// pires-potes-soft  (default tile)
{ "module": "pires-potes", "tone": "classic", "minAge": null,
  "packFr": "pires-potes-soft-fr@1", "packEn": "pires-potes-soft-en@1" } // tier-0 subset
```

**Current ship-state note / content-ops action:** the runtime pack `content/packs/pires-potes.json` is a **single mixed-tier authoring master** (166 t0 + 44 t1). The publish-time tier split that produces the `-soft` packs is a **content-ops step, not yet emitted as separate files**. The `spicy: 0|1|2` field on each item is the mechanism (an item ships only in a pack whose tier ≥ its rating); whether a tier-1 card is ever *drawn* is a runtime catalog gate, not a pack property. **Action before the soft sibling goes live: run the publish split + similarity audit.** No spicy-2 content exists or is planned (this game tops out at tier-1 — sexual-explicit content belongs to truth-or-dare-2/truth-or-drink, not an accusation game).

---

## 6. Host-tunable params (lobby allowlist)

Until `templateParamsSchema(VOTE)` grows (decision #7), the shipped truth is the factory config — host-tuning of timers is **roadmap v2**. The final allowlist for THIS game:

| Param | Range / values | Default | Status |
|---|---|---|---|
| `totalRounds` | 5-10 (capped at pack size) | **7** | Ship v1 (already a config field; clamped to `Math.min(n, packSize)`). |
| `tone` / spicy toggle | `classic` ↔ `spicy` (= soft-sibling ↔ flagship, age-gated) | `classic` on unverified devices | Ship v1 (catalog/sibling switch; 18+ requires age attestation). |
| `voteMs` | 5 000-60 000 ms | **20 000** | Roadmap v2 (module reads it; needs `templateParamsSchema(VOTE)` to expose to host). |
| `revealMs` | 3 000-15 000 ms | **7 000** | Roadmap v2 (same gate as `voteMs`). |
| `revealStyle` | `instant` \| `flip-one-by-one` | `instant` | Roadmap v2 (VOTE@2). |
| `debateMs` | n/a | — | Cut for this game — no debate phase in a designation game (it would double round length; the vote IS the game). |

**Safe-range rationale:** `totalRounds` floored at 5 keeps a session ≥ ~2 min (worth an ad); capped at 10 keeps it TikTok-native. Timer ranges mirror the proposed `templateParamsSchema(VOTE)` bounds so the flagship's 20 000/7 000 sits comfortably inside.

---

## 7. Future modes roadmap (v2 / v3)

| Mode | Decision | One-line spec |
|---|---|---|
| **Classic "first to 5"** | **Roadmap v2** | Add optional `targetScore` (VOTE@2); when set, the resolver ends the game when any player reaches N shame-cards instead of after fixed rounds — faithful to the physical original. |
| **Flip-one-by-one reveal** | **Roadmap v2** | `revealStyle:'flip-one-by-one'` reveals tallies player-by-player for drama (+~5-8 s/round); A/B against `instant`. Param already specced for Pass the Bloop. |
| **Host-tunable timers** | **Roadmap v2** | Expose `voteMs`/`revealMs` via `templateParamsSchema(VOTE)` (module already consumes them) — pure protocol-schema addition. |
| **Remote / online rooms** | **Roadmap v2 (platform-level)** | Same reducer, zero realtime-layer change (server-authoritative DO + per-viewer redaction already supports it) — no game work. |
| **"Predict the verdict" layer** | **Roadmap v3 (evaluate)** | Optional pre-reveal "guess who the room picked" sub-bet (à la tu-preferes prediction). Decided as v3 evaluate, not committed — it changes the phase shape and risks slowing the 27 s loop; only ship if metrics show players want a second beat. |
| **Themed packs** (festival / couples / colleagues) | **Roadmap v2 (content-only)** | New pack families on the same module (tag-curated subsets), e.g. `pires-potes-taf` from the `taf`/`reseaux` tags — zero code, one KV catalog entry each. |
| **Debate phase** | **Cut** | A designation game's fun is the instant collective point; a debate phase doubles round length for no decision gain. |
| **Spicy-2 (explicit) tier** | **Cut** | This game tops out at tier-1; sexual-explicit content belongs to the truth-or-dare/drink family, not an accusation engine. |

---

## 8. Risks & content-ops notes

**Content-ops / pack lint**
- **Pack sizing lint:** ✅ shipped pack is **210 items** (target ≥150/locale/tier met); **166 tier-0** supports the soft sibling on its own (>150). **All 210 ≤140 chars FR+EN, no duplicate ids** — lint-clean. `totalRounds` (7) ≪ pack size, so no overrun risk; clamp present anyway.
- **Tier split not yet emitted:** the runtime file is a single mixed-tier master. **Before the soft sibling goes live**, run the publish split → `pires-potes-soft-{fr,en}@1` (tier-0 subset) + `pires-potes-{fr,en}@1` (full) and wire both KV catalog entries.
- **Similarity audit (blocking pre-launch):** run a text-similarity audit of all 210 cards against the published "Amis de merde" deck — the mechanic is unprotectable but card TEXTS and the name are. Keep name/logo/card visual design clearly distinct. (Spot-check confirms original writing — e.g. anglicised amounts, transcreated jokes — but the audit must be run before publish.)
- **Freshness / decay:** 7 cards/game × rematch loops burn the deck fast; 210 cards ≈ 30 rematches before visible repeats per session group. Plan content drops (themed packs, decision #6 v2) and rotate by `tags` to avoid the same card resurfacing in back-to-back rematches.

**Moderation surface (highest of any wave-2 game)**
- **Pile-on / bullying** is the headline risk: a designation game can dogpile one player all session. Mitigations *shipped*: comedic-WIN framing (+1 "shame card" + celebratory sticker, scoreboard crowns the "winner"), tag-enforced variety (absurd/flattering-negative mix), the §5.3 hard rule (behaviour/choices only — **never appearance/identity/trauma**), and a per-pack **KV kill switch**. The adversarial "funny never cruel" check applies to **every** card in the §6 gate — this game is the closest to the bullying line.
- **Spicy compliance:** the flagship is `tone:'spicy' ⇒ minAge 18`, behind a self-attested age gate; store review may still flag dark humour, so the **soft sibling is the default-surfaced tile** for unverified-age devices. Per-pack kill switch lets us pull a region without a deploy.
- **Small-room dynamics:** 3-player rooms tie frequently (multiple +1s/round) — score inflation accepted, crown copy must celebrate **co-Pires Potes**.
- **Disconnect / all-timeout edge:** zero-votes round advances with nobody scoring (correct never-block) — UI must show the "personne n'a voté" beat so it doesn't read as a bug.
- **Localization integrity:** humor is transcreated not translated; any future pack drop needs a native-quality pass per locale before the publish-time single-locale split.
