# Meta-03 — Spicy Content-Rating & Age-Gate System (FINAL, DECIDED)

| Field | Value |
|---|---|
| **Domain** | `spicy-agegate` — the platform-wide content-rating + age-gate + report + kill-switch system |
| **Status** | **FINAL / DECIDED.** This is the binding cross-game spec. No TBD; open *product* calls (with my recommendation) are isolated at the bottom. |
| **Grounds in** | `2026-06-12-content-voice-guide.md` §3 (the HARD FLOOR + the spicy-tier ladder); `2026-06-10-cross-game-synthesis.md` §3.1/§3.2 (pack envelope, kill switch); `2026-06-10-template-architecture.md` §2 (`gameConfigSchema`, `tone`/`minAge`/`enabled` refinement) + §4.3 (kill switches, rollout); `2026-06-10-server-shell-design.md` §3.4 (profanity boundary), §4.3 (ad off `phaseKey`), §8/mobile §8 (report endpoint); `2026-06-10-mobile-design-system.md` §A11y; and all 18 shipped per-game final designs (`docs/designs/final/games/*.md`). |
| **Platform invariants honored** | Fully anonymous forever (no accounts, no server profiles); ads-only; CF Durable Objects + KV config + R2 packs; pure-TS GameModule (no runtime AI, no wall-clock/ambient-RNG); ad interstitial fires CLIENT-SIDE off the `phaseKey → over`/`scoreboard:*` transition; cross-game XP is placement-based. |

---

## Decisions (the short list)

1. **One uniform 3-tier rating model, applied to every item and every pack: `spicy 0` (safe / clean-hands), `spicy 1` (taboo-adjacent), `spicy 2` (18+ explicit).** The item-level field is `spicy: 0|1|2`; the catalog-level field is `tone: 'classic' | 'spicy'` where `tone:'spicy' ⇒ minAge ≥ 18` (schema-enforced refinement, template-arch §2). `tone` is the coarse store/age gate; `spicy` is the fine per-item rating a pack may draw up to its ceiling. **A pack's tier ceiling = max item `spicy`; an item ships only in a pack whose ceiling ≥ its rating.**
2. **The 18+ surface is ALWAYS a SEPARATE sibling `game_config` + SEPARATE pack ids — never a tier toggle inside a family-safe tile, never a mixed pack at runtime.** Zero new game code per sibling: a sibling differs only by KV catalog metadata (`tone`/`minAge`/`enabled`/`rolloutPct`) + which `contentPackRef` (and, for the tiered modules, `allowedIntensities`) it draws. This is the platform's standard tiering pattern (confirmed verbatim across pires-potes §5, tod-lover §5, truth-or-drink §5).
3. **Exactly 4 of the 18 catalog families get an 18+ (`tone:'spicy'`, `minAge 18`) sibling that ships at/near launch** — the *intimacy/exposure* games: `truth-or-dare-lover`, `truth-or-drink`, `pires-potes` (flagship is itself the 18+ member), `devine-l-action-spicy`. Three more (`tu-preferes-spicy`, `cinquante-cinquante-after-dark`, `mime-inverse-spicy`) are decided-but-deferred 18+ siblings (Roadmap v1.x, content-ops only). The remaining 11 are **spicy-0-only at every horizon** (reasoned cuts, §3). A 12th, `trouvez-la-regle-spicy`, is a **taboo-adjacent spicy-1 / `minAge 17`** sibling (NOT 18+) — the one non-18+ age-bumped tier on the platform.
4. **Age-gating under anonymous-forever = self-attestation + a per-device persisted flag.** A one-time, on-device, store-compliant date-of-birth / "Are you 18+?" attestation (no name, no account, no server write) sets a device-local `ageVerified18` flag + the derived `attestedMinAge`. The shell NEVER stores age; the gate is purely client-side surfacing + a server-side defense-in-depth `enabled`/region recheck at `startGame`.
5. **Two unlock economies for spicy, and they are orthogonal and BOTH required for the hardest tier.** `minAge` (the legal gate) is satisfied by attestation. *Access* to spicy packs is then either (a) **rewarded-video unlock** (per-pack, watch one rewarded ad → unlock that spicy pack for the session/device) for the first spicy pack, or (b) the **£1.99 Night Pass** (removes the rewarded-video step for all spicy packs for the device, plus removes the between-games interstitial for the pass window). The age gate is a precondition to *both*; the rewarded/pass is the monetisation layer on top.
6. **Store-policy HARD FLOOR (voice-guide §3) is encoded as a blocking offline authoring lint that runs on EVERY item at EVERY tier** — no protected-trait punching, no real private individuals (celebrities only as non-sexual/non-criminal absurd yardsticks; no real politicians ever), nothing sexual near minors, no incitement to real harm, no rape/assault played straight, punch-at-behaviors-not-identities. The lint plus the adversarial "worst-possible-hands" check are a publish gate; nothing reaches a client without passing.
7. **Alcohol (truth-or-drink) gets its own store-policy sub-floor:** every forfeit is one-sip phrasing only (chug / «cul sec» / escalation wording is lint-rejected), answering is always available, a persistent water/no-driving lobby footer is always-on, the platform NEVER auto-assigns a drink to an absent/passive player, and the safe `truth-or-forfeit` sibling is the default-surfaced under-18 path. Region flags can suppress the drink tile entirely in stricter markets.
8. **Sexual-content ceiling is `spicy 2` and is structurally capped at "suggestive, partner-directed, room-judgeable" by the verdict mechanic** — never explicit-in-front-of-the-room, never degrading/coercive, never contact with non-partners, everything skippable. No `spicy 3` / explicit tier exists or is planned.
9. **The long-press REPORT flow is the universal moderation entry point**, keyed by a stable content id (`prompt.id` / `item.id` / pack-relative card id) that is already on-device in the view — never by player identity. A report POSTs to the existing report endpoint (mobile §8); it carries the content id, pack id+version, game id, and a category — never a nickname, never the room transcript.
10. **The KV content kill-switch is the deploy-free region-wide remediation.** Two granularities, both one KV edit, no deploy (synthesis §3.2, template-arch §4.3): (a) `enabled:false` on a `game_config` pulls the whole tile (hidden + `startGame` → `UNKNOWN_GAME`); (b) a **per-card `blocklist`** in the catalog (`contentPackRef.blocklist: string[]` of content ids) suppresses an individual bad card region-wide without re-publishing the pack. Live rooms finish on their pinned pack version (replay determinism); only NEW rooms see the change.

---

## 1. The unified content-rating model

### 1.1 The three tiers (uniform across all 18 games)

The tier ladder is the voice-guide §3 ladder, applied as the single rating axis platform-wide. There is no fourth tier and no per-game variant of the scale.

| Tier | `spicy` | `tone` | `minAge` | What it contains (voice-guide §3) | Age gate? | Store posture |
|---|---|---|---|---|---|---|
| **0 — safe / clean-hands** | `0` | `classic` | `0` | Teasing, designation, social embarrassment, petty betrayal, absurd/cartoon violence hyperbole (zombies, -1000 aura), hess/family/food crimes, bite-y elimination copy. **No innuendo, no substances.** | No | Default-surfaced; store-safe everywhere |
| **1 — taboo-adjacent** | `1` | `classic` (item-level), or `spicy` if the pack ceiling is 18+ | `0` (taboo-adjacent ≠ 18+) **or** `17` (one case) | Dating/ex material, implication-heavy innuendo (the player's brain finishes it), phone-stakes exposure as *hypotheticals/confessions*, gossip engines, light party-alcohol as scenery. **Screenshot-clean text, socially-radioactive answers.** | Opt-in toggle (no legal gate by default) | Generally store-safe; reviewers touchier on dating frankness in EN |
| **2 — 18+ explicit** | `2` | `spicy` (forced) | **18** (schema-forced) | Direct sexual frankness as table stakes (body count, raunchiest text), drinking forfeits (one-sip only), ken-tier FR vulgarity. **Still wins on specificity, not anatomy.** | **Yes — self-attestation + device flag** | Behind age gate + region flags; the storefront-rating gate |

**Critical nuance (decided):** `spicy 1` is NOT automatically age-gated. Taboo-adjacent is, by design, screenshot-clean — it earns an *opt-in toggle* (a "spicier cards" switch in the lobby/pack picker), not a legal 18+ gate. Only `tone:'spicy'` (which the schema forces to `minAge ≥ 18`) triggers the age gate. The one deliberate exception is `trouvez-la-regle-spicy` at `minAge 17` (tier-1 social rules, age-bumped but not 18+) — see §3.

### 1.2 Where the rating lives (the data, end-to-end)

- **Item:** `spicy: 0|1|2` on every authored entry (already shipped on every pack item: tracer prompts, TodPromptEntry, completions, objects, etc.). This is **authoring/catalog metadata; most modules DROP it at build** (it never reaches the reducer — pires-potes collapses to `{prompts:string[]}`, tod drops `spicy`/`minAge`). The rating governs *which pack an item may ship in*, not runtime behavior.
- **Pack:** `data.tone?: 'classic'|'spicy'` (synthesis §3.1 `PackDataBase`) — the pack's ceiling. The publish lint asserts `max(item.spicy) ≤ tone-implied-ceiling` (classic → 1, spicy → 2). Packs are single-locale (`<base>-<locale>`), so FR and EN are separate pack ids and re-rated independently.
- **Catalog (`game_config`, the source of truth, template-arch §2):**
  ```ts
  tone: 'classic' | 'spicy',          // default 'classic'
  minAge: 0..21 (default 0),          // refine: tone==='spicy' ⇒ minAge >= 18
  enabled: boolean,                   // the kill switch
  rolloutPct: 0..100,                 // staged rollout, bucketed on rotatable install UUID
  contentPackRef: { packId, version, blocklist?: string[] },  // blocklist = per-card kill (NEW, §5)
  spicyFeatureFlag?: string,          // server/region flag, default-OFF for 18+ tiles
  ```
- **The schema refinement is the single enforcement point:** `tone:'spicy' ⇒ minAge ≥ 18` is checked at config validation (`gameConfigSchema.superRefine`, template-arch §2.7). A spicy tile can never ship with `minAge < 18`. This is load-bearing and must never be relaxed.

### 1.3 The "spicy requested ≠ spicy played" rule (ToD §6, kept)

`params.allowedIntensities` (TRUTH_DARE / PERFORM_JUDGE) selecting `'spicy'` is a *request*; the tier only *plays* if the catalog tile is `enabled:true` AND the device passed the age gate AND (for the gated tiles) the region `spicyFeatureFlag` is ON. The default for every 18+ tile is `enabled:false` + `spicyFeatureFlag` default-OFF until product+legal sign-off. This is why a config can be authored, tested, and shipped dark, then flipped live by one KV edit.

---

## 2. The sibling-config pattern (zero new code per 18+ tile)

The platform NEVER mixes a family-safe tile and an 18+ tier in one catalog entry. Every spicy surface is a **separate sibling `game_config` + separate pack ids** on the **same shipped module**, differing only in KV metadata. This is confirmed identical across the three shipped 18+ designs and is hereby the binding cross-game pattern.

### 2.1 The canonical sibling diff (what changes, what never changes)

| Knob | Safe tile | 18+ sibling | Notes |
|---|---|---|---|
| `tone` | `classic` | `spicy` | forces `minAge ≥ 18` |
| `minAge` | `0` (or 13 where a softer floor is wanted) | **18** | self-attested device gate |
| `contentPackRef.packId` | `<base>-<locale>` | `<base>-spicy-<locale>` (or `<base>-lover-`, `<base>-drink-`) | **separate R2 pack ids — never co-mingled** |
| `allowedIntensities` (tiered modules only) | e.g. `['soft','party']` | e.g. `['party','spicy']` | drives the draw filter at `init` |
| `enabled` | `true` | `false` until legal sign-off | the kill switch is the launch gate |
| `spicyFeatureFlag` | — | `spicy.<tile>` (region/server, default-OFF) | region suppression |
| `rolloutPct` | `100` | `5` → `100` staged | bucketed on rotatable UUID |
| Catalog surfacing | default tile | hidden on un-attested devices, behind age gate | |
| **Module / phases / scoring / timers / redaction** | **identical** | **identical** | **zero game code; the reducer is byte-untouched** |

**Cost of any 18+ sibling = one KV config entry + one (or one-per-locale) R2 pack.** The only ever code add seen across all designs is `tu-preferes`'s ~0.5-day `publicPicks:false` view-redaction flip (anonymizing names on spicy picks) — and that is a generic, pre-scoped view param, not per-game logic.

### 2.2 The full 18-game spicy cross-reference (DECIDED)

The 18 catalog families = the 17 wave-2 games + `the-impostor` (wave-1 flagship, its own tile alongside `double-jeu` on SECRET_ROLE). Cross-referenced against each game's final-design §5 ruling.

| # | Game (catalog family) | Module | Default tier | 18+ (`tone:'spicy'`) sibling? | When | Reasoned ruling source |
|---|---|---|---|---|---|---|
| 1 | `pires-potes` | VOTE/tracer | **flagship IS 18+** (tone spicy, minAge 18, tiers 0+1) + `pires-potes-soft` (tier-0 default tile) | **YES — the flagship** | **Launch** | pires-potes §5 (closest to bullying line; exes/money/phone secrets warrant it; tops out tier-1, no tier-2) |
| 2 | `truth-or-dare-2` (FUN) | TRUTH_DARE | tier-1 (soft+party, no spicy entries, minAge 13) | **YES — `truth-or-dare-lover`** (party+spicy, minAge 18, 2–8) | **Launch (lover `enabled:false` pending legal)** | tod-2 §5 (the lover ambiance is the whole reason the 2nd deck exists; 18+ inherent) |
| 3 | `truth-or-drink` | TRUTH_DARE@2 | **IS 18+** (tone spicy, minAge 18, sip forfeits) + `truth-or-forfeit` (all-ages gage sibling, default tile) | **YES — the alcohol tile itself** | **Launch (gated, legal sign-off)** | truth-or-drink §5 + §1.7 alcohol sub-floor |
| 4 | `devine-l-action` | PERFORM_JUDGE `guided` | tier-0 (soft+party) | **YES — `devine-l-action-spicy`** (spicy-only, minAge 18) | **Launch-adjacent (v1.x, ship-later, pure config)** | devine-l-action §5 (physical dares escalate; Extra-Dirty demand) |
| 5 | `tu-preferes` | VOTE@2 | tier-0 | **YES — `tu-preferes-spicy`** (minAge 18, `publicPicks:false`) | **Roadmap v1.x** (needs ~0.5-day anon-reveal flip) | tu-preferes §5 |
| 6 | `cinquante-cinquante` | INPUT_GUESS `crowd-target` | tier-0 | **YES — `cinquante-cinquante-after-dark`** (minAge 18, spicy completions) | **Roadmap v1.x** (content-only) | cinquante-cinquante §5 |
| 7 | `mime-inverse` | PERFORM_JUDGE `puppet` | tier-0 | **YES — `mime-inverse-spicy`** (tier-1, minAge 18, consent framing) | **Roadmap v2** (content-only) | mime-inverse §5 |
| 8 | `trouvez-la-regle` | RULE_HUNT | tier-0 | **TIER-1 only — `trouvez-la-regle-spicy`, `minAge 17`** (NOT 18+) | **Roadmap v2 (optional, demand-gated)** | trouvez-la-regle §5 (performance-comedy; social rules at tier-1) |
| 9 | `gauche-ou-droite` | VOTE@2 | tier-0 | **NO at launch** — v2 demand-gated sibling (`anonymousVotes:true`, minAge 18) if ever authored | v2 demand-gated | gauche-ou-droite §5 (sex is orthogonal to the class-pettiness joke) |
| 10 | `quizz-culture-ge` | INPUT_GUESS `closest-number` | tier-0 | **NO** — Roadmap v3 / on-demand only | v3 on-demand | quizz-culture-ge §5 |
| 11 | `double-le-mouvement` | PERFORM_JUDGE `rate` | tier-0 (`['safe']`) | **YES (content-ops only)** — `double-le-mouvement-spicy` pack via `allowedIntensities`, minAge 18 | **Roadmap (ship-when-authored)** | double-le-mouvement §5 |
| 12 | `devine-l-objet` | PERFORM_JUDGE `credit` | tier-0 | **NO (reasoned cut)** — mime-an-object has no intimacy payload; physical IRL mime + 18+ object = moderation/safety landmine | Never (as a toggle) | devine-l-objet §5 |
| 13 | `jeu-de-la-note` | SPOTLIGHT_GUESS `scale` | tier-0 | **NO (reasoned cut)** — talk beat is player-authored; adult pack adds no mechanic, no lift | Never | jeu-de-la-note §5 |
| 14 | `devine-la-question` | SPOTLIGHT_GUESS `reverse-question` | tier-0 | **TIER-1 only** — `devine-la-question-spicy` (spicy-1, **no age gate**, opt-in toggle) | Roadmap v2 | devine-la-question §5 (taboo-adjacent, not 18+) |
| 15 | `jeu-du-theme` | LAST_STANDING | tier-0 | **YES** — `jeu-du-theme-18` (spicy theme pack, minAge 18) | **Roadmap v1.x** (content + pack, no code) | jeu-du-theme §5 |
| 16 | `double-jeu` | SECRET_ROLE@2 | tier-0 | **NO (reasoned cut)** — odd-one-out paranoia has no intimacy axis; `spicyLevel` axis kept live for future packs | Never (as a toggle) | double-jeu §5 |
| 17 | `loup-garou` | NIGHT_DAY | tier-0 | **NO** — voice-guide §5.17: werewolf is the one game with NO roast/slang/spicy register (atmosphere only) | Never | wave2 §2.17 + voice-guide §5.17 |
| 18 | `the-impostor` | SECRET_ROLE | tier-0 (word pairs) | **NO** — deduction word-pairs carry no spicy payload | Never (as a toggle) | impostor design (no spicy surface) |

**Summary of who gets an 18+ (`minAge 18`) sibling:**
- **Launch / launch-adjacent (4):** `pires-potes` (flagship), `truth-or-dare-lover`, `truth-or-drink`, `devine-l-action-spicy`.
- **Decided 18+ but deferred (5, v1.x/v2 content-ops):** `tu-preferes-spicy`, `cinquante-cinquante-after-dark`, `mime-inverse-spicy`, `jeu-du-theme-18`, `double-le-mouvement-spicy`.
- **Tier-1 age-bump only (2):** `trouvez-la-regle-spicy` (minAge 17), `devine-la-question-spicy` (no gate, opt-in).
- **Reasoned NO-spicy (7):** `gauche-ou-droite` (v2 demand-gated, not committed), `quizz-culture-ge` (v3 on-demand), `devine-l-objet`, `jeu-de-la-note`, `double-jeu`, `loup-garou`, `the-impostor`.

This matrix is the authoritative answer to "which of the 18 games get a sibling": **9 warrant an 18+ sibling** (4 now + 5 deferred), **2 get a tier-1 age-bump**, **7 are correctly spicy-0-forever**.

---

## 3. Why the cuts are principled, not lazy

The voice-guide §3 thesis is that *prudishness, not explicitness, reads as AI-written* — and that edge at every tier comes from **exposure, conflict, and hyperbole**, not from coyness or cruelty. That cuts both ways: a game whose comedy engine is already maxed at tier-0 (clean-hands but punchy) gains nothing from an 18+ tier except moderation risk. The reasoned cuts apply one test: **does this game have an intimacy/exposure payload that an 18+ tier would sharpen?**

- **YES → warrants a sibling:** truth-or-dare (lover), truth-or-drink (alcohol+sex), pires-potes (exposure), tu-preferes (dilemmas can go sexual), cinquante-cinquante (confessions), mime-inverse / devine-l-action / double-le-mouvement (physical dares escalate), jeu-du-theme (themes can be adult).
- **NO → spicy-0 forever:** gauche-ou-droite (the joke is class-coded objects; sex is orthogonal), quizz-culture-ge (trivia), devine-l-objet (mime-an-object has no intimacy; +IRL physical mime of an 18+ object is a safety landmine), jeu-de-la-note (talk beat is already whatever the room says), double-jeu / the-impostor (deduction, no intimacy axis), loup-garou (atmosphere-only by editorial law).

This is the decided rationale; do not re-open it per game without re-running this test.

---

## 4. Age-gating under anonymous-forever

### 4.1 The constraint and the shape

Anonymous-forever means **no account, no server profile, no server-side age record** (platform invariant; room SQLite is TTL-wiped). Age verification can therefore only be **self-attestation persisted on the device**. This is store-acceptable for 17+/18+ content (Apple/Google both accept on-device age attestation for self-rated content) and is the only shape compatible with the identity rule.

### 4.2 The mechanism (DECIDED)

1. **Trigger.** The age gate is triggered the first time a device tries to surface or start ANY `tone:'spicy'` (`minAge ≥ 18`) tile — lazy, never at app install (don't gate the family-safe app behind a DOB wall).
2. **Attestation UI.** A single modal: a neutral date-of-birth entry (store-preferred over a yes/no for 18+ per Apple guidance) OR, where DOB is heavier than needed, an explicit "I confirm I am 18 or older" with the consequence stated. WCAG-AA, 44pt targets, reduced-motion-safe (mobile §A11y). Copy is deadpan, not coy (voice-guide §1.8): "this section is 18+. confirm your age. we don't store it."
3. **Persistence.** On pass, write a **device-local** flag only:
   ```ts
   // expo-secure-store / MMKV, on-device ONLY — never sent to the server as identity
   { ageAttested: true, attestedMinAge: 18, attestedAt: <epoch>, rotatableInstallUuid: <uuid> }
   ```
   The server NEVER receives the DOB and NEVER stores an age. The only thing the server sees is, at `startGame`, that the client *claims* eligibility — and the server's job is the `enabled`/region recheck (defense-in-depth), not age adjudication.
4. **Re-attestation.** The flag is sticky on the device. Clearing app data clears it (re-attest next time) — acceptable; this is self-attestation, not identity. The rotatable install UUID (spec §3, used for rollout bucketing) is the only cross-session handle and is explicitly NOT an identity.
5. **Surfacing.** Home filters the catalog client-side by `enabled && rolloutPct-bucket && minAge ≤ attestedMinAge && device-locale ∈ locales` (template-arch §4.2). An un-attested device simply never sees the 18+ tile (the safe sibling is shown instead — e.g. `truth-or-forfeit`, `pires-potes-soft`). This keeps spicy content *behind* the gate for store review, not merely one tap past a warning.
6. **Server defense-in-depth.** `startGame { configId }` re-checks `enabled`, `rolloutPct` bucket, and the region `spicyFeatureFlag` server-side (template-arch §4.3) — a tampered client that forces a spicy `configId` still gets `UNKNOWN_GAME` if the tile is dark or region-suppressed. Age itself is not re-checked server-side (it can't be, anonymously) — the legal posture is "self-attested, on-device, store-compliant," which is the accepted residual.

### 4.3 What the age gate is NOT
- Not an account check, not a login, not a server write of any PII.
- Not a substitute for the HARD FLOOR — the gate decides *who sees* spicy content; the §6 lint decides *what spicy content can exist*. Both are required.

---

## 5. The rewarded-unlock vs Night-Pass gate

These are the **monetisation** layer, stacked on top of the (free) age gate. Order of gates for a spicy pack: **age-attested → (rewarded-video OR Night Pass) → play.** Per the brand book monetisation rules: rewarded-video unlocks spicy packs; £1.99 "night pass"; AdMob + UMP consent; NO ads during gameplay; interstitial between games skippable after 5s.

| Surface | Trigger | What it unlocks | Persistence | Brand-book rule |
|---|---|---|---|---|
| **Rewarded-video unlock** | Tapping a locked spicy pack (after age gate) | That spicy pack, for the session/device | Per-device for the session (re-watchable; cheap) | "rewarded-video unlocks spicy packs" |
| **£1.99 Night Pass** | One-time IAP | ALL spicy packs unlocked (no rewarded step) + removes the between-games interstitial for the pass window | Device-local entitlement (anonymous IAP receipt, no account) | "£1.99 night pass" |

**Decided specifics:**
- The Night Pass is a **device-local entitlement** validated against the store receipt — no account, consistent with anonymous-forever. Losing the device loses the pass (acceptable; it's a cheap consumable-style unlock, not a subscription tied to identity).
- Rewarded video uses AdMob rewarded ads under UMP consent (brand book). It NEVER fires during gameplay — only on the lock-screen tap. The between-games interstitial remains the only in-session ad and stays client-side off the `phaseKey → over`/`scoreboard:*` transition (server-shell §4.3) — the spicy gate does not change the ad-fire model.
- The Night Pass's interstitial removal is **scoped to the pass window** so the ads-only base model is preserved for everyone else.
- **The age gate is free and always precedes both.** You can never buy your way past the legal floor; the pass/rewarded only removes the *paywall/ad* on packs you're already age-eligible for.

---

## 6. Store-policy specifics & the HARD FLOOR

### 6.1 The HARD FLOOR (voice-guide §3) — encoded as a blocking publish lint at EVERY tier

This is not advisory. The offline authoring/AI pipeline (§6 of every game design) runs these as **hard, blocking checks** on every item before a pack can be published. No item reaches a client without passing.

1. **No protected-trait punching.** Race, religion-as-people, sexual orientation, gender identity, disability, ethnicity, caste, immigration status — never the target, never the punchline. (Apple 1.1 + Google hate policy + brand.) The adversarial check: *"in the worst possible hands, could this be weaponized against a marginalized identity present?"* → rewrite or cut.
2. **No real private individuals.** Celebrities only as **non-sexual, non-criminal absurd yardsticks** ("qu'Etchebest te recracherait à la gueule" = fine; celebrity + sex/crime = defamation, banned). **No real politicians/parties/elections, ever** (the gauche-ou-droite editorial rule — the meme is about objects/behaviors, never politics).
3. **Nothing sexual near minors.** No exceptions; minors never placed adjacent to tier-1/2 content.
4. **No incitement to actual harm.** No real-device dares that post/send/dox, no consent-boundary dares, no self-harm framing, no "make the player do X to another person's body," **no excessive-drinking framing**.
5. **Punch at behaviors/choices/friends-in-the-room — never identities.** "Who would sell the group photo" (behavior) ✓; "Who's the [identity]" ✗.
6. **Rape/assault never played straight.** No displacement-onto-absurd-objects in-app (a print-culture artifact that does not survive store review).

### 6.2 Sexual-content ceiling (spicy 2)
- **Suggestive, partner-directed, room-judgeable; never explicit-in-front-of-the-room.** The verdict/room-judges-the-face mechanic (`lov-d-spicy-009`) is the *structural* cap — the explicit part never happens in front of the room, so the content tops out at suggestive. Never degrading/coercive, no contact with non-partners, everything skippable.
- **No `spicy 3` / explicit tier** exists or is planned (tod-2 §7, truth-or-drink §7 both cut it).

### 6.3 Alcohol (truth-or-drink) sub-floor — store compliance (Apple 1.4.3 / Google)
- `tone:'spicy'` + `minAge 18`, schema-enforced, behind the device age gate; under-18 devices see only `truth-or-forfeit`.
- **One-sip phrasing only**; authoring lint rejects chug / «cul sec» / quantity-escalation.
- Answering is always available (drinking never forced); the platform NEVER auto-assigns a drink to an absent/passive player (timeout/disconnect = 0, no forfeit drawn).
- Persistent **always-on** water/no-driving lobby footer.
- **Region flags** (`spicyFeatureFlag` + region suppression) hide the drink tile in stricter alcohol markets and promote the forfeit sibling there.
- **Product+legal sign-off is the hard launch gate** for the alcohol pack — a checklist item, not code.

### 6.4 Storefront rating
The existence of any `tone:'spicy'` tile in a 4+/Everyone-rated app **may force an app-store age-rating change**. This is a content-ops/legal gate run **before** building spicy packs, not after (tod-2 §4 #10, truth-or-drink §4 #7). The family-safe tiles ship unaffected. Spicy tiles ship `enabled:false` behind region flags until that verification passes.

---

## 7. The long-press REPORT flow + KV content kill-switch

### 7.1 Long-press report (the universal moderation entry point)

The brand book mandates "long-press to report a card." This is the single platform-wide UGC-safety affordance (the only "UGC" is authored card text + off-platform spoken answers; there is no typed user content in any shipped game).

**Flow (DECIDED):**
1. **Affordance.** Long-press (≥ 500ms) on any card/prompt surface in any game opens a small action sheet: "Report this card" + (where applicable) "Skip." 44pt target, reduced-motion-safe, available at every tier.
2. **Payload (anonymous, content-keyed):**
   ```ts
   POST /report   // mobile §8 report endpoint; NOT the DO, no room state
   {
     contentId: string,          // prompt.id / item.id / pack-relative card id — already on-device in the view
     packId: string, packVersion: number,
     gameId: string, configId: string,
     locale: 'fr'|'en',
     category: 'hate' | 'sexual-minor' | 'harassment' | 'self-harm' | 'real-person' | 'broken' | 'other',
     // NEVER: nickname, playerId, room transcript, spoken-answer content (off-platform)
   }
   ```
   The report carries the **content id and pack coordinates only** — never player identity, never the room's spoken answers (which are off-platform and unmoderatable by construction). This preserves anonymous-forever and gives content-ops exactly the key they need to act.
3. **Client feedback.** Optimistic "Thanks — we'll review this card." No moderation happens in the room; the report is a content-ops signal.
4. **Triage.** Reports aggregate per `contentId`; a per-card report-rate threshold (content-ops alert) flags the card for the kill-switch. High-severity categories (`sexual-minor`, `hate`) page immediately.

### 7.2 The KV content kill-switch (deploy-free, region-wide) — synthesis §3.2

Two granularities, both **one KV edit, no deploy**, both region-wide, both safe mid-game (live rooms finish on their pinned pack version; only NEW rooms see the change — template-arch §4.3, replay determinism).

| Granularity | Mechanism | Effect | Use when |
|---|---|---|---|
| **Whole tile** | `enabled:false` on the `game_config` | Tile hidden + `startGame` → `UNKNOWN_GAME` | A whole game/pack is compromised, or a legal pull |
| **Single card** (NEW, decided here) | `contentPackRef.blocklist: string[]` — array of `contentId`s in the catalog entry | The shell omits blocklisted ids when handing the pack to `init`; the card never appears in any new room, **no pack re-publish** | One bad card surfaces via reports |
| **Region** | `spicyFeatureFlag` per-region + region suppression list | Spicy/alcohol tile suppressed in a region | Stricter market or a regional legal event |
| **Pack rollback** | bump `contentPackRef.version` to a known-good pack | New rooms draw the prior good pack | A whole pack version is bad |

**Why the per-card `blocklist` is the right primitive (decided):** publishing a new pack version to remove one card is slow (R2 upload + version bump + locale parity), whereas a viral bad card needs *seconds* to pull. The `blocklist` lives in the same KV `client-config` the shell already serves at `/config` (cached `max-age=60`, so propagation is ≤ ~60s edge-wide). The shell applies it at `init` (it already filters the pack), so it is deterministic and replay-safe: a room that already started keeps its pinned content (it can't retroactively change a running game's seed-shuffled deck without breaking replay), but no new room ever draws the card. This is the missing operational piece between "pull the whole tile" (too coarse) and "republish the pack" (too slow), and it directly answers "pulling a bad card region-wide without deploy."

**Determinism note:** the blocklist is applied as a *filter on the pack content before `init` consumes it*, and the resolved `{packId, version, blocklist}` is pinned into `RoomMeta` alongside the seed — so rehydration/replay feeds the identical filtered content. The blocklist is part of the room's pinned content identity, exactly like the pack version (synthesis §3.2 replay rule).

---

## 8. A11y conformance (brand a11y rules, applied to this domain)

Every surface this domain introduces (age-gate modal, pack lock screen, report action sheet, spicy badge, lobby footer) conforms to the brand a11y rules (mobile §A11y / brand book):
- **WCAG-AA contrast** (4.5:1 body / 3:1 large) — spicy badges and the age-gate modal use the token contrast helper + CI lint (mobile §530); the coral CTA on cream and the spicy badge both pass.
- **44pt touch targets** — the long-press report target, the age-gate confirm, the rewarded/pass buttons all meet 44pt minimum.
- **Reduced-motion** — the age-gate and unlock celebrations honor `AccessibilityInfo.isReduceMotionEnabled` (springs → 120ms fade, ConfettiBurst suppressed); the spicy-unlock has no motion-dependent meaning.
- **Spicy content age-gated** — per the brand a11y bullet, satisfied by §4.
- **Long-press to report** — per the brand a11y bullet, satisfied by §7.1.
- **Copy register** — all gate/lock/report copy is deadpan/lowercase per voice-guide §1.8, never coy, never hype.

---

## 9. Implementation surface (what actually gets built)

This domain is overwhelmingly **config + content-ops + 3 small client surfaces**; it requires **zero reducer/contract changes**.

| Piece | Where | New code? |
|---|---|---|
| `gameConfigSchema` `tone`/`minAge`/`enabled`/`rolloutPct` + `spicy ⇒ minAge≥18` refine | `packages/protocol` (template-arch §2) | **Already specced** — confirm shipped |
| `contentPackRef.blocklist: string[]` + shell `init`-time filter + pin into `RoomMeta` | `packages/protocol` + `apps/server` shell (§5/§7 of server-shell) | **Small additive** (one field + one filter + one pin) — the only server change |
| Age-gate modal + device flag (`ageAttested`/`attestedMinAge`) | Expo client | New client surface |
| Pack lock screen (rewarded-video / Night-Pass) | Expo client + AdMob rewarded + IAP | New client surface |
| Long-press report action sheet → `/report` | Expo client + existing report endpoint | New client surface (endpoint exists, mobile §8) |
| HARD-FLOOR lint + alcohol-excess lint + adversarial check | offline AI/authoring pipeline | Pipeline rules (per-game §6 gates — generalize to one shared lint module) |
| Sibling `game_config` entries + spicy pack ids | KV catalog + R2 | Content-ops, zero code |

---

## Open product calls (with my recommendation)

These genuinely need a human (legal/product), not an engineer. Each carries my recommendation.

1. **DOB entry vs binary "I'm 18+" for the age gate.** *Recommendation:* **DOB entry** (Apple's preferred 18+ pattern, lower review risk), but stored only as a derived boolean on-device, DOB itself discarded immediately. Binary is acceptable if legal confirms it for the target storefronts; default to DOB.
2. **Final product+legal sign-off to flip the 4 launch 18+ tiles `enabled:true`** (`truth-or-dare-lover`, `truth-or-drink`, `pires-potes` flagship, `devine-l-action-spicy`). *Recommendation:* ship all four `enabled:false` behind `spicyFeatureFlag` default-OFF at launch; flip per-tile after the storefront-rating verification + legal sign-off, staged `rolloutPct 5→100`. This is a checklist gate, not a code gate.
3. **Storefront age-rating strategy** — whether to take the app-wide rating bump that any spicy tile forces, vs shipping a separate 18+ build/storefront. *Recommendation:* single app with the rating bump + on-device gate (simplest, anonymous-friendly); the gate keeps spicy content genuinely behind attestation for reviewers. Verify per-storefront before building spicy packs.
4. **Night Pass scope & price confirmation (£1.99).** *Recommendation:* keep £1.99 device-local entitlement = all-spicy-unlock + interstitial-removal-for-the-window, per brand book. Confirm whether the interstitial removal is session-scoped or 24h-scoped — I recommend a **24h "night" window** (matches the name and the party-night use-case) over a permanent removal (which would erode the ads-only base).
5. **`minAge 17` for `trouvez-la-regle-spicy`** — whether a 17 (not 18) floor is worth the catalog/store complexity for one tier-1 social-rules sibling. *Recommendation:* **defer it to demand-gated v2** and, if built, reconsider collapsing it to either a no-gate opt-in (like `devine-la-question-spicy`) or a full 18+ — a lone `minAge 17` tier is operational overhead for marginal differentiation.
6. **Region suppression list for alcohol** — which markets get the drink tile suppressed. *Recommendation:* legal to provide the initial strict-market list (e.g. markets with explicit in-app alcohol-content restrictions); engineering ships the `spicyFeatureFlag` + region-suppression machinery now so the list is a KV edit, not a release.
